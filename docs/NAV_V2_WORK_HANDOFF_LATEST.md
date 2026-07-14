# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 2026-07-14.
- Текущий product `main`: `f83848ea8ea0f39be5fbc2af97a60891a0a5563d` — PR #262.
- Последняя production migration: `20260714064311_nav_v2_operational_pilot_shortlist`.
- Canonical migration: `20260714013000_nav_v2_operational_pilot_shortlist.sql`.
- Canonical blob: `2fde357c95d838645927a466053e551dff11941a`.
- Release-sync: ветка `agent/nav-v2-operational-pilot-shortlist-release-sync`.
- Canonical frontend build: `20260711-01`.
- Deal-card budget: 22; механическое сокращение без новой продуктовой причины запрещено.
- `manager-source-remediation-v2.html` budget: 6 модулей.

## Последние завершённые PR

- #262 — прозрачный read-only shortlist трёх реальных сделок для операционного пилота.
- #261/#260 — handoff и локальная проверка полного responsibility evidence bundle с SHA-256 manifest.
- #259/#258 — release sync и owner/admin server preview одной responsibility correction.
- #257/#256 — handoff и импорт/локальная валидация confirmation JSON.
- #255/#254 — release sync и browser-local лист подтверждения ответственности.
- #253/#252 — release sync, source-remediation UI и evidence-only candidates.
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
- Live pilot shortlist: `20260714064311_nav_v2_operational_pilot_shortlist`.
- Public operational report version: 7.
- `nav-invite-user`: v10 ACTIVE, `verify_jwt=true`.
- `nav-v2-deal-api`: v4 ACTIVE, `verify_jwt=true`.
- RPC grant health: 50 items, 0 problems.
- Frontend RPC coverage: 43 items, 0 problems.
- Public operational wrapper: authenticated=true, anon=false, PUBLIC=false.
- Private pilot helper: service_role=true, authenticated=false, anon=false, PUBLIC=false.
- Активный СПН получает SQLSTATE `42501` при вызове operational report.
- Supabase branches: только production `main`; isolated auth target отсутствует.

## Рабочие данные

До и после PR #262 deployment:

- Deals: 21.
- Documents: 168.
- Tasks: 92.
- Risks: 49.
- Events: 116.
- Profiles: 5.
- Persisted task type: 0.
- Persisted SLA: 0.
- Реальные `seller_spn_id`, `buyer_spn_id`, `manager_id`, статусы, задачи, риски и документы не менялись.

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

## PR #262 — operational pilot shortlist

Private helper:

`nav_v2_private.nav_v2_get_operational_pilot_shortlist_unchecked_20260714(p_days integer, p_limit integer)`

Browser API не расширена. Существующий RPC:

`public.nav_v2_get_operational_adoption_report(p_days integer, p_limit integer)`

добавляет поле `operational_pilot_shortlist`.

Границы:

- `preview_only=true`;
- `selection_available=false`;
- `mutation_available=false`;
- `ranking_is_not_employee_rating=true`;
- `owner_decision_required=true`;
- demo-сделки исключаются существующим adoption scope;
- нормализованный адрес не позволяет одной вероятной дублирующей группе занять несколько мест;
- причины и backlog показываются явно, а не скрываются общим баллом;
- shortlist не назначает сотрудника, не меняет статус и не запускает пилот.

Production summary:

- deals in scope: 16;
- shortlist count: 3;
- quick-result candidates: 3;
- responsibility candidates: 3;
- document-workflow candidates: 1;
- probable duplicate groups: 3.

### 1. Быстрый пилотный цикл

- Deal ID: `a6740629-8e36-4fb9-8b3f-08510fd0497f`.
- Адрес: Пушкинская 97-11.
- Готовность к сделке: 55%.
- Значимых событий за период: 0.
- Открытые/просроченные задачи: 5/5.
- Открытых обязательных документов: 8; просроченных: 0; бесхозных: 0.
- Рисков, блокирующих сделку: 2.
- Active-SPN evidence отсутствует.
- Смысл lane: проверить один короткий, фактически завершаемый результат после ручного подтверждения ответственности.

### 2. Подтверждение ответственности

- Deal ID: `03029d49-6e43-47b6-856e-4886f0ac320a`.
- Адрес: Танцырей.
- Готовность к сделке: 65%.
- Evidence-кандидат: Овчинников Александр Константинович.
- Независимых типов сигналов: 5; действий: 8.
- Значимых событий: 2.
- Открытые/просроченные задачи: 3/3.
- Открытых обязательных документов: 11; все 11 без assigned_to/responsible_role.
- Рисков, блокирующих сделку: 2.
- У evidence-кандидата отсутствует `manager_id`.
- Смысл lane: вручную подтвердить фактического СПН, сторону сделки и менеджерскую связь до любых назначений.

### 3. Документный рабочий цикл

- Deal ID: `a696d7f8-6c9f-4a2b-87e9-3a7594a31787`.
- Адрес: Приборная.
- Готовность к сделке: 45%.
- Значимых событий: 5.
- Открытые/просроченные задачи: 5/5.
- Подтверждено документов: 2.
- Открытых обязательных документов: 9; просроченных: 6; бесхозных: 0.
- Рисков, блокирующих сделку: 2.
- Active-SPN evidence отсутствует.
- Смысл lane: проверить полный цикл одного документа — ответственный, срок, фактическое подтверждение и следующий шаг.

## Источники ответственности

### Manager assignment proposal

- Public report version: 7.
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

## Confirmation and evidence bundle workflow

Экран `manager-source-remediation-v2.html` позволяет:

1. Подготовить локальный confirmation draft для `seller_spn_id`, `buyer_spn_id` или `manager_id`.
2. Скачать confirmation JSON/CSV.
3. Импортировать confirmation JSON в local package validator.
4. Получить `point_operation_ready=true` только для ровно одной свежей, подтверждённой и однозначной операции.
5. Скачать validation report.
6. Owner/admin может вызвать read-only server preview и скачать fingerprint.
7. Загрузить три файла в evidence bundle validator.
8. Получить `bundle_ready=true` и скачать SHA-256 manifest только при полном совпадении файлов.

Ни один этап не выполняет UPDATE.

Bundle validator проверяет:

- confirmation JSON содержит ровно одну изменяемую операцию и `decision_status=confirmed`;
- package внутри validation report точно равен confirmation JSON;
- `point_operation_ready=true`, одна ready/actionable операция, ноль stale/invalid/not_ready;
- operation во всех файлах совпадает;
- server preview имеет `ready=true`, корректный fingerprint и не истёк;
- `actual_current_id` совпадает с `expected_current_id`;
- validation report и server preview сформированы одним user id;
- safety markers запрещают mutation/execution.

При успехе создаётся локальный manifest с SHA-256 confirmation, validation, preview и нормализованной операции. `bundle_ready=true` не является разрешением на UPDATE; перед audited correction обязательна новая server revalidation.

## Проверки PR #262

- Dedicated operational pilot shortlist contract: PASS.
- Strict `pipefail` validator exit propagation: PASS.
- Validator artifact upload on success/failure: PASS.
- Existing adoption/comparison/manager contracts: PASS.
- Full static suite: PASS.
- JavaScript syntax: PASS.
- Advisor scope: PASS.
- Manager-source-remediation contracts: PASS.
- Public desktop/mobile Playwright: PASS.
- Review threads: 0.
- DDL rehearsal with full ROLLBACK: PASS.
- Production post-deploy verification: PASS.
- `authenticated-smoke`: `skipped`; это не authenticated PASS.

## Advisors

- Security Advisor после shortlist deploy получен.
- Public adoption RPC присутствует как ожидаемый role-gated `authenticated_security_definer_function_executable` warning и уже учтён в Navigator-only baseline.
- Новый private shortlist helper наружу не утёк.
- Leaked-password protection остаётся выключенной до invite/recovery E2E.
- Performance Advisor не показал shortlist-specific проблему.
- Общий Performance Advisor смешивает Navigator, legacy Nav, Leader, Parket и другие подсистемы; автоматическое удаление индексов или массовая правка RLS запрещены без workload evidence.

## Release drift

- Target baseline latest live: `20260714064311`.
- Live `20260714064311` связан с canonical `20260714013000` и blob `2fde357c95d838645927a466053e551dff11941a`.
- Alias manifest после текущего release-sync содержит 16 approved live mappings и 16 canonical repository-only sources.
- Неизвестный remote-only/repo-only drift продолжает ломать gate.
- Approved workflow run в Environment `navigator-production-readonly` всё ещё требует ручной настройки владельца.

## Authenticated E2E blocker

- `Supabase.list_branches` 2026-07-14 вернул только production `main`.
- Отдельного Supabase test project или development branch нет.
- GitHub Environment `navigator-e2e`, disposable role accounts и mailbox отсутствуют.
- Authenticated Playwright matrix: BLOCKED.
- Invite/access-link/password/recovery/email delivery: BLOCKED.
- Browser mutation E2E: BLOCKED.
- Workflow success при `authenticated-smoke=skipped` не является authenticated PASS.
- Не создавать execution RPC и не включать leaked-password protection до isolated target и фактического role PASS.

## Ручные действия владельца

### Операционный пилот

1. Открыть `operational-adoption-v2.html` под owner/admin/manager.
2. В блоке «Кандидаты для операционного пилота» открыть три карточки.
3. Подтвердить или отклонить каждый lane вручную.
4. Для Пушкинской 97-11 сначала подтвердить ответственных и выбрать одно завершаемое действие.
5. Для Танцырей подтвердить Овчинникова, сторону сделки и его менеджера.
6. Для Приборной выбрать один обязательный документ и зафиксировать ответственного, срок и критерий результата.
7. Не считать shortlist автоматическим включением сделки в пилот.

### Responsibility correction

1. Подготовить confirmation draft только для одного решения.
2. Скачать confirmation JSON.
3. Получить validation report с `point_operation_ready=true`.
4. Получить свежий server preview с неистёкшим fingerprint.
5. Загрузить три файла в bundle validator.
6. Получить `bundle_ready=true` и скачать bundle manifest.
7. Передать четыре evidence-файла.
8. Только после явного подтверждения рассматривать одну audited point correction.

### Инфраструктура

1. Создать Environment `navigator-production-readonly` и выполнить approved drift workflow с `allow_drift=false`.
2. Создать отдельный test project/branch и Environment `navigator-e2e`.

## NEXT_WORK_QUEUE

- P0 MANUAL — owner вручную подтверждает или отклоняет три сделки operational pilot shortlist.
- P0 MANUAL — получить confirmation JSON, validation report, server preview и `bundle_ready=true` manifest для одной responsibility correction.
- P0 MANUAL — approved release drift workflow run с `allow_drift=false`.
- P0 BLOCKED — isolated target + authenticated role/invite/recovery/mutation E2E.
- P1 BLOCKED ON OWNER PILOT DECISION — подготовить read-only pilot checklist/measurement baseline только для подтверждённых owner сделок; не менять данные автоматически.
- P1 BLOCKED ON VALID BUNDLE — одна audited point correction одного SPN field либо `manager_id`, с новой server revalidation, pre/post snapshot и audit event.
- P1 BLOCKED ON AUTH EVIDENCE — audited synthetic task contract mutation.
- P1 — leaked-password protection только после auth E2E.
- DO NOT REPEAT — общий аудит, guest/no-JWT/private-helper smoke, deal-card consolidation, risk #218, operational/task/broker/viewer previews, lawyer focus, SPN handoff, owner/admin IA, task contract schema, Advisor scope gate, adoption snapshot/comparison, manager proposal, grouped remediation, evidence candidates, local confirmation draft, package validator, server point preview, evidence bundle validator и pilot shortlist без новой причины.

## Команда следующего запуска

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #262 и live migration 20260714064311. Один раз проверь Environment navigator-production-readonly, isolated auth target, owner-решение по трём pilot shortlist карточкам и наличие четырёх responsibility evidence-файлов. Если owner подтвердил pilot deals — подготовь только read-only pilot checklist/measurement baseline без автоматических изменений. Если валидный bundle подтверждён — выполни только одну audited point correction с новой server revalidation, pre/post snapshot и audit event. Если подтверждений нет — реальные данные не менять.`
