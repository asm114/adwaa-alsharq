"""Disposable official Storage service: internal Docker network, RAM-only state.

No production connection, published ports, host volumes or configurable target URL.
The local service uses HTTP exclusively inside the private Docker network; hosted
Supabase still uses the separate HTTPS-only Sandbox implementation unchanged.
"""
import base64
from contextlib import contextmanager
import hashlib
import hmac
import ipaddress
import json
import secrets
import time
import uuid
import docker
import requests
from storage_api_restore import Sandbox,ApiRestoreError,need

STORAGE_IMAGE='supabase/storage-api@sha256:98ffec5d0678803783c30e404c27f4ec65e97efbe014088f2a86b4b8b54b9f54'
POSTGRES_IMAGE='postgres@sha256:858bb5e98eed02eb8cafbcdc007f9a65d1b613972028944a8ec2133ccaf80d27' # 17.11-bookworm

def jwt(secret,role):
    def encode(value):return base64.urlsafe_b64encode(value).decode().rstrip('=')
    message=encode(b'{"alg":"HS256","typ":"JWT"}')+'.'+encode(json.dumps({
        'role':role,'iss':'adwaa-isolated-storage-test','iat':int(time.time()),
        'exp':int(time.time())+3600},separators=(',',':')).encode())
    return message+'.'+encode(hmac.new(secret.encode(),message.encode(),hashlib.sha256).digest())

class LocalSandbox(Sandbox):
    def __init__(self,container,network,token):
        container.reload();network.reload()
        need(network.attrs.get('Internal') is True,'LOCAL_STORAGE_NETWORK_NOT_ISOLATED')
        attrs=container.attrs;host=attrs['HostConfig']
        need(not host.get('PortBindings') and not host.get('Binds') and
             host.get('LogConfig',{}).get('Type')=='none','LOCAL_STORAGE_UNSAFE_CONTAINER')
        endpoint=attrs['NetworkSettings']['Networks'].get(network.name,{})
        address=ipaddress.ip_address(endpoint.get('IPAddress',''))
        need(address.is_private and not address.is_loopback and address.version==4,
             'LOCAL_STORAGE_ADDRESS_INVALID')
        self.base='http://'+str(address)+':5000/'
        self.session=requests.Session();self.session.trust_env=False
        self.session.headers.update({'Authorization':'Bearer '+token,'apikey':token,'Accept-Encoding':'identity'})

@contextmanager
def service():
    client=docker.DockerClient(base_url='unix:///var/run/docker.sock')
    network=None;containers=[];sandbox=None
    try:
        # Pull only pinned/tested images, before creating the network. No data is
        # present yet. Registry access follows the daemon's configured proxy.
        client.images.pull(STORAGE_IMAGE);client.images.pull(POSTGRES_IMAGE)
        suffix=uuid.uuid4().hex;label={'adwaa.backup.test':suffix}
        network=client.networks.create('adwaa-storage-test-'+suffix,internal=True,labels=label)
        password=secrets.token_hex(32);secret=secrets.token_hex(32)
        common=dict(detach=True,network=network.name,labels=label,
                    log_config=docker.types.LogConfig(type='none'),
                    security_opt=['no-new-privileges:true'],mem_limit='1g',
                    ulimits=[docker.types.Ulimit(name='core',soft=0,hard=0)])
        database=client.containers.run(POSTGRES_IMAGE,name='adwaa-storage-db-'+suffix,
            environment={'POSTGRES_PASSWORD':password},
            tmpfs={'/var/lib/postgresql/data':'rw,nosuid,nodev,size=512m'},**common)
        containers.append(database)
        for _ in range(90):
            if database.exec_run(['pg_isready','-U','postgres']).exit_code==0:break
            time.sleep(1)
        else:raise ApiRestoreError('LOCAL_STORAGE_DATABASE_NOT_READY')
        api=client.containers.run(STORAGE_IMAGE,name='adwaa-storage-api-'+suffix,
            environment={'DATABASE_URL':'postgres://postgres:'+password+'@'+database.name+':5432/postgres',
                'AUTH_JWT_SECRET':secret,'ANON_KEY':jwt(secret,'anon'),
                'SERVICE_KEY':jwt(secret,'service_role'),'DB_INSTALL_ROLES':'true',
                'STORAGE_BACKEND':'file','FILE_STORAGE_BACKEND_PATH':'/var/lib/storage',
                'GLOBAL_S3_BUCKET':'isolated-test','TENANT_ID':'isolated-test','REGION':'local',
                'FILE_SIZE_LIMIT':'134217728','ENABLE_IMAGE_TRANSFORMATION':'false',
                'LOG_LEVEL':'silent','DB_MIGRATIONS_STRATEGY':'on_request',
                'VECTOR_STORE_MIGRATIONS_ENABLED':'false'},
            tmpfs={'/var/lib/storage':'rw,nosuid,nodev,size=256m,mode=1777'},**common)
        containers.append(api);sandbox=LocalSandbox(api,network,jwt(secret,'service_role'))
        for _ in range(90):
            try:
                response=sandbox.session.get(sandbox.base+'status',timeout=2,allow_redirects=False)
                ready=response.status_code==200;response.close()
                if ready:break
            except requests.RequestException:pass
            api.reload()
            need(api.status=='running','LOCAL_STORAGE_SERVICE_STOPPED')
            time.sleep(1)
        else:raise ApiRestoreError('LOCAL_STORAGE_SERVICE_NOT_READY')
        yield sandbox
    finally:
        if sandbox:sandbox.close()
        # Only resources created by this invocation, never a cloud project or
        # production container. Removing these containers destroys their tmpfs.
        for container in reversed(containers):
            try:container.remove(force=True,v=True)
            except docker.errors.NotFound:pass
        if network:network.remove()
        client.close()
