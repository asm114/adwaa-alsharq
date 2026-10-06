"""Isolated browser regression: python tests/maintenance-expense-linker.browser.py.
Requires Playwright and Chromium/WebKit. All HTTP requests are intercepted; no live data writes.
"""
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
    'let saved=structuredClone(seed);',
    "let saved=JSON.parse(localStorage.getItem('maintenance-linker-qa')||'null')||structuredClone(seed);").replace(
    'saved=structuredClone(payload.data)',
    "{saved=structuredClone(payload.data);localStorage.setItem('maintenance-linker-qa',JSON.stringify(saved))}")


def route(request):
    url = urlparse(request.request.url)
    if url.hostname != 'qa.invalid':
        return request.abort()
    path = url.path.lstrip('/') or 'index.html'
    if path == 'index.html':
        return request.fulfill(body=HTML, content_type='text/html')
    if path == 'tests/workspace-mock.js':
        return request.fulfill(body=MOCK, content_type='text/javascript')
    file = ROOT / path
    if file.is_file():
        return request.fulfill(body=file.read_bytes(), content_type=mimetypes.guess_type(path)[0] or 'text/plain')
    request.fulfill(status=404, body='Not found')


def run(browser, width, label):
    context = browser.new_context(viewport={'width': width, 'height': 850}, is_mobile=width < 500, has_touch=width < 500)
    context.route('**/*', route)
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('dialog', lambda dialog: dialog.accept())
    page.goto('https://qa.invalid/index.html')
    page.wait_for_function("typeof openMaintenanceExpenseLinker==='function' && typeof persist==='function' && window.__adwaaBookingPersistUpdatePathInstalled")
    page.wait_for_timeout(800)
    page.evaluate('''async()=>{
      db.maintenanceJobs=[{id:'m1',title:'صيانة كهرباء',vendor:'فني',totalAmount:1200,payments:[]},
        {id:'m2',title:'عمل مفتوح',vendor:'فني',totalAmount:0,finalCostKnown:false,payments:[]},
        {id:'m3',title:'مرجع سابق',totalAmount:500,payments:[{id:'reverse',expenseId:'reverse',amount:50}]}];
      db.installmentPurchases=[{id:'ip1',title:'شراء',payments:[{id:'ip-ref',expenseId:'ip-reverse',amount:50}]}];
      db.expenses=[['e1',700],['e2',300],['e3',200],['other-job',50],['reverse',50],['ip-reverse',50],['salary',50],['zero',0],['duplicate',20],['duplicate',20]].map(([id,amount])=>({id,title:id,amount,date:'2026-09-01',cat:'عام',createdAt:'2026-09-01T10:00:00Z',updatedAt:'2026-09-02T10:00:00Z'}));
      delete db.expenses.find(e=>e.id==='e2').date;delete db.expenses.find(e=>e.id==='e2').createdAt;
      db.resortAccount.calibration={balance:4000,at:'2026-09-03T00:00:00Z'};
      db.expenses.find(e=>e.id==='other-job').maintenanceJobId='m3';
      db.expenses.find(e=>e.id==='salary').salaryMonth='2026-09';
      await persist();renderAccountingNotes();switchView('expenses');document.querySelector('[data-finance-view=maintenance]').click();
    }''')
    page.wait_for_timeout(150)
    before = page.evaluate("({rows:db.expenses.map(e=>[e.id,e.amount,e.date,e.createdAt,e.updatedAt,e.cat]),count:db.expenses.length,balance:ResortAccountCore.currentBalance(db),bookings:JSON.stringify(db.bookings),seq:db.seq,writes:QA.writes})")
    cards = page.locator('#maintenanceList .fo-card')
    card = cards.filter(has=page.locator("button[onclick=\"openMaintenanceJob('m1')\"]"))
    card.locator('.link-existing-expenses').click()
    modal = page.locator('#maintenanceExpenseLinkModal')
    expect(modal).to_be_visible()
    modal.locator('.close').click()
    expect(modal).to_be_hidden()
    card.locator('.link-existing-expenses').click()
    choices = page.locator('.maintenance-expense-choice')
    assert sorted(choices.evaluate_all('(es)=>es.map(e=>e.value)')) == ['e1', 'e2', 'e3']
    page.locator('.maintenance-expense-choice[value=e1]').check()
    page.locator('#maintenanceExpenseSearch').fill('e2')
    page.locator('.maintenance-expense-choice[value=e2]').check()
    page.locator('#maintenanceExpenseSearch').fill('')
    expect(page.locator('.maintenance-expense-choice[value=e1]')).to_be_checked()
    page.evaluate("QA.delay=100;document.getElementById('confirmMaintenanceExpenseLinks').click();document.getElementById('confirmMaintenanceExpenseLinks').click()")
    expect(modal).to_be_hidden()
    page.wait_for_timeout(200)
    after = page.evaluate("({rows:db.expenses.map(e=>[e.id,e.amount,e.date,e.createdAt,e.updatedAt,e.cat]),count:db.expenses.length,balance:ResortAccountCore.currentBalance(db),bookings:JSON.stringify(db.bookings),seq:db.seq,writes:QA.writes,summary:ResortAccountCore.maintenanceSummary(db.maintenanceJobs[0]),linked:db.maintenanceJobs[0].payments.length})")
    for key in ['rows', 'count', 'balance', 'bookings', 'seq']:
        assert after[key] == before[key], (label, key, before[key], after[key])
    assert after['writes'] == before['writes'] + 1
    assert after['linked'] == 2
    assert after['summary'] == {'total': 1200, 'paid': 1000, 'remaining': 200, 'status': 'partial'}
    assert card.locator('.maintenance-existing-label').count() == 2
    # Re-read from the synthetic server after a real reload, not just the live JS objects.
    page.reload()
    page.wait_for_function("typeof openMaintenanceExpenseLinker==='function' && db.maintenanceJobs?.length===3")
    page.wait_for_timeout(700)
    assert page.evaluate("db.maintenanceJobs[0].payments.length") == 2
    assert page.evaluate("ResortAccountCore.currentBalance(db)") == before['balance']
    page.evaluate("switchView('expenses');document.querySelector('[data-finance-view=maintenance]').click();openMaintenanceExpenseLinker('m1')")
    assert choices.count() == 1
    page.locator('.maintenance-expense-choice[value=e3]').check()
    page.evaluate("db.expenses.find(e=>e.id==='e3').maintenanceJobId='m2'")
    page.locator('#confirmMaintenanceExpenseLinks').click()
    expect(page.locator('#maintenanceExpenseLinkStatus')).to_contain_text('غير مؤهل')
    assert page.evaluate("db.maintenanceJobs[0].payments.length") == 2
    page.evaluate("delete db.expenses.find(e=>e.id==='e3').maintenanceJobId")
    page.locator('#maintenanceExpenseSearch').fill('e3')
    page.locator('.maintenance-expense-choice[value=e3]').check()
    page.locator('#confirmMaintenanceExpenseLinks').click()
    expect(modal).to_be_hidden()
    assert page.evaluate("ResortAccountCore.maintenanceSummary(db.maintenanceJobs[0]).status") == 'paid'
    # Unknown-final-cost cards must remain responsive; linking an expense must not overpay a known final cost.
    page.evaluate("db.expenses.push({id:'late',title:'مصروف زائد',amount:10,date:'2026-08-01'});renderAccountingNotes();openMaintenanceExpenseLinker('m1')")
    page.locator('.maintenance-expense-choice[value=late]').check()
    page.locator('#confirmMaintenanceExpenseLinks').click()
    expect(page.locator('#maintenanceExpenseLinkStatus')).to_contain_text('تتجاوز المتبقي')
    assert page.evaluate("db.maintenanceJobs[0].payments.length") == 3
    modal.locator('.close').click()
    before_retry_balance = page.evaluate('ResortAccountCore.currentBalance(db)')
    page.evaluate("openMaintenanceExpenseLinker('m2')")
    page.locator('.maintenance-expense-choice[value=late]').check()
    page.evaluate('QA.fail=true')
    page.locator('#confirmMaintenanceExpenseLinks').click()
    expect(page.locator('#maintenanceExpenseLinkStatus')).to_contain_text('تعذر تأكيد حفظ الربط')
    expect(modal).to_be_visible()
    assert page.evaluate("db.maintenanceJobs[1].payments.length") == 1
    modal.locator('.close').click()
    page.evaluate("openMaintenanceExpenseLinker('m2');QA.fail=false")
    page.locator('#confirmMaintenanceExpenseLinks').click()
    expect(modal).to_be_hidden()
    assert page.evaluate("db.maintenanceJobs[1].payments.length") == 1
    assert page.evaluate("db.expenses.filter(e=>e.id==='late').length") == 1
    assert page.evaluate('ResortAccountCore.currentBalance(db)') == before_retry_balance
    page.evaluate("openMaintenanceExpenseLinker('m2')")
    expect(page.locator('#maintenanceExpenseCandidates')).to_contain_text('لا توجد مصروفات سابقة مؤهلة')
    expect(page.locator('#confirmMaintenanceExpenseLinks')).to_be_disabled()
    # Check layout with a visible modal at mobile widths.
    assert modal.evaluate('(m)=>m.querySelector(".sheet").scrollWidth<=m.querySelector(".sheet").clientWidth+2')
    modal.locator('.close').click()
    # Unlink uses the original movement. Editing from either entry point cannot change its historic amount.
    balance = page.evaluate('ResortAccountCore.currentBalance(db)')
    page.evaluate("openExpense('e1');openMaintenancePayment('m1',db.maintenanceJobs[0].payments[0].id)")
    assert page.evaluate("db.expenses.find(e=>e.id==='e1').amount") == 700
    page.evaluate("deleteMaintenancePayment('m1',db.maintenanceJobs[0].payments[0].id)")
    page.wait_for_function("!db.expenses.find(e=>e.id==='e1').maintenancePaymentId")
    assert page.evaluate('ResortAccountCore.currentBalance(db)') == balance
    assert page.evaluate('db.expenses.length') == before['count'] + 1
    assert not errors, (label, errors)
    assert page.evaluate('QA.errors.length') == 0
    print(json.dumps({'browser': label, 'width': width, 'result': 'PASS', 'checks': 'open/close, eligibility, search selection, duplicate click, save, balance, reload, partial/paid, overpayment, open-cost responsiveness, failure/retry, empty state, unlink, edit guard, console'}, ensure_ascii=False))
    context.close()


if __name__ == '__main__':
    with sync_playwright() as playwright:
        chromium = playwright.chromium.launch(executable_path=os.getenv('CHROMIUM_PATH', '/usr/bin/chromium'), args=['--no-sandbox'])
        for width in [1280, 390, 320]:
            run(chromium, width, 'Chromium')
        chromium.close()
        webkit = playwright.webkit.launch(executable_path=os.getenv('WEBKIT_PATH'))
        run(webkit, 390, 'WebKit')
        webkit.close()
