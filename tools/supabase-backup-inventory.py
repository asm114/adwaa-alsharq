"""Read-only backup metadata inventory for the explicitly scoped production project.
Requires SUPABASE_ACCESS_TOKEN configured securely. Never downloads or restores data.
"""
import json,os,sys
from urllib.error import HTTPError,URLError
from urllib.request import Request,build_opener,HTTPRedirectHandler
ENDPOINT='https://api.supabase.com/v1/projects/pgdvlklpyrvmwzitsmbw/database/backups'
class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None

def inventory(token,opener=None):
    unknown={'backup_inventory_verified':False,'backup_configuration_verified':False,'restore_verified':False}
    if not token:return {**unknown,'blocked':'management_access_token_missing'}
    opener=opener or build_opener(NoRedirect())
    request=Request(ENDPOINT,headers={'Authorization':'Bearer '+token,'Accept':'application/json'},method='GET')
    try:
        with opener.open(request,timeout=20) as response:
            raw=response.read(2_000_001)
        if len(raw)>2_000_000:return {**unknown,'blocked':'metadata_response_too_large'}
        data=json.loads(raw)
        if not isinstance(data,dict) or not isinstance(data.get('backups'),list):
            return {**unknown,'blocked':'unrecognized_metadata_schema'}
        # Never emit signed URLs, access tokens, database credentials or backup contents.
        result={'backup_inventory_verified':True,'backup_configuration_verified':all(isinstance(data.get(k),bool) for k in ['pitr_enabled','physical_backup_enabled']),'restore_verified':False,'backup_count':len(data['backups'])}
        for name in ['pitr_enabled','physical_backup_enabled']:
            if isinstance(data.get(name),bool):result[name]=data[name]
        result['backups']=[{k:v for k,v in row.items() if k in ['id','status','inserted_at','updated_at','date','is_physical_backup'] and isinstance(v,(str,int,bool))} for row in data['backups'] if isinstance(row,dict)]
        return result
    except HTTPError as error:return {**unknown,'blocked':'management_api_http_error','http_status':error.code}
    except (URLError,TimeoutError,OSError,ValueError):return {**unknown,'blocked':'metadata_request_failed'}

if __name__=='__main__':
    result=inventory(os.environ.get('SUPABASE_ACCESS_TOKEN'))
    print(json.dumps(result))
    sys.exit(0 if result['backup_inventory_verified'] else 2)
