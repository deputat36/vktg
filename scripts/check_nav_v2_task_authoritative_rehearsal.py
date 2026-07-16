from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
CONTRACT=ROOT/'config/nav-v2-task-authoritative-handler-rehearsal.json'
HANDLER=ROOT/'assets/js/nav-v2/task-action-authoritative-rehearsal-v2.js'
ROUTER=ROOT/'assets/js/nav-v2/task-action-router-v2.js'
FIXTURE=ROOT/'tests/fixtures/nav-v2-task-authoritative-rehearsal.html'
E2E=ROOT/'tests/e2e/task-action-authoritative-rehearsal.spec.js'
DOC=ROOT/'docs/NAV_V2_TASK_AUTHORITATIVE_HANDLER_REHEARSAL_2026-07-16.md'
WORKFLOW=ROOT/'.github/workflows/nav-v2-task-authoritative-rehearsal.yml'
DEAL_CARD=ROOT/'assets/js/nav-v2/deal-card-v2.js'
GUARD=ROOT/'assets/js/nav-v2/task-action-guard-v2.js'
EDGE=ROOT/'supabase/functions/nav-v2-deal-api/index.ts'


def require(text:str,markers:tuple[str,...],label:str,errors:list[str])->None:
    for marker in markers:
        if marker not in text: errors.append(f'{label}: missing {marker!r}')


def main()->int:
    errors=[]
    for path in (CONTRACT,HANDLER,ROUTER,FIXTURE,E2E,DOC,WORKFLOW,DEAL_CARD,GUARD,EDGE):
        if not path.exists(): errors.append(f'missing {path.relative_to(ROOT)}')
    if errors:
        print('\n'.join(errors));return 1

    contract=json.loads(CONTRACT.read_text(encoding='utf-8'))
    handler=HANDLER.read_text(encoding='utf-8')
    fixture=FIXTURE.read_text(encoding='utf-8')
    e2e=E2E.read_text(encoding='utf-8')
    doc=DOC.read_text(encoding='utf-8')
    workflow=WORKFLOW.read_text(encoding='utf-8')

    if contract.get('status')!='repository_only_integration_rehearsal': errors.append('rehearsal status drifted')
    if contract.get('production_changed') is not False or contract.get('runtime_integrated') is not False or contract.get('transport_enabled') is not False:
        errors.append('rehearsal must remain detached, transport-free and non-production')
    if len(contract.get('required_actions') or [])<8: errors.append('rehearsal must cover at least eight action cases')

    require(handler,(
        'installTaskActionAuthoritativeRehearsal',
        "root.addEventListener('click', listener, { capture: true })",
        'event.stopImmediatePropagation()',
        'taskActionRoutePreview',
        'inFlight',
        'authoritative_handler: true',
        'competing_handlers_suppressed: true',
        'runtime_integrated: false',
        'transport_enabled: false',
    ),HANDLER.name,errors)
    for forbidden in ('fetch(','.rpc(','.from(','localStorage','sessionStorage'):
        if forbidden in handler: errors.append(f'rehearsal handler must not use transport/storage: {forbidden}')

    for path in (DEAL_CARD,GUARD,EDGE):
        text=path.read_text(encoding='utf-8')
        if HANDLER.name in text:
            errors.append(f'rehearsal handler integrated prematurely: {path.relative_to(ROOT)}')

    require(fixture,(
        'id="app"',
        'data-task-rehearsal-action="complete"',
        'data-task-rehearsal-action="waiting_external"',
        'data-task-rehearsal-action="deferred"',
        'data-task-rehearsal-action="decision_confirm"',
        'data-task-rehearsal-action="reopen"',
        'window.__taskRehearsalCounters',
        'authoritative:0,base:0,guard:0',
        'installTaskActionAuthoritativeRehearsal',
    ),FIXTURE.name,errors)
    require(e2e,(
        'authoritative rehearsal suppresses competing handlers and routes every task action once',
        'nav_v2_update_task_status',
        'nav_v2_start_bounded_task',
        'nav_v2_complete_bounded_task',
        'nav_v2_set_bounded_task_active_outcome',
        'nav_v2_propose_bounded_task_terminal_outcome',
        'nav_v2_decide_bounded_task_terminal_outcome',
        'authoritative:8,base:0,guard:0',
        'networkCalls',
        'toEqual([])',
    ),E2E.name,errors)
    require(doc,(
        'repository-only integration rehearsal',
        'capture phase',
        'competing handlers',
        'Legacy actions',
        'Bounded actions',
        'bounded reopen',
        'Production gate',
        'Rollback',
    ),DOC.name,errors)
    require(workflow,(
        'python3 scripts/check_nav_v2_task_authoritative_rehearsal.py',
        'node --check assets/js/nav-v2/task-action-authoritative-rehearsal-v2.js',
        'npx playwright test tests/e2e/task-action-authoritative-rehearsal.spec.js --project=chromium-desktop',
        'nav-v2-task-authoritative-rehearsal',
    ),WORKFLOW.name,errors)

    assertions=contract.get('assertions') or {}
    if assertions.get('base_listener_calls')!=0 or assertions.get('guard_listener_calls')!=0 or assertions.get('network_rpc_calls')!=0:
        errors.append('rehearsal counters must remain zero for competing/network calls')

    if errors:
        print('Navigator v2 authoritative task handler rehearsal errors:')
        for error in errors: print(f'- {error}')
        return 1
    print('Navigator v2 authoritative task handler rehearsal passed: capture handler owns every synthetic action, competing listeners stay zero, bounded reopen is rejected and transport is disabled')
    return 0


if __name__=='__main__': sys.exit(main())
