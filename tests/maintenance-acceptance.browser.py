"""Synthetic acceptance: no external requests, no production writes.
Run with --engine chromium or --engine webkit. WEBKIT_PATH selects an installed engine.
"""
import argparse
import json
import os
from pathlib import Path
import runpy
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
fixture = runpy.run_path(str(ROOT / 'tests/save-confirmation.browser.py'))


def run(browser, width, height, engine):
    context = browser.new_context(viewport={'width': width, 'height': height}, has_touch=True)
    context.route('**/*', fixture['route'])
    # Speed up only the new network deadlines, without a production test-mode switch.
    context.add_init_script("const nativeTimeout=window.setTimeout;window.setTimeout=(fn,ms,...args)=>nativeTimeout(fn,ms===12000?150:ms,...args)")
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('dialog', lambda dialog: dialog.accept())
    page.goto('https://qa.invalid/index.html')
    page.wait_for_function('remoteReady && currentUser && window.FinanceOrganizer?.guardedSubmit && window.BookingPaymentHistory')
    page.wait_for_timeout(800)
    page.evaluate('window.syncPortalAvailabilityFromBookings=async()=>true;openBooking()')
    page.locator('#bName').fill('عميل قبول معزول')
    page.locator('#bPhone').fill('0500000000')
    page.locator('#bDate').fill('2027-02-10')
    page.locator('#bTotal').fill('1200')
    page.locator('#bookingDepositAmount').fill('500')
    page.locator('button[type=submit][form=bookingForm]').click()
    expect(page.locator('#bookingModal')).to_be_hidden()
    balance = page.evaluate('ResortAccountCore.currentBalance(db)')
    # Both HTTP write and verification never return; the modal stays usable.
    page.evaluate('openBooking(db.bookings[0].id);QA.hangWrite=true;QA.hangRead=true')
    page.locator('#bNotes').fill('مدخلات لا تضيع عند تعليق الشبكة')
    page.locator('button[type=submit][form=bookingForm]').click()
    page.wait_for_function("window.__adwaaLastBookingSaveConfirmed?.outcome==='unknown' && !window.__adwaaAuthoritativeBookingSaveBusy")
    expect(page.locator('button[type=submit][form=bookingForm]')).to_be_enabled()
    assert page.locator('#bNotes').input_value() == 'مدخلات لا تضيع عند تعليق الشبكة'
    page.evaluate('QA.hangWrite=false;QA.hangRead=false')
    page.locator('button[type=submit][form=bookingForm]').click()
    expect(page.locator('#bookingModal')).to_be_hidden()
    assert page.evaluate('db.bookings.length') == 1
    assert page.evaluate('ResortAccountCore.currentBalance(db)') == balance
    # A deferred realtime snapshot is not applied without fetching its matching revision.
    page.evaluate("openBooking(db.bookings[0].id);v92PendingRemoteData=JSON.parse(JSON.stringify(db));v92PendingRemoteData.bookings[0].notes='stale-realtime-data'")
    page.evaluate('refreshBookingData()')
    assert page.locator('#bNotes').input_value() != 'stale-realtime-data'
    # Contract/message operation IDs survive repeated clicks, failure, and retry.
    page.evaluate('openBooking(db.bookings[0].id);QA.fail=true;QA.delay=50')
    assert page.evaluate("async()=>await Promise.all([v92RecordOperation('contract','created'),v92RecordOperation('contract','created')])") == [False, False]
    first_id = page.evaluate("db.bookings[0].communicationActivity.find(x=>x.event==='contract-created').id")
    page.evaluate('QA.fail=false;QA.delay=0')
    assert page.evaluate("v92RecordOperation('contract','created')") is True
    assert page.evaluate("db.bookings[0].communicationActivity.filter(x=>x.event==='contract-created').length") == 1
    assert page.evaluate("db.bookings[0].communicationActivity.find(x=>x.event==='contract-created').id") == first_id
    page.evaluate('QA.fail=true')
    assert page.evaluate("v92RecordOperation('invoice','created')") is False
    page.evaluate('QA.fail=false;refreshBookingData()')
    page.wait_for_function("db.bookings[0].communicationActivity.filter(x=>x.event==='invoice-created').length===0")
    assert page.evaluate("v92RecordOperation('invoice','created')") is True
    assert page.evaluate("db.bookings[0].communicationActivity.filter(x=>x.event==='invoice-created').length") == 1
    assert page.evaluate("v92RecordOperation('invoice','sent')") is True
    # Generate the actual contract HTML in an intercepted popup; no external sharing.
    with page.expect_popup() as popup_info:
        page.evaluate("printBookingDocument('contract')")
    popup = popup_info.value
    assert 'عميل قبول معزول' in popup.content()
    popup.close()
    page.evaluate("closeModal('bookingModal');openCustomerProfile(encodeURIComponent(getCustomers()[0].key));QA.fail=true")
    page.locator('#customerAdminNotes').fill('ملاحظة بعد انقطاع الاتصال')
    page.get_by_role('button', name='حفظ الملاحظات', exact=True).click()
    expect(page.locator('#customerModal .workspace-form-status')).to_contain_text('تعذر')
    assert page.locator('#customerAdminNotes').input_value() == 'ملاحظة بعد انقطاع الاتصال'
    page.evaluate('QA.fail=false')
    page.get_by_role('button', name='حفظ الملاحظات', exact=True).click()
    expect(page.locator('#customerModal .workspace-form-status')).to_be_hidden()
    # Search is reversible and does not mutate the data.
    page.evaluate("closeModal('customerModal');switchView('customers')")
    before = page.evaluate('JSON.stringify(db.bookings)')
    page.locator('#customerSearch').fill('اسم غير موجود قطعًا')
    assert 'عميل قبول معزول' not in page.locator('#customers').inner_text()
    page.locator('#customerSearch').fill('عميل قبول')
    assert 'عميل قبول معزول' in page.locator('#customers').inner_text()
    assert page.evaluate('JSON.stringify(db.bookings)') == before
    # Existing customer order (latest visit first), booking search and status filter.
    page.evaluate('openBooking()')
    page.locator('#bName').fill('عميل أحدث للفرز')
    page.locator('#bPhone').fill('0500000001')
    page.locator('#bDate').fill('2027-03-12')
    page.locator('#bTotal').fill('800')
    page.locator('button[type=submit][form=bookingForm]').click()
    expect(page.locator('#bookingModal')).to_be_hidden()
    page.evaluate("switchView('customers');customerSearch.value='';renderCustomers()")
    page.locator('#customerSort').select_option('latest')
    expect(page.locator('#customerList h4').first).to_contain_text('عميل أحدث للفرز')
    page.locator('#customerSort').select_option('oldest')
    expect(page.locator('#customerList h4').first).to_contain_text('عميل قبول معزول')
    page.locator('#customerSort').select_option('latest')
    page.wait_for_timeout(100)
    expect(page.locator('#customerList h4').first).to_contain_text('عميل أحدث للفرز')
    page.evaluate("switchView('bookings')")
    page.locator('#search').fill('عميل قبول')
    assert 'عميل أحدث للفرز' not in page.locator('#bookings').inner_text()
    page.locator('#statusFilter').select_option(label='ملغي')
    assert 'عميل قبول معزول' not in page.locator('#bookings').inner_text()
    page.locator('#statusFilter').select_option('')
    page.locator('#search').fill('')
    assert page.evaluate('db.bookings[1].paid') == 0
    assert page.evaluate('ResortAccountCore.currentBalance(db)') == balance
    # Purchase payment forms reuse the financial guard; retry cannot duplicate cash.
    page.evaluate("switchView('expenses');openInstallmentPurchase()")
    page.locator('#ipForm input[name=title]').fill('أصل معزول')
    page.locator('#ipForm input[name=total]').fill('600')
    page.locator('#ipForm button[type=submit]').click()
    expect(page.locator('#installmentPurchaseModal')).to_be_hidden()
    assert page.evaluate('ResortAccountCore.currentBalance(db)') == balance
    page.evaluate('openInstallmentPayment(db.installmentPurchases[0].id);QA.fail=true;QA.delay=50')
    page.locator('#ipPaymentForm input[name=amount]').fill('200')
    page.locator('#ipPaymentForm').evaluate("f=>{f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))}")
    expect(page.locator('#ipPaymentForm .workspace-form-status')).to_contain_text('تعذر')
    page.evaluate('QA.fail=false;QA.delay=0')
    page.locator('#ipPaymentForm button[type=submit]').click()
    expect(page.locator('#installmentPaymentModal')).to_be_hidden()
    assert page.evaluate('db.expenses.filter(x=>x.installmentPaymentId).length') == 1
    assert page.evaluate('ResortAccountCore.currentBalance(db)') == balance - 200
    page.evaluate('openInstallmentPayment(db.installmentPurchases[0].id)')
    page.locator('#ipPaymentForm input[name=amount]').fill('400')
    page.locator('#ipPaymentForm button[type=submit]').click()
    expect(page.locator('#installmentPaymentModal')).to_be_hidden()
    page.evaluate('toggleInstallmentArchive(db.installmentPurchases[0].id)')
    page.wait_for_function('!!db.installmentPurchases[0].archivedAt')
    balance -= 600
    assert page.evaluate('ResortAccountCore.currentBalance(db)') == balance
    # Protect a legacy snapshot without discarding it; exercise real IndexedDB backups.
    page.evaluate("localStorage.setItem('adwaaDB',JSON.stringify({bookings:[{id:'old-local-draft',name:'مسودة قديمة'}],seq:3}));switchView('dataProtection');openLocalProtection()")
    page.locator('#localProtectionForm input[name=passphrase]').fill('isolated recovery passphrase 2026')
    page.locator('#localProtectionForm input[name=confirmation]').fill('isolated recovery passphrase 2026')
    page.locator('#localProtectionForm button[type=submit]').click()
    expect(page.locator('#localProtectionStatus')).to_contain_text('تمت حماية', timeout=10000)
    assert page.evaluate('AdwaaLocalVault.recoveryKeys().length') == 1
    assert 'مسودة قديمة' not in page.evaluate("localStorage.getItem('adwaaDB')")
    result = page.evaluate("async()=>{closeModal('localProtectionModal');return await createBackup('قبول معزول',{downloadFile:false,silent:true,preferDirectory:false})}")
    assert result['verified'] and result['rollbackReady'], result
    assert page.evaluate('ResortAccountCore.currentBalance(db)') == balance
    restored = page.evaluate("async()=>{const candidate=JSON.parse(JSON.stringify(db));candidate.customerNotes['isolated-restore']='استعادة معزولة';return await commitRestoredDataToSupabase(candidate)}")
    assert restored is True
    assert page.evaluate("db.customerNotes['isolated-restore']") == 'استعادة معزولة'
    assert page.evaluate('ResortAccountCore.currentBalance(db)') == balance
    # Restore acknowledgement remains authoritative if its extra read fails.
    result = page.evaluate("async()=>{QA.failRead=true;const candidate=JSON.parse(JSON.stringify(db));candidate.customerNotes['restore-read-failed']='استعادة مؤكدة الكتابة';return await commitRestoredDataToSupabase(candidate)}")
    assert result is True
    assert page.evaluate('window.__adwaaLastRestoreResult.verified') is False
    assert page.evaluate("db.customerNotes['restore-read-failed']") == 'استعادة مؤكدة الكتابة'
    page.evaluate('QA.failRead=false')
    page.evaluate('AdwaaLocalVault.lock()')
    assert page.evaluate('AdwaaLocalVault.unlocked()') is False
    # Integrity rejection does not dispatch any database write.
    assert page.evaluate("async()=>{const before=QA.writes;const envelope=await createBackupEnvelope('تحقق');envelope.data.bookings[0].total++;let rejected=false;try{await verifyBackupPayload(envelope)}catch(_){rejected=true}return rejected&&QA.writes===before}") is True
    assert errors == [], errors
    print(json.dumps({'engine': engine, 'viewport': [width, height], 'result': 'PASS', 'checks': 'hung write/read UI recovery, stable payment/sequence, contracts/messages duplicate/retry, real contract popup, customer failure/retry/search, encrypted legacy recovery, IndexedDB backup and CAS restore, financial invariance, no uncaught errors'}, ensure_ascii=False), flush=True)
    context.close()


def denied_access_probe(browser):
    context=browser.new_context(viewport={'width':320,'height':568})
    def route(request):
        if request.request.url.endswith('/tests/workspace-mock.js'):
            return request.fulfill(body=fixture['MOCK']+';QA.failRead=true;',content_type='text/javascript')
        return fixture['route'](request)
    context.route('**/*',route)
    context.add_init_script("localStorage.setItem('adwaaDB',JSON.stringify({bookings:[{id:'legacy-private',name:'Synthetic denied private data'}]}))")
    page=context.new_page();page.goto('https://qa.invalid/index.html')
    page.wait_for_function("typeof currentUser!=='undefined' && !currentUser && document.getElementById('authGate') && !document.getElementById('authGate').hasAttribute('hidden') && document.getElementById('authStatus').textContent.includes('تعذر تأكيد')")
    assert page.evaluate('db.bookings.length')==0
    assert 'Synthetic denied private data' not in page.locator('body').inner_text()
    assert page.evaluate("localStorage.getItem('adwaaDB').includes('legacy-private')") is True
    assert page.evaluate('QA.writes')==0
    print(json.dumps({'probe':'access denied before rendering legacy data','result':'PASS'}),flush=True)
    context.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--engine', choices=['chromium', 'webkit'], default='chromium')
    args = parser.parse_args()
    with sync_playwright() as playwright:
        if args.engine == 'webkit':
            browser = playwright.webkit.launch(executable_path=os.getenv('WEBKIT_PATH'))
        else:
            browser = playwright.chromium.launch(executable_path=os.getenv('CHROMIUM_PATH') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').is_file() else None), args=['--no-sandbox'])
        for width, height in [(320, 568), (430, 932), (768, 1024), (1024, 768)]:
            run(browser, width, height, args.engine)
        denied_access_probe(browser)
        browser.close()
