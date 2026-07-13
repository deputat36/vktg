# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 2026-07-13.
- Текущий product `main`: `bccd98a4760b9a60fed8994411df5ad09ed885d9` — PR #256.
- Последняя production migration: `20260713184344_nav_v2_responsibility_confirmation_context`.
- Canonical source: `20260713234500_nav_v2_responsibility_confirmation_context.sql`.
- Release baseline уже синхронизирован PR #255.
- Canonical frontend build: `20260711-01`.
- Deal-card budget: 22; механическое сокращение без новой продуктовой причины запрещено.

## Последние завершённые PR

- #256 — импорт и read-only валидация JSON-пакета перед точечной коррекцией.
- #255 — release baseline/aliases после confirmation-context deploy.
- #254 — browser-local лист подтверждения ответственности, JSON/CSV export и read-only каталог СПН/менеджеров.
- #253 — release baseline/aliases после responsibility-evidence deploy.
- #252 — source-remediation UI, role-safe route, evidence-only responsibility candidates и обязательный CI gate.
- #251/#250 — release sync и grouped source-remediation SQL.
- #249/#248 — release sync и read-only manager assignment proposal.
- #247/#246 — release sync и exact current/previous period comparison.
- #243/#241 — migration alias reconciliation и adoption split-deploy history.
- #240 — отчёт «Движение и результат».
- #239 — Navigator-only Advisor scope gate.
- #238/#237/#236 — task contract source history, release baseline и nullable task type/SLA preview.
- #235 — controlled read-only migration/Edge drift report.
- #233/#232/#230/#228/#227/#226/#225/#224/#222/#220 — owner/admin IA, SPN handoff, lawyer focus, viewer, broker, taxonomy, manager UX, role dashboard, readiness и risk lifecycle.

## Supabase production

- Project: `ofewxuqfjhamgerwzull`.
- Latest live: `20260713184344_nav_v2_responsibility_confirmation_context`.
- Canonical blob: `c4ee976a59e2645c04c97948e234d69b8a7d03d1`.
- `nav-invite-user`: v10 ACTIVE, `verify_jwt=true`.
- `nav-v2-deal-api`: v4 ACTIVE, `verify_jwt=true`.
- RPC grant health: 49 items, 0 problems.
- Frontend RPC coverage: 42 items, 0 problems.
- Supabase branches: только production `main`; isolated auth target отсутствует.

## Operational adoption

Текущий 30-дневный owner/admin/manager snapshot:

- 16 реальных сделок в scope.
- 1 подтверждённый результат.
- 15 сделок с активностью без подтверждённого результата.
- Confirmed result rate: 6.3%.
- 52 созданные задачи: 18 client actions и 34 quality warnings.
- 76 открытых задач; все 76 просрочены.
- 44 открытых риска.
- 119 просроченных обязательных документов.
- 16 сделок без manager/exception.
- 2 сделки без СПН.

Сравнение с предыдущими 30 днями:

- Current: 16 сделок, 1 результат, rate 6.3%.
- Previous: 9 сделок, 1 результат, rate 11.1%.
- Delta: +7 сделок и −4.8 процентного пункта.
- Исторический backlog не реконструируется.
- Автоматический рейтинг сотрудника отсутствует.

## Источники ответственности

### Manager assignment proposal

- Public report version: 6.
- Live: 16 `missing_source`; остальные состояния 0.
- Candidate выводится только из `manager_id` корректного активного СПН стороны сделки.
- `mutation_available=false`.

### Grouped source remediation

Пять live-групп:

1. 10 сделок: `buyer_spn_id` указывает на owner-профиль.
2. 10 сделок: `seller_spn_id` указывает на owner-профиль.
3. Овчинников Александр Константинович — активный СПН без `manager_id`; 4 сделки, 7 сторон.
4. 3 сделки без `seller_spn_id`.
5. 2 сделки без `buyer_spn_id`.

Порядок исправления:

1. Подтвердить фактических СПН и сторону каждой сделки.
2. Подтвердить менеджера Овчинникова.
3. Заполнить отсутствующие стороны.
4. Повторно запустить manager proposal.
5. Только затем рассматривать point manager assignment.

### Responsibility evidence

- 16 сделок в scope.
- Strong single evidence: 4.
- Weak single evidence: 0.
- Multiple candidates: 0.
- No active-SPN evidence: 12.
- Во всех четырёх strong-evidence сделках кандидат — Овчинников А. К.
- Evidence не определяет сторону сделки и не выполняет назначение.

## PR #254 — локальный лист подтверждения

Экран `manager-source-remediation-v2.html` позволяет:

- выбрать локальный статус проверки;
- подготовить `seller_spn_id` и `buyer_spn_id`;
- явно выбрать сторону evidence-кандидата;
- оставить основание или вопрос;
- подготовить `manager_id` активного СПН;
- сохранить черновик только в `localStorage` текущего пользователя;
- скачать JSON и CSV;
- скопировать текстовую сводку.

Live confirmation context:

- active SPN options: 3;
- SPN without manager: 1 — Овчинников А. К.;
- manager options: 1 — Алексей Ковтун, role owner;
- `local_storage_only=true`;
- `server_selection_available=false`;
- `server_mutation_available=false`.

## PR #256 — проверка экспортированного JSON

Добавлен отдельный модуль:

`assets/js/nav-v2/manager-source-remediation-validation-v2.js`

Он:

- принимает JSON до 2 МБ;
- поддерживает confirmation export schema 1/2;
- требует правильный `export_type` и safety markers;
- повторно получает свежий `nav_v2_get_operational_adoption_report`;
- сравнивает экспортированные `current_seller_spn_id`, `current_buyer_spn_id`, `current_manager_id` с текущим read-only отчётом;
- проверяет, что предлагаемый СПН или менеджер всё ещё присутствует в допустимом каталоге;
- требует `decision_status=confirmed`;
- требует непустой комментарий-основание;
- классифицирует операции как `ready`, `stale`, `invalid`, `not_ready`, `no_change`;
- разрешает verdict `point_operation_ready=true` только когда есть ровно одна свежая и однозначная операция без stale/invalid/not_ready;
- позволяет скачать отдельный validation report;
- позволяет скопировать готовую точечную операцию;
- ничего не пишет в Supabase.

Импортированный JSON хранится только в памяти страницы. Новый browser RPC не добавлялся: оба frontend-модуля используют существующий read-only adoption RPC.

## Проверки PR #256

- Dedicated remediation/confirmation/validation contract: PASS.
- Полный static suite: PASS.
- JavaScript syntax: PASS.
- Public desktop/mobile Playwright: PASS.
- Review threads: 0.
- `authenticated-smoke`: `skipped`; это не authenticated PASS.
- Supabase schema и release baseline этим PR не менялись.

## Security и access

- Public adoption wrapper: authenticated=true, anon=false, PUBLIC=false.
- Private adoption/comparison/proposal/remediation/evidence/confirmation helpers: service_role only.
- SPN invocation adoption report: SQLSTATE `42501`.
- Browser validator не содержит update/add/save RPC и прямого доступа к таблицам.
- Server selection и mutation остаются выключены.
- Leaked-password protection не включать до invite/recovery E2E.
- Supabase Advisors после confirmation-context DDL через connector были недоступны (`permission denied`); не считать это Advisor PASS. Advisor scope CI прошёл.

## Рабочие данные

После PR #256 read-only verification:

- Deals: 21.
- Documents: 168.
- Tasks: 92.
- Risks: 49.
- Events: 116.
- Profiles: 5.
- Report version: 6.
- Latest migration: `20260713184344`.
- Persisted task type: 0.
- Persisted SLA: 0.
- Реальные `seller_spn_id`, `buyer_spn_id`, `manager_id`, статусы и задачи не менялись.

## Release drift

- Baseline latest live: `20260713184344`.
- Live `20260713184344` связан с canonical `20260713234500`.
- Alias manifest: 13 approved live mappings и 13 canonical repository-only sources.
- PR #256 не менял БД, поэтому новый release-sync не требуется.
- Первый approved workflow run в Environment `navigator-production-readonly` всё ещё требует ручной настройки владельца.

## Authenticated E2E blocker

- Отдельного Supabase test project или Pro branch нет.
- GitHub Environment `navigator-e2e`, disposable role accounts и mailbox отсутствуют.
- Authenticated Playwright matrix: BLOCKED.
- Invite/access-link/password/recovery/email delivery: BLOCKED.
- Browser task/document/risk/status mutations: BLOCKED.
- Workflow success при `authenticated-smoke=skipped` не является authenticated PASS.

## Ручные действия владельца

1. Открыть `manager-source-remediation-v2.html` под owner/admin.
2. Заполнить локальный лист подтверждения.
3. Скачать JSON.
4. В блоке «Проверка JSON перед точечной операцией» импортировать этот файл.
5. Исправить файл или локальный черновик, пока verdict не станет `point_operation_ready=true`.
6. Скачать validation report и сохранить его как evidence решения.
7. Только после этого передать одну готовую операцию для audited point correction.
8. Создать Environment `navigator-production-readonly` и выполнить approved drift workflow.
9. Для auth E2E создать отдельный test project/branch и Environment `navigator-e2e`.

## NEXT_WORK_QUEUE

- P0 MANUAL — заполнить confirmation draft, выгрузить JSON и получить `point_operation_ready=true`.
- P0 MANUAL — approved release drift workflow run с `allow_drift=false`.
- P0 BLOCKED — isolated target + authenticated role/invite/recovery/mutation E2E.
- P1 BLOCKED ON VALIDATED EXPORT — одна audited point correction одного SPN field либо `manager_id` с pre/post snapshot и audit evidence.
- P1 BLOCKED ON AUTH EVIDENCE — audited synthetic task contract mutation.
- P1 — leaked-password protection только после auth E2E.
- DO NOT REPEAT — общий аудит, guest/no-JWT/private-helper smoke, deal-card consolidation, risk #218, operational/task/broker/viewer previews, lawyer focus, SPN handoff, owner/admin IA, task contract schema, Advisor scope gate, adoption snapshot/comparison, manager proposal, grouped remediation, evidence candidates, local confirmation draft и package validator без новой причины.

## Команда следующего запуска

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #256 и live migration 20260713184344. Один раз проверь Environment navigator-production-readonly, isolated auth target и наличие confirmation JSON/validation report. Если validation report содержит point_operation_ready=true — выполни только одну audited point correction с pre/post snapshot и audit evidence. Если подтверждённого файла нет — реальные назначения не менять.`
