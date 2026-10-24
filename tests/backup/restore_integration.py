"""Real PG dump, encryption, independent restore; every row invented, no network."""
import importlib.util,io,json,os,subprocess,tempfile,uuid,base64,time
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
    CREATE TABLE app_state(id text primary key,data jsonb);INSERT INTO app_state VALUES('main','{"seq":131,"bookings":[{"id":"old","total":1200,"paid":500}]}');
    CREATE TABLE reservations(id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,total numeric,paid numeric); INSERT INTO reservations(total,paid) VALUES(1200,500),(900,900);
    CREATE TABLE payments(id integer primary key,reservation_id integer REFERENCES reservations(id),amount numeric); INSERT INTO payments VALUES(1,1,500),(2,2,900);
    CREATE TABLE expenses(id integer primary key,amount numeric);INSERT INTO expenses VALUES(1,300);
    CREATE TABLE maintenance(id integer primary key,total numeric,paid numeric);INSERT INTO maintenance VALUES(1,1200,700);
    CREATE TABLE commissions(id integer primary key,due numeric,received numeric);INSERT INTO commissions VALUES(1,180,80);
    ALTER TABLE reservations ENABLE ROW LEVEL SECURITY; CREATE POLICY manager_only ON reservations TO authenticated USING (false);GRANT SELECT ON reservations TO authenticated;
    SELECT setval('reservations_id_seq',40,true);SELECT lo_from_bytea(90001,decode('0102030405','hex'));''')
    conn=FixtureConnection();verification=b.snapshot(conn)
    backup_id='20261024T000000Z-'+uuid.uuid4().hex;verification.update(project=b.PROJECT,backup_id=backup_id,storage_files_included=False)
    os.environ['BACKUP_ENCRYPTION_KEY']=base64.b64encode(os.urandom(32)).decode();os.environ['BACKUP_RESTORE_IMAGE']=b.IMAGE
    with tempfile.TemporaryDirectory() as d:
        for part,command in [('database',['pg_dump','-U','postgres','-Fc','postgres']),('roles',['pg_dumpall','-U','postgres','--roles-only','--no-role-passwords'])]:
            dump=b.docker(['exec',name]+command).stdout
            b.seal(io.BytesIO(dump),Path(d)/(part+'.enc'),b.key(),b.PROJECT+'/'+backup_id+'/'+part)
        b.seal(io.BytesIO(json.dumps(verification).encode()),Path(d)/'verification.enc',b.key(),b.PROJECT+'/'+backup_id+'/verification')
        manifest={'project':b.PROJECT,'format':1,'backup_id':backup_id,'files':{p:b.digest(Path(d)/(p+'.enc')) for p in b.PARTS}}
        result=b.isolated_restore(d,manifest);assert result['restore_verified'] is True
        assert sql('SELECT last_value FROM reservations_id_seq').strip()==b'40'
        assert b.snapshot(conn)=={k:v for k,v in verification.items() if k not in ['project','backup_id','storage_files_included']}
        print(json.dumps({'synthetic_independent_restore':'PASS','tables':len(verification['tables']),'production_access':False,'checks':['encrypted dump and roles','owners, RLS and ACL','old and new bookings, payments, expenses, installments, commissions','all row fingerprints and sequences equal; source unchanged']}))
finally:b.docker(['rm','-f',name])
