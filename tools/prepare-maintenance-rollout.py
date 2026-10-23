"""Generate review-only rollout artifacts locally. Never connects to a database."""
import argparse
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
REVOKE='REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.app_state FROM PUBLIC, anon, authenticated;'

def build():
    source=(ROOT/'docs/maintenance-server-guard-proposal.sql').read_text()
    assert source.count(REVOKE)==1
    prefix=source.split('CREATE FUNCTION public.adwaa_cas_write_app_state_v1(',1)[0]
    body=source.split('AS $$',1)[1].split('$$;',1)[0]
    literal="'"+body.replace("'","''")+"'"
    verification="""DO $verified$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc AS function
    WHERE function.oid=to_regprocedure('public.adwaa_cas_write_app_state_v1(timestamptz,jsonb)')
      AND function.prosrc = BODY_LITERAL
      AND function.prosecdef
      AND function.proconfig = ARRAY['search_path=pg_catalog']::text[]
      AND function.proowner=(SELECT relowner FROM pg_class WHERE oid='public.app_state'::regclass)
      AND NOT has_function_privilege('anon',function.oid,'EXECUTE')
      AND has_function_privilege('authenticated',function.oid,'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'Prepared CAS function differs from the reviewed artifact; stop cutover';
  END IF;
END;
$verified$;
""".replace('BODY_LITERAL',literal)
    return {
        '01-prepare.sql':source.replace(REVOKE,'-- Preparation only: keep direct CAS available until all clients are updated.'),
        '02-enforce.sql':prefix+verification+REVOKE+"\nNOTIFY pgrst, 'reload schema';\nCOMMIT;\n",
        '03-rollback.sql':(ROOT/'docs/maintenance-server-guard-rollback.sql').read_text()
    }

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-directory',type=Path,required=True)
    args=parser.parse_args();args.output_directory.mkdir(parents=True,exist_ok=True)
    for name,text in build().items():
        # Refuse overwriting a previously reviewed artifact.
        with (args.output_directory/name).open('x') as out:out.write(text)
    print('Generated 3 review-only SQL artifacts; nothing applied.')
