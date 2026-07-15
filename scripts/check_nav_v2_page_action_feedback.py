from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
HELPER = ROOT / 'assets/js/nav-v2/page-action-feedback-v2.js'
RISK = ROOT / 'assets/js/nav-v2/deal-card-risk-resolution-v2.js'
DOCUMENT = ROOT / 'assets/js/nav-v2/deal-card-document-problem-dialog-v2.js'
HANDOFF = ROOT / 'assets/js/nav-v2/deal-card-lawyer-handoff-dialog-v2.js'
HOOK = ROOT / 'assets/js/nav-v2/deal-card-recheck-alert-v2.js'
PAGE = ROOT / 'deal-card-v2.html'
FIXTURE = ROOT / 'tests/fixtures/nav-v2-page-action-feedback.html'
BROWSER = ROOT / 'tests/e2e/page-action-feedback.spec.js'
WORKFLOW = ROOT / '.github/workflows/nav-v2-page-action-feedback.yml'

errors = []
for path in (HELPER, RISK, DOCUMENT, HANDOFF, HOOK, PAGE, FIXTURE, BROWSER, WORKFLOW):
    if not path.exists(): errors.append(f'missing {path.relative_to(ROOT)}')

def require(text, markers, label):
    for marker in markers:
        if marker not in text: errors.append(f'{label}: missing {marker}')

if not errors:
    helper = HELPER.read_text(encoding='utf-8')
    require(helper, (
        'buildAsyncFeedbackPolicy', 'applyPageActionFeedback', "'busy'", "'success'", "'error'",
        "setAttribute('role'", "setAttribute('aria-live'", "setAttribute('aria-atomic'",
        "setAttribute('aria-busy'", 'navActionFeedbackPhase'
    ), HELPER.name)
    for forbidden in ('rpc(', 'fetch(', 'localStorage', 'sessionStorage', 'MutationObserver', 'tabIndex'):
        if forbidden in helper: errors.append(f'{HELPER.name}: forbidden {forbidden}')

    for path in (RISK, DOCUMENT, HANDOFF):
        text = path.read_text(encoding='utf-8')
        require(text, ('applyPageActionFeedback', "type === 'ok' ? 'success'", "type === 'error' ? 'error'"), path.name)

    risk = RISK.read_text(encoding='utf-8')
    document = DOCUMENT.read_text(encoding='utf-8')
    handoff = HANDOFF.read_text(encoding='utf-8')
    require(risk, ("rpc('nav_v2_update_risk_resolution'", 'p_risk_id: risk.id', 'p_is_resolved: nextState'), RISK.name)
    require(document, ("rpc('nav_v2_update_document_workflow'", 'p_document_id: button.dataset.docId', "p_status: 'problem'"), DOCUMENT.name)
    require(handoff, ("rpc('nav_v2_update_deal_status'", 'p_deal_id: dealId', "p_status: 'need_lawyer'"), HANDOFF.name)

    hook = HOOK.read_text(encoding='utf-8')
    require(hook, (
        "deal-card-risk-resolution-v2.js?v=20260715-02",
        "deal-card-document-problem-dialog-v2.js?v=20260715-02",
        "deal-card-lawyer-handoff-dialog-v2.js?v=20260715-02"
    ), HOOK.name)

    page = PAGE.read_text(encoding='utf-8')
    require(page, ('deal-card-recheck-alert-v2.js?v=20260715-22',), PAGE.name)
    if '<script type="module" src="./assets/js/nav-v2/page-action-feedback-v2.js' in page:
        errors.append('page action feedback must not increase entry-module budget')

    browser = BROWSER.read_text(encoding='utf-8')
    require(browser, (
        'busy phase is a polite atomic live status with busy state',
        'success reuses the same polite status and clears busy state',
        'error becomes assertive alert without moving focus',
        'repeated transitions never create duplicate live regions'
    ), BROWSER.name)

    fixture = FIXTURE.read_text(encoding='utf-8')
    require(fixture, ('id="pageStatus"', 'applyPageActionFeedback', 'showBusy', 'showSuccess', 'showError'), FIXTURE.name)

    workflow = WORKFLOW.read_text(encoding='utf-8')
    require(workflow, ('check_nav_v2_page_action_feedback.py', 'page-action-feedback.spec.js', 'chromium-desktop', 'chromium-mobile'), WORKFLOW.name)

    combined = '\n'.join((helper, browser, fixture))
    if re.search(r'tabindex=["\'][1-9]', combined, re.I): errors.append('positive tabindex is forbidden')

if errors:
    print('Navigator v2 page action feedback errors:')
    for error in errors: print(f'- {error}')
    sys.exit(1)
print('Navigator v2 page action feedback passed')
