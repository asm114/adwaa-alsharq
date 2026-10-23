"""Isolated browser checks. All network requests are intercepted; no live writes."""
import json
import mimetypes
import os
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / 'index.html').read_text().replace(
    '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>',
    '<script src="tests/workspace-mock.js"></script>').replace(
    '<script src="https://accounts.google.com/gsi/client" async defer></script>', '')
MOCK = (ROOT / 'tests/workspace-mock.js').read_text().replace(
    'if(payload){QA.writes++;',
    "if(!payload&&QA.failRead)return{data:null,error:{message:'isolated read failure'}};if(payload){QA.writes++;").replace(
    'saved=structuredClone(payload.data)',
    "{saved=structuredClone(payload.data);if(QA.loseWriteResponse)return{data:null,error:{message:'isolated lost write response'}}}")


def route(request):
    url = urlparse(request.request.url)
    if url.hostname != 'qa.invalid':
        return request.abort()
    path = url.path.lstrip('/') or 'index.html'
    if path == 'index.html':
        return request.fulfill(body=HTML, content_type='text/html')
    if path == 'tests/workspace-mock.js':
        return request.fulfill(body=MOCK, content_type='text/javascript')
    file = (ROOT / path).resolve()
    if ROOT in file.parents and file.is_file():
        return request.fulfill(body=file.read_bytes(), content_type=mimetypes.guess_type(path)[0] or 'text/plain')
    return request.fulfill(status=404, body='Not found')


def run(browser, width, height):
    context = browser.new_context(viewport={'width': width, 'height': height}, has_touch=True)
    context.route('**/*', route)
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('dialog', lambda dialog: dialog.accept())
    page.goto('https://qa.invalid/index.html')
    page.wait_for_function("window.__adwaaBookingPersistUpdatePathInstalled && window.__adwaaAuthoritativeBookingSubmitInstalled")
    page.wait_for_timeout(1000)
    page.evaluate("window.syncPortalAvailabilityFromBookings=async()=>true;openBooking()")
    page.locator('#bName').fill('عميل اختبار معزول')
    page.locator('#bPhone').fill('0500000000')
    page.locator('#bDate').fill('2027-01-13')
    page.locator('#bTotal').fill('1200')
    page.locator('#bookingDepositAmount').fill('500')
    page.evaluate('QA.failRead=true')
    page.locator('button[type=submit][form=bookingForm]').click()
    page.wait_for_function('window.__adwaaLastBookingSaveConfirmed?.verified===false')
    original = page.evaluate("({id:db.bookings[0].id,seq:db.seq,payments:JSON.stringify(db.bookings[0].payments),balance:ResortAccountCore.currentBalance(db)})")
    assert page.evaluate('db.bookings.length') == 1
    assert page.locator('#bId').input_value() == original['id']
    expect(page.locator('#bookingModal')).to_be_visible()
    page.evaluate('QA.failRead=false')
    page.locator('button[type=submit][form=bookingForm]').click()
    page.wait_for_function('window.__adwaaLastBookingSaveConfirmed?.ok===true && window.__adwaaLastBookingSaveConfirmed?.verified!==false',timeout=5000)
    expect(page.locator('#bookingModal')).to_be_hidden()
    after = page.evaluate("({id:db.bookings[0].id,seq:db.seq,payments:JSON.stringify(db.bookings[0].payments),balance:ResortAccountCore.currentBalance(db)})")
    assert after == original, (original, after)
    assert page.evaluate('db.bookings.length') == 1
    # The write commits, but both its response and the reconciliation read fail.
    page.evaluate("openBooking(db.bookings[0].id);QA.loseWriteResponse=true;QA.failRead=true")
    page.locator('#bTotal').fill('1300')
    page.locator('button[type=submit][form=bookingForm]').click()
    page.wait_for_function("window.__adwaaLastBookingSaveConfirmed?.outcome==='unknown'")
    assert page.locator('#bTotal').input_value() == '1300'
    assert page.locator('#bId').input_value() == original['id']
    page.evaluate('QA.loseWriteResponse=false;QA.failRead=false')
    page.locator('button[type=submit][form=bookingForm]').click()
    page.wait_for_function('window.__adwaaLastBookingSaveConfirmed?.ok===true && window.__adwaaLastBookingSaveConfirmed?.verified!==false')
    expect(page.locator('#bookingModal')).to_be_hidden()
    assert page.evaluate('db.bookings.length') == 1
    assert page.evaluate('db.bookings[0].total') == 1300
    assert page.evaluate('db.seq') == original['seq']
    assert page.evaluate('JSON.stringify(db.bookings[0].payments)') == original['payments']
    page.evaluate("()=>{openCustomerProfile(encodeURIComponent(getCustomers()[0].key));markRemoteStateConfirmed=async()=>{throw Error('isolated hash failure')}}")
    page.locator('#customerAdminNotes').fill('ملاحظة محفوظة بعد فشل البصمة')
    page.get_by_role('button', name='حفظ الملاحظات', exact=True).click()
    page.wait_for_function("window.__adwaaLastPersistResult?.ok===true && Object.values(db.customerNotes).includes('ملاحظة محفوظة بعد فشل البصمة')")
    assert page.locator('#customerAdminNotes').input_value() == 'ملاحظة محفوظة بعد فشل البصمة'
    assert errors == [], errors
    print(json.dumps({'width': width, 'height': height, 'result': 'PASS', 'checks': 'write acknowledged/read failed, stable ID/sequence/payment/balance, retry without duplicate, customer note/hash failed, no uncaught errors'}, ensure_ascii=False))
    context.close()


if __name__ == '__main__':
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=os.getenv('CHROMIUM_PATH', '/usr/bin/chromium'), args=['--no-sandbox'])
        for width, height in [(320, 568), (430, 932), (768, 1024), (1024, 768)]:
            run(browser, width, height)
        browser.close()
