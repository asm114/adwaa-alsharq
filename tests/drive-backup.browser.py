"""Drive + Supabase failure isolation in real engines; all services synthetic/intercepted."""
import argparse,json,os,runpy
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
fixture=runpy.run_path(str(ROOT/'tests/save-confirmation.browser.py'))
MOCK=r"""() => {
 window.DriveQA={files:{},generated:0,uploads:0,failReply:false,failNetwork:false,hideIndex:false,denied:0};
 googleDriveAccessToken='synthetic-drive-token';googleDriveTokenExpiresAt=Date.now()+3600000;
 saveGoogleDriveState({folderId:'synthetic-folder'});
 window.fetch=async(url,options={})=>{
   if(!String(url).startsWith('https://www.googleapis.com/'))throw Error('Blocked non-Google fixture request');
   if(DriveQA.failNetwork)throw new TypeError('Load failed');
   const u=new URL(url),reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
   if(DriveQA.denied)return reply({},DriveQA.denied);
   if(u.pathname.endsWith('/generateIds'))return reply({ids:['synthetic-file-'+(++DriveQA.generated)]});
   if(u.pathname.includes('/upload/')){
     const raw=await options.body.text();
     const metadata=JSON.parse(raw.match(/\r\n\r\n({[^\r\n]+})\r\n/)[1]);
     const content=raw.split('Content-Type: application/json\r\n\r\n')[1].split('\r\n--')[0];
     if(DriveQA.files[metadata.id])return reply({},409);
     DriveQA.files[metadata.id]={id:metadata.id,name:metadata.name,size:String(new Blob([content]).size),appProperties:metadata.appProperties};
     DriveQA.uploads++;
     if(DriveQA.failReply){DriveQA.failReply=false;throw new TypeError('Load failed')}
     return reply(DriveQA.files[metadata.id]);
   }
   const id=u.pathname.split('/').pop();
   if(id==='synthetic-folder')return reply({id,name:'Synthetic Backup Folder'});
   if(id==='files'){
     const q=u.searchParams.get('q')||'';
     return reply({files:DriveQA.hideIndex?[]:Object.values(DriveQA.files).filter(f=>q.includes(f.appProperties.recoveryId))});
   }
   return reply(DriveQA.files[id]||{},DriveQA.files[id]?200:404);
 };
} """

def run(browser,engine,width,height):
    context=browser.new_context(viewport={'width':width,'height':height},has_touch=True,service_workers='block')
    context.route('**/*',fixture['route'])
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
    # Deadline shortened in the intercepted test clock only.
    page.add_init_script('const realTimeout=window.setTimeout;window.setTimeout=(f,ms,...args)=>realTimeout(f,ms===12000?150:ms,...args)')
    page.goto('https://qa.invalid/index.html')
    page.wait_for_function('remoteReady && currentUser && window.__adwaaBackupFlowReliabilityInstalled')
    page.evaluate("async()=>{await AdwaaLocalVault.create('synthetic backup recovery phrase');db.cleaningTasks=[{id:'orphan-test',bookingId:'absent-synthetic-booking',status:'done'}];switchView('dataProtection')}")
    page.evaluate(MOCK)
    print('fixture ready',flush=True)
    # Drive commits despite failed Supabase metadata; never mislabel upload as failed.
    page.evaluate('QA.fail=true;DriveQA.failReply=true;DriveQA.hideIndex=true')
    result=page.evaluate("async()=>{window.syntheticBackup=await createBackup('يدوي',{downloadFile:false,silent:true});return {stored:syntheticBackup.stored,metadata:syntheticBackup.metadataSync.ok,drive:syntheticBackup.cloudResult.ok}}")
    print('first backup complete',flush=True)
    assert result=={'stored':True,'metadata':False,'drive':True},result
    assert page.evaluate('DriveQA.uploads')==1
    assert page.evaluate('inspectBackupRelationships(db).warnings.some(x=>x.includes("absent-synthetic-booking"))')
    # Simulate reload of the in-memory id map; encrypted backup retains the same allocated ID.
    page.evaluate('googleDriveStableIds.clear()')
    assert page.evaluate('retryLatestGoogleDriveBackup().then(r=>r.ok)') is True
    assert page.evaluate('DriveQA.uploads')==1
    assert page.evaluate('DriveQA.generated')==1
    page.evaluate('QA.fail=false;DriveQA.failNetwork=true')
    result=page.evaluate("async()=>{const r=await createBackup('يدوي',{downloadFile:false,silent:true});window.secondBackup=r;return {local:r.stored,metadata:r.metadataSync.ok,drive:r.cloudResult.ok,error:r.cloudResult.error}}")
    assert result['local'] and result['metadata'] and not result['drive'],result
    assert 'Google Drive' in result['error'] and 'Load failed' not in result['error']
    page.evaluate('DriveQA.failNetwork=false')
    assert page.evaluate('retryLatestGoogleDriveBackup().then(r=>r.ok)') is True
    assert page.evaluate('DriveQA.uploads')==2
    # Repeated presses reuse one in-flight upload, never launch a duplicate.
    result=page.evaluate('async()=>{const r=await activeDataProtectionProvider().get(secondBackup.id);return (await Promise.all([syncBackupToGoogleDrive(r),syncBackupToGoogleDrive(r)])).map(x=>({ok:x.ok,busy:!!x.busy}))}')
    assert sum(1 for r in result if r['ok'])==1 and any(r['busy'] for r in result),result
    assert page.evaluate('DriveQA.uploads')==2
    print('retry and duplicate checks complete',flush=True)
    # A hanging Drive response cannot leave the UI busy forever.
    page.evaluate('()=>{window.fetch=()=>new Promise(()=>{})}')
    result=page.evaluate('retryLatestGoogleDriveBackup()')
    assert result['ok'] is False and page.evaluate('googleDriveUploadInProgress') is False
    page.evaluate(MOCK)
    # Quota/permission denial does not erase the valid token; 401 does.
    page.evaluate('DriveQA.denied=403')
    assert page.evaluate("googleDriveFetch('https://www.googleapis.com/drive/v3/files').catch(e=>e.status)")==403
    assert page.evaluate('googleDriveSessionActive()') is True
    page.evaluate('DriveQA.denied=401')
    assert page.evaluate("googleDriveFetch('https://www.googleapis.com/drive/v3/files').catch(e=>e.code)")=='DRIVE_AUTH_REQUIRED'
    assert page.evaluate('googleDriveSessionActive()') is False
    print('network/auth refusal checks complete',flush=True)
    # Explicit user-driven reconnect requests a new token, never localStorage.
    page.evaluate("window.google={accounts:{oauth2:{hasGrantedAllScopes:()=>true,initTokenClient:opts=>({requestAccessToken:()=>opts.callback({access_token:'synthetic-renewed',expires_in:3600})})}}}")
    assert page.evaluate('requestGoogleDriveAccessToken()') is True
    assert page.evaluate('googleDriveSessionActive()') is True
    assert page.evaluate("!Object.values(localStorage).some(x=>String(x).includes('synthetic-renewed')||String(x).includes('synthetic-drive-token'))")
    page.evaluate("window.showDirectoryPicker=undefined;renderBackupManagement();selectBackupDirectory();openBackupDirectory()")
    assert 'الملفات' in page.locator('#backupOperationMessage').inner_text()
    assert page.locator('#changeBackupDirectoryButton').is_hidden()
    print('renewal/files guidance complete',flush=True)
    # Cancellation of the native share sheet is not a save confirmation.
    page.evaluate("()=>{Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});Object.defineProperty(navigator,'share',{configurable:true,value:async()=>{throw new DOMException('canceled','AbortError')}})}")
    page.evaluate('shareLatestBackupFile()')
    assert 'أُلغيت' in page.locator('#backupOperationMessage').inner_text()
    # Download invocation is not filesystem confirmation.
    with page.expect_download() as download_info:
        result=page.evaluate("async()=>{const r=await createBackup('يدوي',{downloadFile:true,silent:true,preferDirectory:false});return {requested:r.downloadRequested,saved:r.fileSaved}}")
    assert result=={'requested':True,'saved':False},result
    assert download_info.value.suggested_filename.endswith('.json')
    assert page.evaluate('db.cleaningTasks[0].id')=='orphan-test'
    page.evaluate("()=>{window.google.accounts.oauth2.initTokenClient=opts=>({requestAccessToken:()=>{window.lateDriveToken=opts.callback}});window.pendingDriveAuth=requestGoogleDriveAccessToken().then(()=>false,()=>true)}")
    page.evaluate("()=>{showLogin();lateDriveToken({access_token:'synthetic-late',expires_in:3600})}")
    assert page.evaluate('pendingDriveAuth') is True
    assert page.evaluate('googleDriveSessionActive()') is False
    assert not errors,errors
    print(json.dumps({'engine':engine,'viewport':[width,height],'result':'PASS','checks':'separate Drive/metadata/local/download outcomes; lost commit reply and stale index; persisted id retry; duplicate presses; timeout; 401/403; explicit token renewal; iPad Files guidance; orphan preserved'}),flush=True)
    context.close()

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--engine',choices=['chromium','webkit'],required=True);args=parser.parse_args()
    with sync_playwright() as p:
        browser=p.webkit.launch(executable_path=os.getenv('WEBKIT_PATH')) if args.engine=='webkit' else p.chromium.launch(executable_path=os.getenv('CHROMIUM_PATH') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').is_file() else None),args=['--no-sandbox'])
        for width,height in [(768,1024),(1024,768)]:run(browser,args.engine,width,height)
        browser.close()
