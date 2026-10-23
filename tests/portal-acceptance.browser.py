"""Real browser checks of shipped portal copies; synthetic data, all network intercepted."""
import argparse,json,mimetypes,os
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
ADAPTER=(ROOT/'tests/browser/supabase-adapter.js').read_text()

def run(browser,engine,width,height,entry):
    context=browser.new_context(viewport={'width':width,'height':height},service_workers='block')
    state={'offline':False,'periods':[{'id':'synthetic','start_date':'2027-02-10','end_date':'2027-02-10'}]}
    calls=[];errors=[]
    def query(source,q):
        calls.append(q)
        assert q['op']=='select' and q['table'].startswith('customer_portal_'),q
        table=q['table']
        data={'customer_portal_resort_info':{'id':'main','resort_name':'منتجع الاختبار','features':[],'requests_open':True},'customer_portal_images':[],'customer_portal_pricing':{'id':'main','weekday_price':900,'weekend_price':1100},'customer_portal_seasons':[],'customer_portal_contact':{'id':'main','whatsapp_number':'966500000000'},'customer_portal_unavailable_periods':state['periods']}[table]
        return {'data':data,'error':{'message':'isolated offline'} if state['offline'] and table=='customer_portal_unavailable_periods' else None}
    context.expose_binding('__qaQuery',query)
    def route(r):
        u=urlparse(r.request.url)
        if u.hostname!='portal.invalid':return r.abort()
        path=u.path.lstrip('/') or entry+'/index.html'
        if path=='adapter.js':return r.fulfill(content_type='text/javascript',body=ADAPTER)
        f=ROOT/path
        if not f.is_file() or not f.resolve().is_relative_to(ROOT):return r.fulfill(status=404,body='absent fixture')
        content=f.read_bytes()
        if f.suffix=='.html':content=content.replace(b'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',b'/adapter.js')
        r.fulfill(body=content,content_type=mimetypes.guess_type(f.name)[0] or 'text/plain')
    context.route('**/*',route)
    page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('https://portal.invalid/'+entry+'/index.html')
    page.wait_for_function('availabilityReady===true')
    page.evaluate('calendarCursor=new Date(2027,1,1);renderCalendar()')
    expect(page.locator('[data-date="2027-02-10"]')).to_be_disabled()
    page.locator('[data-date="2027-02-11"]').click()
    expect(page.locator('#selectedDayCard')).to_contain_text('طلب الحجز')
    # A stale open tab must recheck availability before any external enquiry.
    state['periods'].append({'id':'new-closure','start_date':'2027-02-11','end_date':'2027-02-11'})
    assert page.evaluate("submitBookingRequest('2027-02-11')") is False
    expect(page.locator('[data-date="2027-02-11"]')).to_be_disabled()
    state['offline']=True
    assert page.evaluate("submitBookingRequest('2027-02-12')") is False
    assert page.evaluate('availabilityReady') is False
    state['offline']=False
    assert page.evaluate('loadUnavailablePeriods()') is True
    assert page.evaluate('bookingRequestInFlight') is False
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),(entry,width,'horizontal overflow')
    assert not errors,errors
    assert calls
    print(json.dumps({'engine':engine,'entry':entry,'viewport':[width,height],'result':'PASS','checks':'closed date, selected date, stale-tab closure, offline enquiry denied, recovery, no core writes, no horizontal overflow, no uncaught errors'}),flush=True)
    context.close()

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--engine',choices=['chromium','webkit'],required=True);args=parser.parse_args()
    with sync_playwright() as p:
        browser=p.webkit.launch(executable_path=os.getenv('WEBKIT_PATH')) if args.engine=='webkit' else p.chromium.launch(executable_path=os.getenv('CHROMIUM_PATH') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').is_file() else None),args=['--no-sandbox'])
        for entry in ['customer-portal','resort']:
            for width,height in [(320,568),(430,932),(768,1024),(1024,768),(1440,900)]:run(browser,args.engine,width,height,entry)
        browser.close()
