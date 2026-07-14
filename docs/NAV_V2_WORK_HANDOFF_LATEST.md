# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 2026-07-14.
- Текущий `main`: `f4cdd54650d1f39e7449d86068217156ae92a869` — merge PR #288.
- Supabase project: `ofewxuqfjhamgerwzull`.
- Последняя production migration: `20260714125054_nav_v2_exact_duplicate_review_pack`.
- Public operational report version: 8.
- Frontend build baseline: `20260711-01`; dashboard local cache-bust: `20260714-01`.
- Open PR: нет после merge #288.
- Supabase branches: только production `main`.
- Isolated authenticated target: не создан.
- `authenticated-smoke=skipped` не является authenticated PASS.

## Последний продуктовый срез — PR #288

Рабочий стол перестроен вокруг вопроса «что делать сейчас», а не вокруг длинного списка карточек.

Файлы:

- `dashboard-v2.html`;
- `assets/js/nav-v2/dashboard-v2.js`;
- `assets/js/nav-v2/dashboard-priority-v2.js`;
- `assets/css/nav-v2-role-home.css`;
- `scripts/check_nav_v2_dashboard_priority.py`;
- `scripts/check-nav-v2-dashboard-priority.mjs`;
- `.github/workflows/nav-v2-dashboard-priority.yml`.

Что изменилось:

- показываются три приоритетные сделки;
- у каждой сделки есть понятная причина приоритета;
- действия адаптированы под owner/admin/manager/SPN/lawyer/broker/viewer;
- demo-карточки исключаются из рабочей сводки;
- точные повторы объединяются, ранняя карточка остаётся в сводке;
- KPI показывают красные риски, просроченные задачи, документы и готовность к задатку;
- профиль и техническая помощь свёрнуты;
- вместо всех карточек показываются шесть последних рабочих сделок;
- используется прежний единственный RPC `nav_v2_get_deals_list`.

Проверки PR #288:

- dedicated dashboard priority contract: PASS;
- semantic role ranking/demo/deduplication: PASS;
- full static suite: PASS;
- role contract: PASS;
- JavaScript syntax: PASS;
- public desktop/mobile Playwright: PASS;
- review threads: 0;
- authenticated smoke: skipped.

## Живой backlog, на котором строится UX

Read-only snapshot после merge #288:

- Profiles: 5;
- Deals: 23;
- Tasks: 98;
- Risks: 53;
- Documents: 198;
- Events: 118;
- Overdue open tasks: 92;
- Open blocking risks: 53;
- Open/unassigned documents: 198;
- Latest live migration: `20260714125054`.

PR #288 не менял Supabase schema, grants, functions, Auth users или рабочие строки.

## Security и release state

### Release drift

- latest migration совпадает с baseline: `20260714125054`;
- live → canonical alias: `20260714125054` → `20260714130000`;
- canonical source blob: `cd6c0962b7f3bfcce5bc3b51fe717fbfca100a14`;
- Edge versions/status/verify_jwt/bundle hashes совпадают с baseline;
- connector-equivalent evidence: `docs/NAV_V2_LIVE_VERIFICATION_20260714.md`;
- ручной workflow `navigator-production-readonly` с `allow_drift=false` ещё не запускался.

### Edge no-JWT observability

PR #284 добавил query marker и `probe_id` для ожидаемых no-JWT smoke. Production logs подтвердили маркированные `401`; JWT-защита не ослаблена.

### Security Advisor whitelist

PR #286 закрепил live attestation:

- expected Navigator v2 SECURITY DEFINER warnings: 48;
- observed: 48;
- missing: 0;
- unexpected: 0;
- SECURITY INVOKER exceptions: `nav_v2_update_document_status`, `nav_v2_get_frontend_coverage_health`.

Массовый revoke запрещён. Leaked-password protection остаётся заблокирована до isolated invite/recovery/role E2E.

## Exact duplicate review

Страница:

`operational-duplicate-review-v2.html`

Live summary:

- groups: 4;
- deals: 8;
- exact semantic groups: 4;
- diverged groups: 0;
- groups with comments/reviews: 0;
- `selection_available=false`;
- `mutation_available=false`;
- `cleanup_execution_available=false`;
- `owner_decision_required=true`.

Owner decision export:

`navigator_v2_exact_duplicate_owner_decision`

Issue #273 остаётся открытой. Без owner decision не готовить cleanup mutation.

## Operational pilot artifact chain

Не предоставлены:

1. `navigator_v2_operational_pilot_owner_decision`;
2. `navigator_v2_operational_pilot_owner_decision_validation`;
3. `navigator_v2_operational_pilot_measurement_baseline`;
4. `navigator_v2_operational_pilot_action_checklist`;
5. `navigator_v2_operational_pilot_owner_start_confirmation`;
6. `navigator_v2_operational_pilot_responsible_acknowledgement_evidence`.

Responsible acknowledgement остаётся внешним evidence:

- `acknowledgement_is_authenticated_self_action=false`;
- `authenticated_self_acknowledgements=0`;
- `execution_authorized=false`;
- `pilot_started=false`.

Pilot mutation запрещена до полного комплекта и подтверждения identity ответственного.

## Responsibility correction workflow

Заблокирован до четырёх файлов:

1. confirmation JSON;
2. validation report с `point_operation_ready=true`;
3. fresh server preview с fingerprint;
4. bundle manifest с `bundle_ready=true`.

Без полного bundle не изменять `seller_spn_id`, `buyer_spn_id`, `manager_id`.

## Isolated authenticated E2E target

Issue #282 — ручное подтверждение расходов.

Последний cost snapshot:

- Micro preview branch: USD 0.01344/hour;
- max planned lifetime: 6 hours;
- planned compute ceiling: USD 0.08064;
- egress/storage могут добавить расходы;
- preview branch usage не защищён Spend Cap.

Состояние:

- `status=approval_required`;
- `confirmed=false`;
- `branch_creation_allowed=false`.

Без точного approval не вызывать `confirm_cost`, не создавать branch/Auth users/secrets.

## UX_NEXT_WORK_QUEUE

Приоритет — не добавлять новые отчёты, а сокращать путь пользователя до результата.

1. Сделки: быстрые режимы «требует внимания / просрочено / без ответственного / готово к задатку» и рабочий default без demo.
2. Карточка сделки: один заметный блок «следующее действие», ответственный, срок и критерий результата.
3. Менеджер: действия из очереди без лишнего перехода по техническим экранам.
4. СПН: понятный маршрут «исправить замечание → отправить повторно → увидеть подтверждение».
5. Юрист: документный цикл в одном экране с причиной блокировки и следующим шагом.
6. Мобильная навигация: сократить количество равнозначных кнопок и сохранить основные действия в пределах первого экрана.
7. Измерение UX: число кликов до действия, доля сделок с зафиксированным результатом, просроченный backlog и возвраты на доработку.

## NEXT_WORK_QUEUE

- P1 UX — улучшить список сделок быстрыми рабочими режимами; frontend-only, без нового RPC.
- P1 UX — сделать action-first блок карточки сделки на основе существующего payload.
- P0 MANUAL — owner/admin экспортирует `navigator_v2_exact_duplicate_owner_decision`.
- P0 MANUAL — предоставить шесть pilot-файлов.
- P0 MANUAL — предоставить четыре responsibility evidence-файла.
- P0 MANUAL — запустить production-readonly drift workflow с `allow_drift=false`.
- P0 MANUAL COST APPROVAL — подтвердить issue #282 точной формулировкой.
- P1 BLOCKED ON AUTH EVIDENCE — audited synthetic task-contract mutation и leaked-password protection.

## DO NOT REPEAT без новой причины

- общий технический аудит;
- public guest/no-JWT/private-helper smoke;
- механическое сокращение deal-card;
- risk lifecycle #218;
- readiness/task taxonomy/broker/viewer/lawyer previews;
- owner/admin IA;
- adoption report/comparison;
- manager proposal/remediation;
- responsibility draft/validation/preview/bundle;
- pilot scaffolding;
- browser save lock и exact duplicate trigger;
- duplicate comparison pack;
- isolated E2E runbook/cost scaffold;
- Edge probe observability;
- Advisor whitelist attestation;
- action-first dashboard PR #288.

## Команда следующего запуска

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #288. Сначала проверь ручные gates один раз. Если они пусты, продолжай UX_NEXT_WORK_QUEUE: улучши список сделок быстрыми режимами и понятным рабочим default, используя существующий nav_v2_get_deals_list, без новых RPC и без production mutations.`
