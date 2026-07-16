from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
PAGE=ROOT/'bounded-task-ui-preview-v2.html'
STYLE=ROOT/'assets/css/nav-v2-bounded-task-ui-preview.css'
UI=ROOT/'assets/js/nav-v2/bounded-task-ui-preview-v2.js'
ADAPTER=ROOT/'assets/js/nav-v2/bounded-task-server-adapter-v2.js'
FIXTURES=ROOT/'fixtures/nav-v2-bounded-task-ui-preview-scenarios.json'
SEMANTIC=ROOT/'scripts/check-nav-v2-bounded-task-ui-preview.mjs'
DOC=ROOT/'docs/NAV_V2_BOUNDED_TASK_UI_PREVIEW_2026-07-16.md'
WORKFLOW=ROOT/'.github/workflows/nav-v2-bounded-task-ui-preview.yml'
BUDGET=ROOT/'config/nav-v2-module-budget.json'
ROLE_MENU=ROOT/'assets/js/nav-v2/role-menu-v2.js'


def require(text:str,markers:tuple[str,...],label:str,errors:list[str])->None:
    for marker in markers:
        if marker not in text:errors.append(f'{label}: missing {marker!r}')


def main()->int:
    errors=[]
    paths=(PAGE,STYLE,UI,ADAPTER,FIXTURES,SEMANTIC,DOC,WORKFLOW,BUDGET,ROLE_MENU)
    for path in paths:
        if not path.exists():errors.append(f'missing {path.relative_to(ROOT)}')
    if errors:
        print('\n'.join(errors));return 1

    page=PAGE.read_text(encoding='utf-8')
    style=STYLE.read_text(encoding='utf-8')
    ui=UI.read_text(encoding='utf-8')
    adapter=ADAPTER.read_text(encoding='utf-8')
    fixtures=json.loads(FIXTURES.read_text(encoding='utf-8'))
    semantic=SEMANTIC.read_text(encoding='utf-8')
    doc=DOC.read_text(encoding='utf-8')
    workflow=WORKFLOW.read_text(encoding='utf-8')
    budget=json.loads(BUDGET.read_text(encoding='utf-8'))
    role_menu=ROLE_MENU.read_text(encoding='utf-8')

    require(page,(
        'Repository-only synthetic preview',
        'Действия по legacy и bounded-задачам',
        'boundedTaskPreviewRole',
        'boundedTaskPreviewList',
        'boundedTaskPreviewInspector',
        'assets/css/nav-v2-bounded-task-ui-preview.css?v=20260716-01',
        'assets/js/nav-v2/bounded-task-ui-preview-v2.js?v=20260716-01',
    ),PAGE.name,errors)
    if 'supabase.co' in page or 'connect-src' in page:
        errors.append('preview page must not declare Supabase/network connectivity')
    if 'bounded-task-ui-preview-v2.html' in role_menu:
        errors.append('repository-only UI preview must not be in production role menu')
    if (budget.get('pages') or {}).get(PAGE.name)!={'max_modules':1}:
        errors.append('bounded task UI preview must have a one-module budget')

    require(ui,(
        "from './bounded-task-server-adapter-v2.js?v=20260716-01'",
        'export const BOUNDED_TASK_UI_SAMPLES',
        'export function boundedTaskUiModel',
        'export function boundedTaskUiRpcPreview',
        'export function boundedTaskUiFields',
        "legacy_status_path:true",
        "action==='complete'",
        "action==='waiting_external'",
        "action==='deferred'",
        "action==='propose_replaced'",
        "action==='decision_confirm'||action==='decision_reject'",
        "Reopen запрещён",
        'данные никуда не отправляются',
        'Transport, Supabase mutation и изменение synthetic task отключены.',
    ),UI.name,errors)
    for forbidden in ("rpc(","fetch(",".from(","localStorage","sessionStorage"):
        if forbidden in ui:errors.append(f'UI preview must remain transport/storage-free: {forbidden}')

    for name in (
        'boundedTaskStartRpcPreview','boundedTaskCompleteRpcPreview',
        'boundedTaskActiveOutcomeRpcPreview','boundedTaskTerminalProposalRpcPreview',
        'boundedTaskTerminalDecisionRpcPreview'
    ):
        if name not in adapter or name not in ui:errors.append(f'adapter integration missing: {name}')

    require(style,(
        '.bounded-task-preview-layout',
        '.bounded-task-preview-actions',
        '.bounded-task-preview-inspector',
        '@media(max-width:640px)',
    ),STYLE.name,errors)

    if fixtures.get('schema_version')!=1 or fixtures.get('synthetic_only') is not True:
        errors.append('UI preview fixtures must remain schema v1 synthetic-only')
    if len(fixtures.get('action_cases') or [])<10:errors.append('action matrix must contain at least ten cases')
    if len(fixtures.get('rpc_cases') or [])<7:errors.append('RPC matrix must contain at least seven cases')

    require(semantic,(
        'boundedTaskUiModel',
        'boundedTaskUiRpcPreview',
        'complete_missing_evidence',
        'Reopen запрещён',
        'transport-free RPC previews',
    ),SEMANTIC.name,errors)

    require(doc,(
        'repository-only UI preview',
        'Legacy actions',
        'Bounded actions',
        'Evidence',
        'Waiting external',
        'Deferred',
        'terminal outcome',
        'не вызывает Supabase',
        'не добавлена в role menu',
        'Production gate',
        'Rollback',
    ),DOC.name,errors)

    require(workflow,(
        'python3 scripts/check_nav_v2_bounded_task_ui_preview.py',
        'node scripts/check-nav-v2-bounded-task-ui-preview.mjs',
        'node --check assets/js/nav-v2/bounded-task-ui-preview-v2.js',
        'nav-v2-bounded-task-ui-preview',
    ),WORKFLOW.name,errors)

    if errors:
        print('Navigator v2 bounded task UI preview errors:')
        for error in errors:print(f'- {error}')
        return 1
    print('Navigator v2 bounded task UI preview passed: role-aware legacy/governed actions, evidence/outcome forms and no production transport')
    return 0

if __name__=='__main__':sys.exit(main())
