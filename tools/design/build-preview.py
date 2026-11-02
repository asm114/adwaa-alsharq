"""Package the actual app with an in-memory adapter; never ship real session/data."""
from pathlib import Path
import re, shutil, subprocess
root=Path(__file__).resolve().parents[2]
out=root/'.design-preview'
out.mkdir(exist_ok=True)
for p in root.iterdir():
    if p.is_file() and p.suffix in ('.js','.css','.json','.html') and not p.name.startswith(('backup-','index-v','qa-')):
        shutil.copy2(p,out/p.name)
for folder in ['assets','resort']:
    shutil.copytree(root/folder,out/folder,dirs_exist_ok=True)
mock=(root/'tests/workspace-mock.js').read_text()
memory_storage="""(()=>{const storage=()=>{const map=new Map();return {getItem:key=>map.has(String(key))?map.get(String(key)):null,setItem:(key,value)=>map.set(String(key),String(value)),removeItem:key=>map.delete(String(key)),clear:()=>map.clear(),key:index=>[...map.keys()][index]??null,get length(){return map.size}}};Object.defineProperty(window,'localStorage',{value:storage()});Object.defineProperty(window,'sessionStorage',{value:storage()})})();\n"""
mock=memory_storage+"if(!crypto.randomUUID)crypto.randomUUID=()=>'10000000-1000-4000-8000-100000000000'.replace(/[018]/g,c=>(Number(c)^crypto.getRandomValues(new Uint8Array(1))[0]&15>>Number(c)/4).toString(16));\n"+mock
seed='''
const today=new Date();const date=(days)=>{const d=new Date(today);d.setDate(d.getDate()+days);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
seed.bookings=[
{id:'preview-1',code:'AD-0101',name:'خالد العبدالله',phone:'0500000001',date:date(2),type:'مبيت',stayDays:1,status:'مؤكد',total:1200,paid:500,notes:'وصول العائلة بعد العصر',createdAt:today.toISOString(),manualMessages:{contract:today.toISOString()}},
{id:'preview-2',code:'AD-0102',name:'سارة المحمد',phone:'0500000002',date:date(5),type:'يومي',status:'مؤكد',total:850,paid:850,createdAt:today.toISOString(),manualMessages:{contract:today.toISOString()}},
{id:'preview-3',code:'AD-0027',name:'ضيف سابق تجريبي',phone:'0500000003',date:date(-5),type:'يومي',status:'تم الخروج',total:700,paid:700,createdAt:today.toISOString(),manualMessages:{contract:today.toISOString()}},
{id:'preview-4',code:'AD-0103',name:'نورة السالم',phone:'0500000004',date:date(8),type:'يومي',status:'غير مؤكد',total:900,paid:300,createdAt:today.toISOString(),manualMessages:{contract:today.toISOString()}}
];
seed.settings.resortStatus='ready';seed.settings.resortStatusUpdated=today.toISOString();seed.settings.commissionEnabled=false;seed.settings.propertyName='أضواء الشرق';seed.settings.propertyType='منتجع';seed.seq=104;localStorage.setItem('adwaaDB',JSON.stringify(seed));
'''
mock=mock.replace('let saved=structuredClone(seed);',seed+'\nlet saved=structuredClone(seed);')
start=mock.index('function query(table)')
end=mock.index('const channel=',start)
mock=mock[:start]+(root/'tools/design/memory-query.js').read_text()+mock[end:]
mock=mock.replace("rpc:async()=>({data:[],error:null})", "rpc:async(name)=>({data:name==='is_resort_admin'?true:[],error:null})")
(out/'design-memory-adapter.js').write_text(mock)
source=(root/'index.html').read_text()
# No external scripts and no real Supabase SDK: adapter is installed before startup.
source=re.sub(r'<script\b[^>]*\bsrc=["\']https?://[^>]*>\s*</script>', '',source,flags=re.I)
source=source.replace('<head>','<head><meta http-equiv="Content-Security-Policy" content="connect-src \'none\'; worker-src \'none\'; form-action \'none\'; object-src \'none\'">\n<script src="design-memory-adapter.js"></script>',1)
source=source.replace('<link rel="manifest" href="manifest.json">','')
# Prevent the development server from injecting live-reload inside document templates.
source=source.replace('</body></html>`','<\\/body></html>`')
(out/'design-after.html').write_text(source)
# Baseline is identical main app + same adapter/fixtures, without the new presentation layer.
before=source.replace('<script src="native-resort-ui.js?v=20261102-preview-1"></script>','')
(out/'design-before.html').write_text(before)
(out/'index.html').write_text((root/'tools/design/preview-shell.html').read_text())
# Full app page is never a real-login entry in the preview package.
(out/'app.html').write_text(source)
print(out)
