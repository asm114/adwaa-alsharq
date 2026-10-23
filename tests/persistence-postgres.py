"""Run only against an ephemeral, network-isolated local Docker Postgres container.
Usage: python tests/persistence-postgres.py --container adwaa-maintenance-db-20261023
No Supabase URL, production credential, or external database is accepted.
"""
import argparse
import concurrent.futures
import json
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--container', required=True)
args = parser.parse_args()
assert args.container.startswith('adwaa-maintenance-db-')
env = {k: v for k, v in os.environ.items() if k not in ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH']}
docker = ['docker', '--host=unix:///var/run/docker.sock']
network = subprocess.check_output(docker + ['inspect', '--format', '{{.HostConfig.NetworkMode}}', args.container], env=env, text=True).strip()
assert network == 'none', 'Refusing a database container with network access'


def sql(text, success=True):
    r = subprocess.run(docker + ['exec', '-i', args.container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-qAt', '-U', 'postgres'], input=text, text=True, capture_output=True, env=env, timeout=20)
    if success:
        assert r.returncode == 0, r.stderr
    else:
        assert r.returncode != 0, 'Expected permission denial'
    return r.stdout.strip()


sql("""
create role anon nologin;
create role authenticated nologin;
create schema auth;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
grant usage on schema auth to authenticated;
grant execute on function auth.jwt() to authenticated;
create publication supabase_realtime;
""")
for name in ['20260818135222_staging_app_state.sql', '20260818141102_optimize_app_state_rls.sql']:
    sql((ROOT / 'supabase/migrations' / name).read_text())
seed = '{"bookings":[{"id":"synthetic-booking","paid":500,"total":1200}],"expenses":[],"seq":2}'
sql("insert into app_state(id,data,updated_at) values ('main','" + seed + "','2026-10-23 00:00:00+00');")
manager = "set role authenticated; set request.jwt.claims='{" + '"email":"asm114@hotmail.com"' + "}';"
other = "set role authenticated; set request.jwt.claims='{" + '"email":"unauthorized@isolated.test"' + "}';"
sql('set role anon; select * from app_state;', success=False)
assert sql(other + 'select count(*) from app_state;') == '0'
assert sql(other + "with changed as (update app_state set data='{}' where id='main' returning id) select count(*) from changed;") == '0'
sql(other + "insert into app_state(id,data) values('forbidden','{}');", success=False)
assert sql(manager + 'select count(*) from app_state;') == '1'
sql(manager + "delete from app_state where id='main';", success=False)
# Both sessions read the same revision. Postgres rechecks the predicate after waiting for a lock.
def race(index):
    return sql(manager + "begin; with changed as (update app_state set data=jsonb_set(data,'{winner}','" + str(index) + "'),updated_at='2026-10-23 00:00:00.001+00' where id='main' and updated_at='2026-10-23 00:00:00+00' returning id) select count(*) from changed; select pg_sleep(0.2); commit;").splitlines()[0]

with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    results = sorted(pool.map(race, [1, 2]))
assert results == ['0', '1'], results
assert sql(manager + "select data->'bookings'->0->>'paid' from app_state where id='main';") == '500'
assert sql(manager + "select data->>'seq' from app_state where id='main';") == '2'
print(json.dumps({'result': 'PASS', 'engine': 'PostgreSQL 17', 'checks': ['real concurrent CAS: one winner', 'anon denied', 'other authenticated identity cannot read/update/insert', 'manager allowed', 'delete denied', 'payments/sequence unchanged'], 'production_access': False}))
