# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 2026-07-14.
- Текущий product `main`: `cb9318cc4c537aebf9a2c89d5b35457d3d625dd2` — PR #266.
- Последняя production migration: `20260714064311_nav_v2_operational_pilot_shortlist`.
- Canonical migration: `20260714013000_nav_v2_operational_pilot_shortlist.sql`.
- Release baseline синхронизирован PR #263.
- PR #264 и #266 frontend-only: schema, grants, Edge Functions и production rows не менялись.
- Canonical frontend build: `20260711-01`.
- Deal-card budget: 22; механическое сокращение без новой продуктовой причины запрещено.

## Последние завершённые PR

- #266 — свежая локальная проверка owner decision JSON и confirmed-only measurement baseline.
- #265 — handoff после owner decision package.
- #264 — browser-local owner/admin решение по трём operational pilot lanes и JSON package.
- #263 — release baseline/aliases после deploy pilot shortlist.
- #262 — прозрачный read-only shortlist трёх реальных сделок для операционного пилота.
- #261/#260 — handoff и локальная проверка responsibility evidence bundle с SHA-256 manifest.
- #259/#258 — release sync и owner/admin server preview одной responsibility correction.
- #257/#256 — handoff и импорт/локальная валидация responsibility confirmation JSON.
- #255/#254 — release sync и browser-local лист подтверждения ответственности.
- #253/#252 — release sync, source-remediation UI и evidence-only candidates.
- #251/#250 — release sync и grouped source-remediation SQL.
- #249/#248 — release sync и read-only manager assignment proposal.
- #247/#246 — release sync и exact current/previous adoption comparison.
- #240 — отчёт «Движение и результат».

## Supabase production

- Project: `ofewxuqfjhamgerwzull`.
- Live pilot shortlist: `20260714064311_nav_v2_operational_pilot_shortlist`.
- Public operational report version: 7.
- Pilot shortlist version: 1.
- `nav-invite-user`: v10 ACTIVE, `verify_jwt=true`.
- `nav-v2-deal-api`: v4 ACTIVE, `verify_jwt=true`.
- RPC grant health: 50 items, 0 problems.
- Frontend RPC coverage: 43 items, 0 problems.
- Public operational wrapper: authenticated=true, anon=false, PUBLIC=false.
- Private pilot helper: service_role=true, authenticated=false, anon=false, PUBLIC=false.
- Supabase branches: только production `main`; isolated auth target отсутствует.

Контроль после merge PR #266 выполнен в owner-context внутри транзакции с `ROLLBACK`:

- latest migration: `20260714064311`;
- report version: 7;
- pilot version: 1;
- shortlist count: 3;
- Deals: 21;
- Tasks: 92;
- Risks: 49;
- Documents: 168;
- Events: 116;
- Profiles: 5.

Реальные `seller_spn_id`, `buyer_spn_id`, `manager_id`, статусы, задачи, риски и документы не менялись.

## Operational adoption

30-дневный read-only snapshot:

- 16 реальных сделок в scope;
- 1 сделка с подтверждённым результатом;
- 15 сделок с активностью без подтверждённого результата;
- confirmed result rate: 6,3%;
- 76 открытых задач, все просрочены;
- 44 открытых риска;
- 119 просроченных обязательных документов;
- 16 сделок без manager/exception;
- 2 сделки без СПН.

Сравнение с предыдущими 30 днями:

- Current: 16 сделок, 1 результат, 6,3%;
- Previous: 9 сделок, 1 результат, 11,1%;
- Delta: +7 сделок и −4,8 процентного пункта;
- исторический backlog не реконструируется;
- рейтинг сотрудников отсутствует.

## Operational pilot shortlist

Shortlist остаётся только read-only предложением:

- `preview_only=true`;
- `selection_available=false`;
- `mutation_available=false`;
- `ranking_is_not_employee_rating=true`;
- `owner_decision_required=true`.

### Быстрый пилотный цикл

- Deal ID: `a6740629-8e36-4fb9-8b3f-08510fd0497f`.
- Адрес: Пушкинская 97-11.
- Готовность к сделке: 55%.
- Открытые/просроченные задачи: 5/5.
- Открытых обязательных документов: 8; просроченных: 0; бесхозных: 0.
- Рисков, блокирующих сделку: 2.
- Active-SPN evidence отсутствует.

### Подтверждение ответственности

- Deal ID: `03029d49-6e43-47b6-856e-4886f0ac320a`.
- Адрес: Танцырей.
- Evidence-кандидат: Овчинников Александр Константинович.
- Типов сигналов: 5; действий: 8.
- Открытые/просроченные задачи: 3/3.
- Открытых обязательных документов: 11; все 11 без assigned_to/responsible_role.
- Рисков, блокирующих сделку: 2.
- У evidence-кандидата отсутствует `manager_id`.

### Документный рабочий цикл

- Deal ID: `a696d7f8-6c9f-4a2b-87e9-3a7594a31787`.
- Адрес: Приборная.
- Готовность к сделке: 45%.
- Значимых событий: 5.
- Открытые/просроченные задачи: 5/5.
- Подтверждено документов: 2.
- Открытых обязательных документов: 9; просроченных: 6; бесхозных: 0.
- Рисков, блокирующих сделку: 2.

## Owner decision package

Экран:

`operational-pilot-decision-v2.html`

Возможности:

- доступ только owner/admin;
- один существующий read-only RPC `nav_v2_get_operational_adoption_report`;
- решение `confirmed` или `rejected` по каждому lane;
- основание не короче 10 символов;
- browser-memory only, без localStorage/sessionStorage;
- экспорт `navigator_v2_operational_pilot_owner_decision`;
- `decision_package_ready=true` только после рассмотрения всех трёх lane валидным owner/admin.

Safety markers:

- `browser_local_only=true`;
- `server_mutation_available=false`;
- `automatic_selection_available=false`;
- `pilot_started=false`;
- `pilot_start_authorized=false`;
- `requires_manual_pilot_start=true`;
- `requires_fresh_readonly_revalidation=true`;
- `requires_separate_measurement_baseline=true`.

Готовый owner package не запускает пилот и не разрешает mutation.

## PR #266 — fresh validation и measurement baseline

Новый экран:

`operational-pilot-decision-validation-v2.html`

Переход доступен с экрана owner decision как «Проверить скачанный JSON».

Экран:

- принимает JSON до 2 МБ;
- читает файл только в памяти браузера;
- использует ровно один существующий read-only RPC;
- доступен только owner/admin;
- проверяет export type, schema version, owner/admin автора, summary и safety markers;
- проверяет report version, pilot version и `shortlist_key`;
- сравнивает свежие карточки по lane, deal id, готовности, ответственности, evidence, задачам, рискам, документам, причинам, ограничениям и safe action;
- любое изменение контролируемого поля переводит решение в `stale`;
- не использует localStorage/sessionStorage;
- ничего не отправляет в Supabase.

Validation export:

- `export_type=navigator_v2_operational_pilot_owner_decision_validation`;
- `schema_version=1`;
- `decision_package_valid=true` означает корректную структуру исходного файла;
- `fresh_revalidation_passed=true` означает полное совпадение со свежим shortlist;
- состояния: `confirmed_ready_for_baseline`, `rejected_verified`, `stale`, `invalid`;
- `measurement_baseline_ready=true` только при валидном, свежем пакете и минимум одной `confirmed` сделке.

Measurement baseline export:

- `export_type=navigator_v2_operational_pilot_measurement_baseline`;
- включает только актуальные `confirmed` deals;
- фиксирует baseline readiness, tasks, risks, documents и responsibility snapshot;
- содержит lane-specific measurement contract;
- не создаёт action/task/assignment/status автоматически;
- execution state начинается с `false` по всем контрольным точкам.

Safety markers baseline:

- `server_mutation_available=false`;
- `automatic_task_creation_available=false`;
- `automatic_assignment_available=false`;
- `automatic_status_change_available=false`;
- `pilot_started=false`;
- `pilot_start_authorized=false`;
- `requires_manual_action_selection=true`;
- `requires_manual_pilot_start=true`;
- `requires_result_evidence=true`.

Даже свежий measurement baseline не является запуском пилота. Для начала нужны ручной выбор действия, фактический ответственный, срок и отдельное явное решение владельца.

## Проверки PR #266

- Dedicated validation static contract: PASS.
- Semantic Node regression: PASS.
- Valid package → confirmed-only baseline: PASS.
- One changed overdue-document field → stale and blocked: PASS.
- Tampered safety marker → blocked: PASS.
- Manager validator actor → blocked: PASS.
- All rejected → revalidation PASS, baseline blocked: PASS.
- Tampered shortlist key → blocked: PASS.
- Owner decision backward compatibility: PASS.
- Page module budget: PASS.
- Full static suite: PASS.
- JavaScript syntax: PASS после исправления неэкранированных template-literal backticks.
- Public desktop/mobile Playwright: PASS.
- Review threads: 0.
- `authenticated-smoke`: `skipped`; это не authenticated PASS.

## Responsibility correction workflow

Остаётся отдельным контуром:

1. confirmation JSON;
2. validation report с `point_operation_ready=true`;
3. свежий server preview с неистёкшим fingerprint;
4. bundle manifest с `bundle_ready=true`.

Без всех четырёх подтверждённых файлов реальные `seller_spn_id`, `buyer_spn_id` и `manager_id` не менять.

## Release drift

- Baseline latest live: `20260714064311`.
- Alias manifest: 16 approved live mappings и 16 canonical repository-only sources.
- PR #264/#266 не меняли Supabase, поэтому release-sync не требуется.
- Неизвестный remote-only/repo-only drift продолжает ломать gate.
- Approved workflow в Environment `navigator-production-readonly` всё ещё требует ручной настройки владельца.

## Authenticated E2E blocker

- Отдельного Supabase test project/development branch нет.
- GitHub Environment `navigator-e2e` отсутствует.
- Disposable role accounts и mailbox отсутствуют.
- Authenticated role/invite/recovery/mutation E2E: BLOCKED.
- Workflow success при `authenticated-smoke=skipped` не является authenticated PASS.
- Не создавать execution RPC и не включать leaked-password protection до isolated target и фактического role PASS.

## Ручные действия владельца

### Операционный пилот

1. Открыть `operational-adoption-v2.html` под owner/admin.
2. Перейти в «Решение владельца по пилоту».
3. Проверить три карточки, выбрать `confirmed`/`rejected`, заполнить основания.
4. Получить и скачать owner decision JSON с `decision_package_ready=true`.
5. Перейти в «Проверить скачанный JSON».
6. Загрузить owner decision JSON.
7. Получить `decision_package_valid=true` и `fresh_revalidation_passed=true`.
8. Скачать validation JSON.
9. При `measurement_baseline_ready=true` скачать measurement baseline.
10. Передать три файла: owner decision, validation report и measurement baseline.
11. Не считать ни один из файлов запуском пилота.
12. Следующий этап — вручную выбрать одно действие, ответственного и срок для каждой confirmed-сделки.

### Responsibility correction

1. Подготовить один confirmation draft.
2. Получить validation report, свежий server preview и bundle manifest.
3. Передать четыре evidence-файла.
4. Только после явного подтверждения рассматривать одну audited point correction.

### Инфраструктура

1. Создать Environment `navigator-production-readonly` и выполнить approved drift workflow с `allow_drift=false`.
2. Создать отдельный Supabase test project/branch и Environment `navigator-e2e`.

## NEXT_WORK_QUEUE

- P0 MANUAL — получить три pilot-файла: owner decision, fresh validation и measurement baseline.
- P0 MANUAL — получить четыре responsibility evidence-файла для одной correction.
- P0 MANUAL — approved release drift workflow run с `allow_drift=false`.
- P0 BLOCKED — isolated target + authenticated role/invite/recovery/mutation E2E.
- P1 BLOCKED ON VALID PILOT FILES — подготовить ручной action checklist для confirmed deals: одно действие, ответственный, срок, evidence и следующий шаг; без автоматической записи.
- P1 BLOCKED ON VALID RESPONSIBILITY BUNDLE — одна audited point correction с новой server revalidation, pre/post snapshot и audit event.
- P1 BLOCKED ON AUTH EVIDENCE — audited synthetic task contract mutation.
- P1 — leaked-password protection только после auth E2E.
- DO NOT REPEAT — общий аудит, guest/no-JWT/private-helper smoke, deal-card consolidation, risk #218, operational/task/broker/viewer previews, lawyer focus, SPN handoff, owner/admin IA, task contract schema, Advisor scope gate, adoption snapshot/comparison, manager proposal, grouped remediation, evidence candidates, local responsibility confirmation, responsibility package validator, server point preview, responsibility bundle validator, pilot shortlist, owner decision package и pilot decision validation без новой причины.

## Команда следующего запуска

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #266. Один раз проверь наличие трёх pilot-файлов: owner decision JSON с decision_package_ready=true, validation JSON с decision_package_valid=true и fresh_revalidation_passed=true, measurement baseline с baseline_ready=true; четырёх responsibility evidence-файлов; Environment navigator-production-readonly; isolated auth target. Если три pilot-файла валидны — подготовь только browser-local action checklist для confirmed deals с ручным действием, ответственным, сроком, evidence и следующим шагом, без автоматической записи. Если responsibility bundle валиден — выполни только одну audited point correction с новой server revalidation, pre/post snapshot и audit event. Если подтверждений нет — реальные данные не менять.`
