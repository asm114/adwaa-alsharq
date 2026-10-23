"""Exercise the exact built preview artifact, including its native CSP. No live OAuth."""
import argparse,json,os,subprocess,tempfile
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--engine',choices=['chromium','webkit'],required=True);parser.add_argument('--base-url');args=parser.parse_args()
with tempfile.TemporaryDirectory(prefix='adwaa-preview-test-') as directory:
    output=Path(directory)/'site'
    subprocess.run(['python',str(ROOT/'tools/build-isolated-backup-preview.py'),'--output-directory',str(output)],check=True,capture_output=True)
    with sync_playwright() as p:
        browser=p.webkit.launch(executable_path=os.getenv('WEBKIT_PATH')) if args.engine=='webkit' else p.chromium.launch(executable_path=os.getenv('CHROMIUM_PATH') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').is_file() else None),args=['--no-sandbox'])
        for width,height in [(768,1024),(1024,768)]:
            context=browser.new_context(viewport={'width':width,'height':height},service_workers='block')
            external=[];errors=[]
            def route(r):
                u=urlparse(r.request.url)
                if args.base_url:
                    if u.netloc!=urlparse(args.base_url).netloc:external.append(u.netloc);return r.abort()
                    return r.continue_()
                if u.hostname!='preview.invalid':external.append(u.hostname);return r.abort()
                path=output/(u.path.lstrip('/') or 'index.html')
                if path.is_dir():path=path/'index.html'
                if not path.is_file() or not path.resolve().is_relative_to(output):return r.fulfill(status=404,body='not found')
                return r.fulfill(body=path.read_bytes(),content_type='text/html' if path.suffix=='.html' else 'text/javascript' if path.suffix=='.js' else 'application/json')
            context.route('**/*',route)
            page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
            page.goto((args.base_url.rstrip('/')+'/' if args.base_url else 'https://preview.invalid/'))
            page.locator('#previewPassphrase').fill('isolated preview passphrase 2026')
            page.locator('#previewStart').click()
            expect(page.locator('#previewReady')).to_contain_text('جلسة اختبار جاهزة',timeout=10000)
            page.locator('#googleDriveConnectButton').click()
            expect(page.locator('#googleDriveConnectionStatus')).to_contain_text('متصل')
            page.locator('#metadataFailure').check()
            result=page.evaluate("async()=>{const r=await createBackup('يدوي',{downloadFile:false,silent:true});return {local:r.stored,drive:r.cloudResult.ok,metadata:r.metadataSync.ok}}")
            assert result=={'local':True,'drive':True,'metadata':False},(result,errors)
            assert page.evaluate('DriveQA.uploads')==1
            page.locator('#googleDriveRetryButton').click()
            expect(page.locator('#googleDriveRetryButton')).to_be_enabled(timeout=10000)
            assert page.evaluate('DriveQA.uploads')==1
            assert page.evaluate('db.bookings[0].total')==1200
            assert page.evaluate('db.bookings[0].paid')==500
            page.evaluate("()=>{window.showDirectoryPicker=undefined;void renderBackupManagement();openBackupDirectory()}")
            expect(page.locator('#backupOperationMessage')).to_contain_text('الملفات')
            # CSP blocks even the native transport; application mocks are not the only fence.
            assert page.evaluate("__previewNativeFetch('https://pgdvlklpyrvmwzitsmbw.supabase.co/rest/v1/app_state').then(()=>false,()=>true)") is True
            live=context.new_page();live.on('pageerror',lambda e:errors.append(str(e)))
            live.goto((args.base_url.rstrip('/') if args.base_url else 'https://preview.invalid')+'/live/')
            live.locator('#previewPassphrase').fill('isolated live test passphrase')
            live.locator('#previewStart').click()
            expect(live.locator('#previewReady')).to_contain_text('جلسة اختبار جاهزة')
            expect(live.locator('#googleDriveConnectButton')).to_be_disabled()
            expect(live.locator('#googleDriveMessage')).to_contain_text('غير مفعّل')
            assert live.evaluate("__previewNativeFetch('https://pgdvlklpyrvmwzitsmbw.supabase.co/rest/v1/app_state').then(()=>false,()=>true)") is True
            assert not external,external
            assert not errors,errors
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
            print(json.dumps({'engine':args.engine,'viewport':[width,height],'deployed':bool(args.base_url),'result':'PASS','checks':'synthetic only, production CSP deny, real backup code, encrypted vault, fake Drive/Supabase isolation, retry, Files guidance'}),flush=True)
            context.close()
        browser.close()
