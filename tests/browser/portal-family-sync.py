import copy,hashlib,json,mimetypes,os,re
from pathlib import Path
from datetime import date as CalendarDate,timedelta
from urllib.parse import urlparse,unquote
from playwright.sync_api import sync_playwright
# Requires Python Playwright, a Chromium executable, and the portal repository
# beside this repository. All application traffic is fulfilled locally or blocked.
ROOT=Path(__file__).resolve().parents[2]
PORTAL=Path(os.environ.get('ADWAA_PORTAL_TEST_REPO',str(ROOT.parent/'adwaa-alsharq-customer-portal')))
OUT=Path(os.environ.get('ADWAA_BROWSER_ARTIFACTS','/tmp/adwaa-family-sync-browser'))
OUT.mkdir(parents=True,exist_ok=True)
ADAPTER=Path(__file__).with_name('supabase-adapter.js')
class Database:
 def __init__(self):
  self.core={'bookings':[{'id':'existing-customer','code':'TEST-EXISTING','name':'Synthetic existing customer','phone':'','date':'2026-10-20','type':'يومي','stayDays':1,'recordType':'customer','status':'غير مؤكد','total':1000,'paid':0,'payments':[],'commissionSnapshot':{'status':'no_commission','amount':0},'createdAt':'2026-10-01T12:00:00Z','updatedAt':'2026-10-01T12:00:00Z'}], 'expenses':[],'maintenanceJobs':[],'subscriptions':[],'accountingNotes':[],'notifications':[],'customerNotes':{},'customerCredits':[],'resortAccount':{'calibration':None,'manualMovements':[]},'settings':{'commissionEnabled':False,'resortStatus':'ready','calendarMode':'both'},'seq':2}
  self.periods=[{'id':'customer-20','start_date':'2026-10-20','end_date':'2026-10-20','source_type':'booking','booking_id':'existing-customer'}, {'id':'manual-22','start_date':'2026-10-22','end_date':'2026-10-22','source_type':'manual','booking_id':None}, {'id':'legacy-23','start_date':'2026-10-23','end_date':'2026-10-23','source_type':'legacy','booking_id':None}, {'id':'unknown-24','start_date':'2026-10-24','end_date':'2026-10-24','source_type':'booking','booking_id':'not-in-local-state'}]
  self.initial=copy.deepcopy(self.periods);self.operations=[];self.fail_insert=False;self.fail_core=False;self.fail_portal_read=False;self.counter=0
 def run(self,source,q):
  self.operations.append(copy.deepcopy(q));table=q['table'];op=q['op'];payload=q.get('payload');single=q.get('single')
  def result(data=None,error=None):return {'data':copy.deepcopy(data),'error':error,'count':0}
  def error(message):return result(error={'message':message})
  if table=='app_state':
   if self.fail_core:return error('Isolated core disconnected')
   if op in ['update','upsert']:
    if payload and 'data' in payload:self.core=copy.deepcopy(payload['data'])
   return result({'id':'main','data':self.core,'updated_at':'2026-10-15T12:00:00Z'} if single else [{'id':'main','data':self.core}])
  if table=='customer_portal_unavailable_periods':
   if op=='select':return error('Isolated portal disconnected') if self.fail_portal_read else result(self.periods)
   matches=lambda row:all(str(row.get(k))==str(v) for k,v in q['filters'])
   if op=='insert':
    if self.fail_insert:return error('Isolated portal insert disconnected')
    assert set(payload)=={'start_date','end_date','source_type','booking_id'},'private field transmitted'
    if any(payload['start_date']<=row['end_date'] and payload['end_date']>=row['start_date'] for row in self.periods):return error('overlap conflict')
    self.counter+=1;row={'id':'synthetic-period-'+str(self.counter),**payload};self.periods.append(row);return result(row if single else [row])
   if op in ['delete','update']:
    assert {'id','source_type','booking_id'}<=set(k for k,v in q['filters']),'unscoped destructive closure operation'
    rows=[row for row in self.periods if matches(row)]
    assert all(row['source_type']=='booking' for row in rows),'protected closure mutation'
    if op=='delete':self.periods[:]=[row for row in self.periods if not matches(row)]
    else:
     for row in rows:row.update(payload)
    return result((rows[0] if rows else None) if single else rows)
  tables={'customer_portal_resort_info':{'id':'main','resort_name':'Isolated test resort','features':[],'requests_open':True},'customer_portal_pricing':{'id':'main','weekday_price':900,'weekend_price':1000},'customer_portal_contact':{'id':'main','whatsapp_number':'966500000000'}}
  return result(tables.get(table) if single else [])

def main():
 db=Database();checks=[];external=[];errors=[]
 def check(value,label):
  if not value:raise AssertionError(label)
  checks.append(label);print('PASS',label,flush=True)
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE','/usr/lib/chromium/chromium'),headless=True,args=['--no-sandbox','--disable-crashpad-for-testing','--single-process','--no-zygote','--disable-dev-shm-usage','--disable-background-networking'])
  context=browser.new_context(service_workers='block',viewport={'width':1280,'height':900})
  context.expose_binding('__qaQuery',db.run)
  # Start the synthetic administration cache with the same synthetic core state.
  # No cached or remote production data is read by this test.
  context.add_init_script("if(location.hostname==='admin.test')localStorage.setItem('adwaaDB',"+json.dumps(json.dumps(db.core))+");")
  def route_handler(route):
   u=urlparse(route.request.url)
   roots={'admin.test':ROOT,'portal.test':ROOT/'resort','standalone.test':PORTAL,'embedded.test':ROOT/'customer-portal'}
   if u.hostname not in roots:
    external.append(route.request.url);print('BLOCKED EXTERNAL',route.request.url,flush=True);route.abort();return
   path=unquote(u.path)
   if path=='/__qa/adapter.js':route.fulfill(status=200,content_type='text/javascript',body=ADAPTER.read_text());return
   file=roots[u.hostname]/(path.lstrip('/') or 'index.html')
   if not file.is_file():route.fulfill(status=404,body='Isolated fixture asset absent');return
   content=file.read_bytes()
   if file.suffix=='.html':
    html=content.decode();html=html.replace('<head>','<head><meta http-equiv="Content-Security-Policy" content="connect-src \'none\'; worker-src \'none\'; form-action \'none\'">')
    html=re.sub(r'<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>','<script src="/__qa/adapter.js"></script>',html)
    html=re.sub(r'<script[^>]*src="https://accounts.google.com/[^>]*></script>','',html)
    html=re.sub(r'<link\b[^>]*https://fonts\.(?:googleapis|gstatic)\.com[^>]*>','',html)
    content=html.encode()
   route.fulfill(status=200,content_type=mimetypes.guess_type(file.name)[0] or 'application/octet-stream',body=content)
  context.route('**/*',route_handler)
  admin=context.new_page();admin.on('pageerror',lambda e:errors.append(str(e)));admin.on('dialog',lambda d:d.accept())
  admin.goto('https://admin.test/',wait_until='load')
  admin.wait_for_function("typeof syncPortalAvailabilityFromBookings==='function' && window.portalAdminAuthState?.ready===true && window.__adwaaAuthoritativeBookingSubmitInstalled && remoteReady===true",timeout=20000)
  print('ADMIN READY',flush=True)
  (OUT/'debug-state.json').write_text(json.dumps({'core':db.core,'local':admin.evaluate('db'),'operations':db.operations,'errors':errors},ensure_ascii=False,indent=2))
  check(admin.evaluate("db.bookings.some(row=>row.id==='existing-customer')"),'pre-existing synthetic booking loaded from core before any action')
  public=[]
  for origin in ['portal.test','standalone.test','embedded.test']:
   page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto('https://'+origin+'/',wait_until='load');page.wait_for_function('availabilityReady===true');page.evaluate("calendarCursor=new Date(2026,9,1);renderCalendar()")
   public.append(page)
  def day(page,date,blocked):return page.locator('[data-date="'+date+'"]').is_disabled()==blocked
  def refresh_public():
   for page in public:
    page.reload(wait_until='load');page.wait_for_function('availabilityReady===true');page.evaluate("calendarCursor=new Date(2026,9,1);renderCalendar()")
    cells=page.locator('.calendar-day[data-date]').evaluate_all("buttons=>buttons.map(button=>({date:button.dataset.date,disabled:button.disabled}))")
    for cell in cells:
     if cell['date']<'2026-10-15':continue
     expected=any(row['start_date']<=cell['date']<=row['end_date'] for row in db.initial)
     for booking in db.core['bookings']:
      if booking['status'] in ['ملغي','مؤجل'] or not booking.get('date'):continue
      nights=int(booking.get('stayDays',1)) if booking['type']=='مبيت' else 1
      dates={(CalendarDate.fromisoformat(booking['date'])+timedelta(days=n)).isoformat() for n in range(nights)}
      expected=expected or cell['date'] in dates
     if cell['disabled']!=expected:raise AssertionError('incorrect public availability: '+page.url+' '+cell['date'])
   check(True,'all remaining days match active source records and protected closures on all three public entry points')
  def save(date=None,record_id=None,status='مؤكد',days=1,expect_sync=True):
   admin.evaluate('([id,date])=>openBooking(id,date)',[record_id,date])
   admin.locator('#bRecordType').select_option('family')
   if date:admin.locator('#bDate').fill(date)
   admin.locator('#bType').select_option('مبيت' if days>1 else 'يومي')
   if days>1:admin.locator('#bStayDays').fill(str(days))
   admin.locator('#bStatus').select_option(status)
   admin.evaluate('window.__adwaaLastBookingSaveConfirmed=null')
   admin.locator('button[type="submit"][form="bookingForm"]').click()
   admin.wait_for_function("window.__adwaaLastBookingSaveConfirmed && !window.__adwaaAuthoritativeBookingSaveBusy",timeout=15000)
   result=admin.evaluate('window.__adwaaLastBookingSaveConfirmed')
   (OUT/'debug-state.json').write_text(json.dumps({'core':db.core,'local':admin.evaluate('db'),'operations':db.operations,'errors':errors},ensure_ascii=False,indent=2))
   check(any(row['id']=='existing-customer' for row in db.core['bookings']),'existing synthetic booking retained after save')
   check(result['ok'] is True and result['portalSynced']==expect_sync,'actual form save confirmed: '+status+' '+str(date)+' sync='+str(expect_sync))
   return result['id']
  check(all(day(page,'2026-10-18',False) and day(page,'2026-10-20',True) and day(page,'2026-10-22',True) for page in public),'initial occupied, manual and free days correct on all three portal entry points')
  # Leave one public tab selected before administration saves a family presence.
  public[0].locator('[data-date="2026-10-18"]').click()
  family=save('2026-10-18')
  check(any(row['booking_id']==family and row['start_date']=='2026-10-18' for row in db.periods),'family presence automatically creates its owned closure without manual sync')
  public[0].locator('#bookingConfirmationWhatsapp').click()
  public[0].wait_for_function("isUnavailable('2026-10-18') && selectedDateIso===null")
  check(public[0].url=='https://portal.test/','stale selected day cannot navigate to WhatsApp after becoming occupied')
  refresh_public()
  check(all(day(page,'2026-10-18',True) and day(page,'2026-10-19',False) for page in public),'family day closed and adjacent free day stays selectable')
  public[0].screenshot(path=str(OUT/'family-added.png'),full_page=True)
  save('2026-10-19',record_id=family)
  refresh_public()
  check(all(day(page,'2026-10-18',False) and day(page,'2026-10-19',True) and day(page,'2026-10-20',True) for page in public),'date edit moves only its closure while existing reservation stays blocked')
  save(record_id=family,status='ملغي')
  refresh_public()
  check(all(day(page,'2026-10-19',False) and day(page,'2026-10-20',True) for page in public),'cancellation automatically frees only family day, preserving existing reservation')
  public[0].screenshot(path=str(OUT/'family-cancelled.png'),full_page=True)
  multi=save('2026-10-26',days=3)
  refresh_public()
  check(all(all(day(page,'2026-10-'+str(n),True) for n in [26,27,28]) and day(page,'2026-10-29',False) for page in public),'multi-day family stay blocks occupied nights only and keeps checkout available')
  save(record_id=multi,status='ملغي',days=3)
  refresh_public()
  check(all(all(day(page,'2026-10-'+str(n),False) for n in [26,27,28]) for page in public),'multi-day cancellation releases all and only its occupied days')
  check(db.periods==db.initial,'all pre-existing booking, manual, legacy and unknown closures remain byte-for-byte unchanged')
  db.fail_insert=True
  failed=save('2026-10-29',expect_sync=False)
  check('فشلت' in admin.locator('#bookingSaveStatusToast').inner_text(),'portal connection failure displays explicit warning rather than success')
  check(all(row in db.periods for row in db.initial),'portal connection failure cannot release other occupied or protected days')
  db.fail_insert=False
  admin.locator('#bookingSaveToast button').click()
  admin.wait_for_function('window.portalBookingSyncLastResult?.ok===true')
  check(len([row for row in db.periods if row['booking_id']==failed])==1,'retry button closes saved family day without duplicate reservation or closure')
  before=copy.deepcopy(db.periods)
  admin.evaluate('syncPortalAvailabilityFromBookings()')
  check(db.periods==before,'repeated synchronization is idempotent')
  # Conflicting synthetic records test the fail-safe handoff, without production writes.
  duplicate=copy.deepcopy(next(row for row in db.core['bookings'] if row['id']=='existing-customer'));duplicate.update(id='synthetic-overlap',date='2026-10-29',code='TEST-OVERLAP',status='غير مؤكد')
  db.core['bookings'].append(duplicate)
  admin.evaluate("closeModal('bookingModal');loadRemoteData()")
  check(admin.evaluate("db.bookings.some(row=>row.id==='synthetic-overlap'&&row.status==='غير مؤكد')"),'overlap fixture is active and loaded by administration')
  admin.evaluate('syncPortalAvailabilityFromBookings()')
  save(record_id=failed,status='ملغي')
  check(any(row['booking_id']=='synthetic-overlap' and row['start_date']=='2026-10-29' for row in db.periods),'cancelling shared-day owner transfers closure without opening remaining reservation')
  refresh_public()
  check(all(day(page,'2026-10-29',True) and day(page,'2026-10-30',False) for page in public),'shared occupied day remains closed and unrelated free day remains available')
  db.fail_portal_read=True
  public[0].locator('[data-date="2026-10-30"]').click();public[0].locator('#bookingConfirmationWhatsapp').click()
  public[0].wait_for_function('availabilityReady===false')
  check(public[0].locator('[data-date="2026-10-29"]').is_disabled(),'public read failure cannot reopen a previously occupied day')
  db.fail_portal_read=False
  existing=next(row for row in db.core['bookings'] if row['id']=='existing-customer')
  check(existing['total']==1000 and existing['paid']==0 and existing.get('payments',[])==[] and not db.core.get('expenses'),'existing synthetic reservation financial values remain unchanged')
  check(not external,'no application request escaped the four isolated test origins')
  check(not errors,'no unhandled browser page errors: '+str(errors))
  paths=['supabase-config.staging.js','portal-booking-sync-stable.js','portal-final-admin.js','resort/index.html','resort/portal.js','resort/portal-pricing-days.js','customer-portal/portal.js']
  hashes={path:hashlib.sha256((ROOT/path).read_bytes()).hexdigest() for path in paths}
  hashes['standalone/portal.js']=hashlib.sha256((PORTAL/'portal.js').read_bytes()).hexdigest()
  report={'source_sha256':hashes,'result':'PASS','browser':browser.version,'reviewed_admin_parent':'13ef3e89b61ee0b8eccacf92e2f9c9246f2ecbae','portal_pr_sha':'28e3691eee1f50983ff37ce7babde361022ac93f','checks':checks,'external_requests':external,'page_errors':errors,'operations':db.operations,'core':db.core,'periods':db.periods}
  (OUT/'results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print('BROWSER ALL CHECKS PASSED',len(checks),flush=True)
  context.close();browser.close()
if __name__=='__main__':main()
