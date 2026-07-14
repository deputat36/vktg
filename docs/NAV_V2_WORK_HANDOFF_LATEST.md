# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 2026-07-14.
- Текущий `main`: `cd1ac8e672bcbaf22d0fb16ac8a0e23b4b08bb16` — PR #264.
- Последняя production migration: `20260714064311_nav_v2_operational_pilot_shortlist`.
- Canonical migration: `20260714013000_nav_v2_operational_pilot_shortlist.sql`.
- Release baseline уже синхронизирован PR #263.
- PR #264 frontend-only: schema, grants, Edge Functions и production rows не менялись.
- Canonical frontend build: `20260711-01`.
- Deal-card budget: 22; механическое сокращение без новой продуктовой причины запрещено.

## Последние завершённые PR

- #264 — browser-local owner/admin решение по трём operational pilot lanes и JSON evidence package.
- #263 — release baseline/aliases после deploy pilot shortlist.
- #262 — прозрачный read-only shortlist трёх реальных сделок для операционного пилота.
- #261/#260 — handoff и локальная проверка responsibility evidence bundle с SHA-256 manifest.
- #259/#258 — release sync и owner/admin server preview одной responsibility correction.
- #257/#256 — handoff и импорт/локальная валидация confirmation JSON.
- #255/#254 — release sync и browser-local лист подтверждения ответственности.
- #253/#252 — release sync, source-remediation UI и evidence-only candidates.
- #251/#250 — release sync и grouped source-remediation SQL.
- #249/#248 — release sync и read-only manager assignment proposal.
- #247/#246 — release sync и exact current/previous period comparison.
- #243/#241 — migration alias reconciliation и adoption split-deploy history.
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

Контроль после merge PR #264 выполнен в owner-context внутри транзакции с `ROLLBACK`:

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
- Цель: проверить один короткий подтверждаемый результат после ручного подтверждения ответственности.

### Подтверждение ответственности

- Deal ID: `03029d49-6e43-47b6-856e-4886f0ac320a`.
- Адрес: Танцырей.
- Evidence-кандидат: Овчинников Александр Константинович.
- Типов сигналов: 5; действий: 8.
- Открытые/просроченные задачи: 3/3.
- Открытых обязательных документов: 11; все 11 без assigned_to/responsible_role.
- Рисков, блокирующих сделку: 2.
- У evidence-кандидата отсутствует `manager_id`.
- Цель: подтвердить фактического СПН, сторону сделки и менеджерскую связь.

### Документный рабочий цикл

- Deal ID: `a696d7f8-6c9f-4a2b-87e9-3a7594a31787`.
- Адрес: Приборная.
- Готовность к сделке: 45%.
- Значимых событий: 5.
- Открытые/просроченные задачи: 5/5.
- Подтверждено документов: 2.
- Открытых обязательных документов: 9; просроченных: 6; бесхозных: 0.
- Рисков, блокирующих сделку: 2.
- Active-SPN evidence отсутствует.
- Цель: проверить цикл одного документа — ответственный, срок, действие, подтверждение и следующий шаг.

## PR #264 — owner decision package

Новый экран:

`operational-pilot-decision-v2.html`

Ссылка доступна из `operational-adoption-v2.html` как «Решение владельца по пилоту».

Экран:

- использует ровно один существующий read-only RPC `nav_v2_get_operational_adoption_report`;
- разрешает принятие решения только owner/admin;
- manager, SPN и другие роли не могут оформить пакет;
- позволяет для каждого lane выбрать `pending`, `confirmed` или `rejected`;
- требует основание не короче 10 символов для `confirmed` и `rejected`;
- хранит черновик только в памяти страницы;
- не использует localStorage/sessionStorage;
- сбрасывает решения после перезагрузки;
- выгружает JSON без отправки файлов в Supabase.

Export contract:

- `export_type=navigator_v2_operational_pilot_owner_decision`;
- `schema_version=1`;
- source содержит report version, pilot version, generated_at, period и детерминированный `shortlist_key`;
- `shortlist_snapshot` содержит три исходные карточки, причины, ограничения и backlog;
- `decisions` содержит owner-решение и основание по каждому lane;
- `decision_package_ready=true` только если все три lane рассмотрены, основания валидны и автор — owner/admin.

Safety markers:

- `browser_local_only=true`;
- `server_mutation_available=false`;
- `automatic_selection_available=false`;
- `pilot_started=false`;
- `pilot_start_authorized=false`;
- `requires_manual_pilot_start=true`;
- `requires_fresh_readonly_revalidation=true`;
- `requires_separate_measurement_baseline=true`.

Даже пакет с `decision_package_ready=true` не запускает пилот, не создаёт задачи, не меняет статусы и не является разрешением на mutation.

## Responsibility correction workflow

Остаётся отдельным контуром:

1. confirmation JSON;
2. validation report с `point_operation_ready=true`;
3. свежий server preview с неистёкшим fingerprint;
4. bundle manifest с `bundle_ready=true`.

Без всех четырёх подтверждённых файлов реальные `seller_spn_id`, `buyer_spn_id` и `manager_id` не менять.

## Проверки PR #264

- Dedicated owner-decision static contract: PASS.
- Semantic Node regression: PASS.
- Three-lane complete decision package: PASS.
- Short note rejection: PASS.
- Manager author rejection: PASS.
- Changed shortlist lane resets stale local decision: PASS.
- Page module budget: PASS.
- Existing adoption/shortlist compatibility: PASS.
- Full static suite: PASS.
- JavaScript syntax: PASS.
- Manager-source-remediation suite: PASS.
- Public desktop/mobile Playwright: PASS.
- Review threads: 0.
- `authenticated-smoke`: `skipped`; это не authenticated PASS.

## Release drift

- Baseline latest live: `20260714064311`.
- Alias manifest: 16 approved live mappings и 16 canonical repository-only sources.
- PR #264 не менял Supabase, поэтому новый release-sync не требуется.
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
3. Открыть карточку каждой из трёх сделок.
4. Для каждого lane выбрать `confirmed` или `rejected`.
5. Указать основание не короче 10 символов.
6. Получить `decision_package_ready=true`.
7. Скачать JSON `navigator_v2_operational_pilot_owner_decision`.
8. Передать JSON для свежей read-only revalidation.
9. Только для подтверждённых сделок строить отдельный checklist/measurement baseline.
10. Не считать JSON запуском пилота.

### Responsibility correction

1. Подготовить один confirmation draft.
2. Получить validation report, свежий server preview и bundle manifest.
3. Передать четыре evidence-файла.
4. Только после явного подтверждения рассматривать одну audited point correction.

### Инфраструктура

1. Создать Environment `navigator-production-readonly` и выполнить approved drift workflow с `allow_drift=false`.
2. Создать отдельный Supabase test project/branch и Environment `navigator-e2e`.

## NEXT_WORK_QUEUE

- P0 MANUAL — получить owner decision JSON с `decision_package_ready=true` по трём pilot lanes.
- P0 MANUAL — получить четыре responsibility evidence-файла для одной correction.
- P0 MANUAL — approved release drift workflow run с `allow_drift=false`.
- P0 BLOCKED — isolated target + authenticated role/invite/recovery/mutation E2E.
- P1 BLOCKED ON OWNER DECISION JSON — свежая read-only revalidation и measurement baseline только для `confirmed` deals.
- P1 BLOCKED ON VALID RESPONSIBILITY BUNDLE — одна audited point correction с новой server revalidation, pre/post snapshot и audit event.
- P1 BLOCKED ON AUTH EVIDENCE — audited synthetic task contract mutation.
- P1 — leaked-password protection только после auth E2E.
- DO NOT REPEAT — общий аудит, guest/no-JWT/private-helper smoke, deal-card consolidation, risk #218, operational/task/broker/viewer previews, lawyer focus, SPN handoff, owner/admin IA, task contract schema, Advisor scope gate, adoption snapshot/comparison, manager proposal, grouped remediation, evidence candidates, local responsibility confirmation, responsibility package validator, server point preview, responsibility bundle validator, pilot shortlist и owner decision package без новой причины.

## Команда следующего запуска

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #264. Один раз проверь наличие owner decision JSON с export_type navigator_v2_operational_pilot_owner_decision и decision_package_ready=true, четырёх responsibility evidence-файлов, Environment navigator-production-readonly и isolated auth target. Если owner decision JSON валиден — выполни только свежую read-only revalidation и подготовь measurement baseline для confirmed deals без автоматических изменений. Если валидный responsibility bundle подтверждён — выполни только одну audited point correction с новой server revalidation, pre/post snapshot и audit event. Если подтверждений нет — реальные данные не менять.`
