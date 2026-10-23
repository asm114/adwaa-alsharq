"""Build a static, isolated backup acceptance harness. Never deploys or reads live data."""
import argparse,ast,hashlib,json,re,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
FORBIDDEN=['pgdvlklpyrvmwzitsmbw','ztqqdjryvecscidxxbfe','supabase.co','sb_publishable_','sb_secret_']
def card(html,marker):
    start=html.index(marker);depth=0
    for tag in re.finditer(r'</?div\b[^>]*>',html[start:]):
        depth+=-1 if tag.group().startswith('</') else 1
        if depth==0:return html[start:start+tag.end()]
    raise ValueError('Unbalanced preview card')
def build(output):
    html=(ROOT/'index.html').read_text()
    sha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
    region=html[html.index('function openBackupVault('):html.index('function renderAuditLog(')]
    # Production folder discovery must never be used by the live test harness.
    assert region.count("key='adwaaBackupFolder'")==1
    region=region.replace('adwaaBackupFolder','adwaaMaintenanceTestFolder')
    region=region.replace("appProperties:{adwaaBackup:'true',", "appProperties:{adwaaMaintenancePreview:'pr164',adwaaBackup:'true',")
    region=region.replace("in parents and trashed=false", "in parents and trashed=false and appProperties has { key='adwaaMaintenancePreview' and value='pr164' }")
    constants='\n'.join(re.search(r'const '+name+r'=[^;]+;',html).group() for name in ['BACKUP_SCHEMA_VERSION','GOOGLE_DRIVE_CLIENT_ID','GOOGLE_DRIVE_SCOPE','GOOGLE_DRIVE_RESUMABLE_THRESHOLD','GOOGLE_DRIVE_CHUNK_SIZE'])
    tree=ast.parse((ROOT/'tests/drive-backup.browser.py').read_text())
    mock=next(ast.literal_eval(node.value) for node in tree.body if isinstance(node,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='MOCK' for t in node.targets))
    state={'bookings':[{'id':'synthetic-booking','code':'TEST-ONLY-1','name':'عميل مصطنع للاختبار','date':'2027-02-10','type':'يومي','total':1200,'paid':500,'payments':[{'id':'synthetic-payment','amount':500}],'photos':[]}], 'expenses':[],'cleaningTasks':[],'notifications':[],'auditLog':[],'backupHistory':[],'customerNotes':{},'settings':{},'seq':2}
    sdk=(ROOT/'tests/workspace-mock.js').read_text()
    a=sdk.index('const seed=');b=sdk.index('\nlet saved=',a)
    sdk=sdk[:a]+'const seed='+json.dumps(state,ensure_ascii=False)+';'+sdk[b:]
    sdk=sdk.replace('asm114@hotmail.com','preview-admin@isolated.invalid')
    boot=(ROOT/'tests/preview/backup-runtime.js').read_text().replace('__SYNTHETIC_STATE__',json.dumps(state,ensure_ascii=False)).replace('__SOURCE_SHA__',sha)
    files={'bootstrap.js':boot,'mock-sdk.js':sdk,'backup-core.js':re.search(r'function latestBackupRecord\(\)[^\n]+',html).group()+'\n'+constants+'\n'+region,'drive-mock.js':'('+mock+')();','local-data-protection.js':(ROOT/'local-data-protection.js').read_text(),'booking-persist-update-path.js':(ROOT/'booking-persist-update-path.js').read_text(),'backup-flow-reliability.js':(ROOT/'backup-flow-reliability.js').read_text(),'start.js':(ROOT/'tests/preview/backup-start.js').read_text()}
    controls=card(html,'<div class="about-card backup-management-card"')+card(html,'<div class="protection-card drive-card"')
    # No file import or restoration controls in the acceptance harness.
    controls=re.sub(r'<input\b[^>]*type="file"[^>]*>','<span>استيراد الملفات معطل في المعاينة</span>',controls)
    controls=controls.replace('Adwaa Al Sharq Backups','Adwaa PR164 Isolated Test Backups')
    policy="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'none'; frame-src 'none'; img-src 'self' data: blob:; object-src 'none'; base-uri 'none'; form-action 'none'; worker-src 'none'"
    pages=[]
    for live,path in [(False,'index.html'),(True,'live/index.html')]:
        csp=policy if not live else policy.replace("script-src 'self' 'unsafe-inline'", "script-src 'self' 'unsafe-inline' https://accounts.google.com").replace("connect-src 'none'",'connect-src https://www.googleapis.com https://accounts.google.com https://oauth2.googleapis.com').replace("frame-src 'none'",'frame-src https://accounts.google.com')
        label='Drive حي — ملفات مصطنعة ومجلد اختبار منفصل فقط' if live else 'محاكاة محجوبة الشبكة — لا اتصال بخدمات حقيقية'
        scripts=['bootstrap.js','mock-sdk.js','local-data-protection.js','booking-persist-update-path.js','backup-core.js']+([] if live else ['drive-mock.js'])+['backup-flow-reliability.js','start.js']
        page='''<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta http-equiv="Content-Security-Policy" content="'''+csp+'''">
<title>معاينة أضواء الشرق المعزولة</title><style>body{font:17px system-ui;margin:0;padding:18px;background:#f3f6f7;color:#172f39}main{max-width:1050px;margin:auto}header,.about-card,.drive-card{padding:18px;margin:12px 0;background:white;border:1px solid #cad8dd;border-radius:14px}button,input{font:inherit;padding:12px;margin:5px;max-width:100%;box-sizing:border-box}button{cursor:pointer}button:disabled{opacity:.5}b,td{overflow-wrap:anywhere}table{width:100%}.backup-last-grid,.drive-status-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}.backup-last-item,.drive-status-item{display:flex;flex-direction:column;gap:8px}.notice{white-space:pre-wrap;padding:12px}.meta{color:#455d65;font-size:14px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px}.error{color:#a42323}.success{color:#146d45}.modal{display:none}.modal.open{display:block}a{color:#065e93}</style>
<body data-live="'''+str(live).lower()+'''"><main><header><h1>معاينة اختبار النسخ فقط</h1><b>'''+label+'''</b><p>لا بيانات إنتاج ولا اتصال Supabase حقيقي. يُمنع إدخال بيانات أو نسخ حقيقية. شيفرة النسخ مأخوذة من الالتزام <code>'''+sha[:12]+'''</code>.</p><p><a href="/">محاكاة</a> · <a href="/live/">اختبار Google الحقيقي ببيانات مصطنعة</a></p><p>وضع Drive الحي يحتاج اعتماد هذا الأصل في إعداد OAuth من مالك Google؛ لا يُعد اختبارًا منجزًا بمجرد فتح الصفحة.</p><label>عبارة مرور لمخزن الاختبار فقط <input id="previewPassphrase" type="password" autocomplete="off" minlength="12"></label><button id="previewStart" onclick="startPreview()">بدء جلسة الاختبار</button><p id="previewReady" role="status">لم تبدأ الجلسة</p><label><input id="metadataFailure" type="checkbox" onchange="QA.fail=this.checked">محاكاة فشل سجل Supabase</label>'''+('' if live else '''<label><input type="checkbox" onchange="DriveQA.failNetwork=this.checked">محاكاة انقطاع شبكة Drive</label><label><input type="checkbox" onchange="DriveQA.failReply=this.checked;DriveQA.hideIndex=this.checked">ضياع رد Drive بعد الحفظ وتأخر الفهرس</label>''')+'''</header><section id="previewControls" hidden>'''+controls+'''</section><h2>تشخيص آمن للمرحلة</h2><pre id="previewLog">لا تُسجل الرموز أو محتويات النسخ أو عناوين جلسات الرفع.</pre></main>'''+('''<script src="https://accounts.google.com/gsi/client" async defer></script>''' if live else '')+''.join('<script src="/'+name+'"></script>' for name in scripts)+'''</body></html>'''
        files[path]=page;pages.append({'source':'/'+('live/(.*)' if live else '(.*)'), 'headers':[{'key':'Content-Security-Policy','value':csp}]})
    files['vercel.json']=json.dumps({'framework':None,'buildCommand':None,'installCommand':None,'git':{'deploymentEnabled':False},'headers':[{'source':'/live/(.*)','headers':[{'key':'Content-Security-Policy','value':pages[1]['headers'][0]['value']}]},{'source':'/(.*)','headers':[{'key':'Cache-Control','value':'no-store'},{'key':'X-Robots-Tag','value':'noindex, nofollow'},{'key':'Referrer-Policy','value':'no-referrer'}]}]})
    for name,text in files.items():
        if any(value in text for value in FORBIDDEN):raise ValueError('Production configuration found in '+name)
        if name.endswith('.js') and 'serviceWorker.register(' in text and name!='mock-sdk.js':raise ValueError('Service worker not permitted')
    output.mkdir(parents=True,exist_ok=False)
    for name,text in files.items():
        target=output/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(text)
    manifest={'source_sha':sha,'synthetic_only':True,'production_connections':False,'files':{name:hashlib.sha256(text.encode()).hexdigest() for name,text in files.items()}}
    (output/'provenance.json').write_text(json.dumps(manifest,indent=2))
    return manifest
if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output-directory',type=Path,required=True);args=parser.parse_args();print(json.dumps(build(args.output_directory)))
