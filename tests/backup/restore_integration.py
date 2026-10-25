"""Real PG dump, encryption, independent restore; every row invented, no network."""
import importlib.util,io,json,os,subprocess,tempfile,uuid,base64,time
from unittest.mock import patch
from test_drive_store import Service,Download,EMAIL,FOLDER
import drive_store
import storage_source
from test_storage_source import Response
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('backup',ROOT/'tools/backup/backup.py');b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
name='adwaa-backup-source-'+uuid.uuid4().hex[:12]
def sql(query):return b.docker(['exec','-i',name,'psql','-h','127.0.0.1','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],input=query.encode()).stdout
class Result:
    def __init__(self,rows):self.rows=rows
    def fetchone(self):return self.rows[0]
    def fetchall(self):return self.rows
class Copy:
    def __init__(self,query):self.data=sql(query)
    def __enter__(self):return [self.data]
    def __exit__(self,*args):pass
class FixtureConnection:
    def __enter__(self):return self
    def __exit__(self,*args):pass
    def execute(self,query,params=None):
        if params:
            for value in params:query=query.replace('%s',str(int(value)),1)
        rows=json.loads(sql('SELECT coalesce(json_agg(row_to_json(t)),\'[]\'::json) FROM ('+query+') t'))
        if query.startswith('SELECT lo_get('):return Result([(bytes.fromhex(row[next(iter(row))][2:]),) for row in rows])
        return Result([tuple(row.values()) for row in rows])
    def cursor(self):return self
    def copy(self,query):return Copy(query)
b.docker(['run','--rm','-d','--network','none','--tmpfs','/var/lib/postgresql/data','-e','POSTGRES_HOST_AUTH_METHOD=trust','--name',name,b.IMAGE])
try:
    for _ in range(60):
        ready=subprocess.run(['docker','--host=unix:///var/run/docker.sock','exec',name,'pg_isready','-h','127.0.0.1','-U','postgres'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0
        if ready:break
        time.sleep(.5)
    assert ready
    sql('''CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
    CREATE TABLE app_state(id text primary key,data jsonb);INSERT INTO app_state VALUES('main','{"seq":131,"bookings":[{"id":"old","total":1200,"paid":500}],"expenses":[{"id":"json-expense","amount":50}],"maintenance":[{"id":"json-maintenance","total":200}],"subscriptions":[{"id":"json-sub","total":800}],"installmentPurchases":[{"id":"json-plan","total":600}],"customers":[{"id":"json-customer","name":"synthetic"}],"commissions":[{"id":"json-commission","amount":30}]}');
    CREATE TABLE reservations(id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,total numeric,paid numeric); INSERT INTO reservations(total,paid) VALUES(1200,500),(900,900);
    CREATE TABLE payments(id integer primary key,reservation_id integer REFERENCES reservations(id),amount numeric); INSERT INTO payments VALUES(1,1,500),(2,2,900);
    CREATE TABLE expenses(id integer primary key,amount numeric);INSERT INTO expenses VALUES(1,300);
    CREATE TABLE maintenance(id integer primary key,total numeric,paid numeric);INSERT INTO maintenance VALUES(1,1200,700);
    CREATE TABLE commissions(id integer primary key,due numeric,received numeric);INSERT INTO commissions VALUES(1,180,80);
    CREATE TABLE customers(id text primary key,name text);INSERT INTO customers VALUES('synthetic-customer','Invented Customer');
    CREATE TABLE subscriptions(id text primary key,customer_id text REFERENCES customers(id),total numeric);INSERT INTO subscriptions VALUES('synthetic-sub','synthetic-customer',800);
    CREATE TABLE installments(id text primary key,customer_id text REFERENCES customers(id),total numeric,paid numeric);INSERT INTO installments VALUES('synthetic-plan','synthetic-customer',600,100);
    CREATE TABLE empty_history(id integer primary key);
    CREATE SCHEMA private_finance;CREATE TABLE private_finance.ledger(id integer primary key,amount numeric);INSERT INTO private_finance.ledger VALUES(1,75);
    ALTER TABLE reservations ENABLE ROW LEVEL SECURITY; CREATE POLICY manager_only ON reservations TO authenticated USING (false);GRANT SELECT ON reservations TO authenticated;
    SELECT setval('reservations_id_seq',40,true);SELECT lo_from_bytea(90001,decode('0102030405','hex'));''')
    if b.PROJECT=='ztqqdjryvecscidxxbfe':
        sql("CREATE TABLE customer_portal_resort_info(id text primary key);INSERT INTO customer_portal_resort_info VALUES('main');CREATE TABLE customer_portal_unavailable_periods(id text primary key);CREATE TABLE customer_portal_admins(id text primary key);")
    sql("CREATE SCHEMA storage;CREATE TABLE storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types jsonb);CREATE TABLE storage.objects(id text primary key,bucket_id text REFERENCES storage.buckets(id),name text,version text,updated_at text,metadata jsonb);")
    sql("INSERT INTO storage.buckets VALUES('private','private',false,null,null),('public','public',true,null,null),('empty-bucket','empty-bucket',false,null,null);")
    object_data={('private','مرفق %.bin'):b'private synthetic content',('public','nested/empty'):b'',('public','large.bin'):b'invented object bytes'*100000}
    for i,((bucket,path),payload) in enumerate(object_data.items()):
        literal=lambda value:"'"+value.replace("'","''")+"'"
        sql("INSERT INTO storage.objects VALUES("+','.join(literal(x) for x in [str(i),bucket,path,'v1','2026-10-25T00:00:00Z',json.dumps({'size':len(payload)})])+"::jsonb);")
    conn=FixtureConnection();verification=b.snapshot(conn)
    expected={('public',n) for n in ['app_state','reservations','payments','expenses','maintenance','commissions','customers','subscriptions','installments','empty_history']}|{('private_finance','ledger')}
    expected|={('storage','buckets'),('storage','objects')}
    if b.PROJECT=='ztqqdjryvecscidxxbfe':expected|={('public',t) for t in ['customer_portal_resort_info','customer_portal_unavailable_periods','customer_portal_admins']}
    assert {(t['schema'],t['name']) for t in verification['tables']}==expected
    assert next(t['rows'] for t in verification['tables'] if t['name']=='empty_history')==0
    assert sql('SELECT sum(amount) FROM payments').strip()==b'1400'
    assert sql('SELECT sum(total-paid) FROM installments').strip()==b'500'
    backup_id='20261024T000000Z-'+uuid.uuid4().hex;verification.update(project=b.PROJECT,backup_id=backup_id,storage_files_included=True)
    os.environ['BACKUP_ENCRYPTION_KEY']=base64.b64encode(os.urandom(32)).decode();os.environ['BACKUP_RESTORE_IMAGE']=b.IMAGE
    os.environ['BACKUP_CONFIRMED_PROJECT_REF']=b.PROJECT;os.environ['BACKUP_STORAGE_API_KEY']='sb_secret_synthetic-integration-only'
    with tempfile.TemporaryDirectory() as d:
        for part,command in [('database',['pg_dump','-U','postgres','-Fc','postgres']),('roles',['pg_dumpall','-U','postgres','--roles-only','--no-role-passwords'])]:
            dump=b.docker(['exec',name]+command).stdout
            b.seal(io.BytesIO(dump),Path(d)/(part+'.enc'),b.key(),b.PROJECT+'/'+backup_id+'/'+part)
        from urllib.parse import quote
        origin='https://'+b.PROJECT+'.supabase.co/storage/v1/'
        responses={origin+'object/authenticated/'+bucket+'/'+quote(path,safe='/'):data for (bucket,path),data in object_data.items()}
        buckets=storage_source.inventory(conn)['buckets']
        def get(url,**kwargs):
            assert url.startswith(origin) and kwargs['allow_redirects'] is False
            return Response(json.dumps(buckets).encode() if url==origin+'bucket' else responses[url])
        with patch.object(storage_source.requests.Session,'get',side_effect=get),patch.object(b,'source_connection',return_value=conn):
            verification['storage']=storage_source.capture(b,conn,Path(d)/'storage.enc',b.key(),b.PROJECT+'/'+backup_id+'/storage')
        b.seal(io.BytesIO(json.dumps(verification).encode()),Path(d)/'verification.enc',b.key(),b.PROJECT+'/'+backup_id+'/verification')
        manifest={'project':b.PROJECT,'format':2,'backup_id':backup_id,'files':{p:b.digest(Path(d)/(p+'.enc')) for p in b.FULL_PARTS}}
        # Round-trip the actual encrypted fixture through the Drive transport
        # double, then restore exactly the downloaded files with real PostgreSQL.
        service=Service();store=drive_store.DriveStore(service,FOLDER,EMAIL,10000000)
        for part in b.FULL_PARTS:store.upload_file(str(Path(d)/(part+'.enc')),FOLDER,b.PREFIX+backup_id+'/'+part+'.enc')
        store.put_object(Bucket=FOLDER,Key=b.PREFIX+backup_id+'/complete.json',Body=json.dumps(manifest).encode())
        for part in b.FULL_PARTS:Path(d,part+'.enc').unlink()
        with patch.object(drive_store,'MediaIoBaseDownload',Download):b.fetch_committed(store,FOLDER,EMAIL,manifest,d)
        assert service.payloads['legacy']==b'previous JSON' and service.deleted==[]
        result=b.isolated_restore(d,manifest);assert result['restore_verified'] is True
        assert result['storage_files_verified'] is True and result['storage_objects_verified']==3 and result['storage_buckets_verified']==3
        assert result['storage_service_restore_verified'] is False
        assert sql('SELECT last_value FROM reservations_id_seq').strip()==b'40'
        assert b.snapshot(conn)=={k:v for k,v in verification.items() if k not in ['project','backup_id','storage_files_included','storage']}
        print(json.dumps({'synthetic_independent_restore':'PASS','project_target':os.environ.get('BACKUP_TARGET','core'),'tables':len(verification['tables']),'storage_objects':result['storage_objects_verified'],'storage_buckets':result['storage_buckets_verified'],'storage_service_restore_verified':False,'production_access':False,'checks':['encrypted dump and roles via mocked Drive round-trip','owners, RLS and ACL','app_state JSON and relational customers, bookings, payments, expenses, maintenance, subscriptions, installments, commissions; empty and non-public tables','all row fingerprints and sequences equal; source unchanged','encrypted Storage contents reconstructed into isolated tmpfs and SHA-256 matched; mocked source HTTP and Drive, not live Supabase service recovery']}))
finally:b.docker(['rm','-f',name])
