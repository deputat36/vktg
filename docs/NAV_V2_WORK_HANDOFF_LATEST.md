# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 2026-07-14.
- Текущий `main`: `1f7fdd9dde037ac19ff3828e3dfe47d0fc694864` — merge PR #275.
- Последняя production migration: `20260714102956_nav_v2_exact_wizard_save_guard`.
- Canonical migration: `20260714103000_nav_v2_exact_wizard_save_guard.sql`.
- Release baseline и migration aliases синхронизированы PR #272.
- PR #275 frontend-only: migrations, RPC, grants, Edge Functions и production rows не менялись.
- Canonical frontend build: `20260711-01`.
- Deal-card budget: 22; механическое сокращение без новой продуктовой причины запрещено.
- `spn-v2.html` budget: 18.

## Последние завершённые PR

- #275 — browser-local owner start confirmation перед ручным запуском pilot action.
- #274 — handoff после защиты wizard-save.
- #272 — release baseline/alias sync после deploy exact wizard-save guard.
- #271 — server-side exact repeated wizard payload guard и rollback smoke.
- #270 — browser cross-tab save lock, lease и recent receipt.
- #268 — browser-local action checklist для confirmed pilot deals.
- #266 — fresh owner-decision validation и confirmed-only measurement baseline.
- #264 — owner/admin решение по трём operational pilot lanes.
- #263/#262 — release sync и read-only operational pilot shortlist.

## Supabase production

- Project: `ofewxuqfjhamgerwzull`.
- Latest live migration: `20260714102956`.
- Public operational report version: 7.
- Pilot shortlist version: 1.
- `nav-invite-user`: v10 ACTIVE, `verify_jwt=true`.
- `nav-v2-deal-api`: v4 ACTIVE, `verify_jwt=true`.
- Supabase branches: только production `main`; isolated auth target отсутствует.

Контроль после merge PR #275:

- Deals: 23.
- Tasks: 98.
- Risks: 53.
- Documents: 198.
- Events: 118.
- Profiles: 5.
- Synthetic rollback-smoke rows: 0.
- Exact duplicate groups, созданные до защиты: 4.
- Duplicate trigger присутствует и включён.
- Latest migration не изменилась.

Operational report проверен в owner-context внутри транзакции с `ROLLBACK`:

- deals in scope: 18;
- confirmed results: 1;
- active without result: 17;
- confirmed result rate: 5,6%;
- open tasks: 82;
- open risks: 48;
- duplicate groups: 4;
- shortlist count: 3;
- `selection_available=false`;
- `mutation_available=false`.

Рабочие строки после PR #275 не изменялись.

## Operational pilot shortlist

Shortlist остаётся read-only предложением:

1. `a6740629-8e36-4fb9-8b3f-08510fd0497f` — quick result, Пушкинская 97-11.
2. `03029d49-6e43-47b6-856e-4886f0ac320a` — responsibility confirmation, Танцырей.
3. `a696d7f8-6c9f-4a2b-87e9-3a7594a31787` — document workflow, Приборная.

Shortlist:

- не является рейтингом сотрудников;
- не выбирает сделки автоматически;
- не запускает pilot;
- не создаёт задачи и назначения;
- требует решения owner/admin.

## Pilot artifact chain

Для перехода к ручному исполнению требуется последовательная цепочка из пяти файлов. Каждый следующий файл проверяет предыдущий и свежий read-only shortlist.

### 1. Owner decision

Экран:

`operational-pilot-decision-v2.html`

Export:

`navigator_v2_operational_pilot_owner_decision`

Gate:

- автор owner/admin;
- все три lane рассмотрены;
- решение `confirmed` или `rejected`;
- основание не короче 10 символов;
- `decision_package_ready=true`;
- `pilot_started=false`;
- `pilot_start_authorized=false`.

### 2. Fresh validation

Экран:

`operational-pilot-decision-validation-v2.html`

Export:

`navigator_v2_operational_pilot_owner_decision_validation`

Gate:

- `decision_package_valid=true`;
- `fresh_revalidation_passed=true`;
- report version, pilot version и shortlist key совпадают;
- контролируемые поля карточек не изменились;
- любое расхождение переводит пакет в `stale`.

### 3. Measurement baseline

Export:

`navigator_v2_operational_pilot_measurement_baseline`

Gate:

- содержит только актуальные `confirmed` deals;
- `baseline_ready=true`;
- readiness, tasks, risks, documents и responsibility зафиксированы;
- execution state начинается с `false`;
- automatic task/assignment/status changes запрещены.

### 4. Action checklist

Экран:

`operational-pilot-action-checklist-v2.html`

Export:

`navigator_v2_operational_pilot_action_checklist`

Для каждой confirmed-сделки требуется ровно одно действие:

- точный объект действия;
- фактический ответственный или роль;
- будущий срок;
- тип evidence;
- ожидаемый результат;
- требование к evidence;
- следующий шаг;
- основание выбора действия.

Safety:

- `checklist_ready=true` означает только заполненный план;
- `checklist_is_execution_authorization=false`;
- `server_mutation_available=false`;
- `pilot_started=false`;
- `pilot_start_authorized=false`;
- требуется отдельное owner start confirmation.

### 5. Owner start confirmation — PR #275

Экран:

`operational-pilot-start-confirmation-v2.html`

Export:

`navigator_v2_operational_pilot_owner_start_confirmation`

Экран:

- доступен только owner/admin;
- принимает checklist JSON до 2 МБ;
- читает файл только в памяти браузера;
- использует ровно один существующий read-only RPC `nav_v2_get_operational_adoption_report`;
- повторно проверяет report version, pilot version и shortlist key;
- сравнивает deal/lane, метрики и responsibility со свежим shortlist;
- проверяет measurement contract, action fields, срок и safety markers;
- блокирует повторяющиеся deal_id, прошедший срок, подменённые safety markers и stale checklist.

Для каждого действия owner/admin выбирает:

- `authorized` — разрешить ручной запуск;
- `rejected` — отклонить действие.

Для `authorized` требуется:

- основание решения;
- срок действия разрешения в будущем;
- срок разрешения не позже срока самого действия.

All-rejected package допустим как завершённое решение, но имеет `pilot_start_authorized=false`.

Safety markers:

- `browser_local_only=true`;
- `server_mutation_available=false`;
- `automatic_task_creation_available=false`;
- `automatic_assignment_available=false`;
- `automatic_status_change_available=false`;
- `owner_confirmation_is_server_execution=false`;
- `pilot_start_authorized_by_owner` отражает только решение владельца;
- `pilot_started=false`;
- `responsible_acknowledgement_recorded=false`;
- `requires_manual_responsible_acknowledgement=true`;
- `requires_manual_execution=true`;
- `requires_execution_receipt=true`;
- `requires_result_evidence=true`;
- `requires_post_action_result_confirmation=true`.

Даже валидный owner start confirmation не является фактическим началом действия и не меняет Supabase.

## Проверки PR #275

- Dedicated static contract: PASS.
- Semantic Node regression: PASS.
- Action-checklist backward compatibility: PASS.
- Valid checklist + owner authorization: PASS.
- Changed operational metric → stale/blocked: PASS.
- Manager actor → blocked: PASS.
- Duplicate deal ID → invalid: PASS.
- Past action deadline → invalid: PASS.
- Tampered safety marker → invalid: PASS.
- Authorization expiry later than action due → blocked: PASS.
- Owner rejection → package ready, pilot start not authorized: PASS.
- Module budget: PASS.
- Full static suite: PASS.
- JavaScript syntax: PASS.
- Public desktop/mobile guest gate: PASS.
- Review threads: 0.
- `authenticated-smoke`: `skipped`; это не authenticated PASS.

## Следующий pilot gate

Следующий этап нельзя считать обычным browser-local продолжением без дополнительных ограничений.

Для фактического ручного исполнения нужны:

1. Пять валидных pilot-файлов.
2. Минимум одно действие с `authorized`.
3. Непросроченное owner-разрешение.
4. Подтверждение фактического ответственного.
5. Execution receipt до начала или сразу при начале действия.
6. Evidence результата.
7. Подтверждение результата и следующего шага.

До isolated authenticated target нельзя считать проверенными:

- identity ответственного;
- role-specific acknowledgement;
- mutation permissions;
- создание task/action receipt;
- запись результата в рабочую карточку.

Поэтому server execution и mutation остаются заблокированными.

## Exact duplicate groups

Issue #273 остаётся открытой, комментариев и owner-решений нет.

### Овчинников — Первомайская,3

- `366330f5-966c-4f97-8147-7e79e2ea408d`;
- `06a14681-d77d-4b3c-b65f-f887fffb3bbd`.

### Ковтун — Чкалова 4 кв44

- `c2dd4db4-c995-4e63-8df7-cf318558050d`;
- `cdce4e04-4421-4079-9c9c-03380cc59631`.

### Ковтун — адрес не указан

- `e69a656a-54ec-4f1f-b5e6-e1f28334ba03`;
- `76ecc56e-36d4-47b9-8476-508f93b13cfe`.

### Ковтун — Прибрежная 1

- `32978be1-4652-472d-80f3-c030f69ad61a`;
- `a1256578-3150-4ee1-9e3a-163bd8d0a56d`.

Существующие записи не удалять и не объединять без явного решения владельца:

- canonical deal;
- перечень уникальных данных для переноса;
- способ закрытия дубля;
- pre/post snapshot;
- audit event.

## Duplicate prevention

### Browser layer — PR #270

- deterministic fingerprint полного draft + user ID;
- Web Locks API между вкладками;
- localStorage lease fallback на 120 секунд;
- recent receipt на 10 минут;
- повторная идентичная отправка блокируется.

### Server layer — PR #271

- BEFORE INSERT trigger на `nav_deals_v2`;
- advisory transaction lock по автору и hash payload;
- окончательное решение по точному `jsonb` equality;
- окно блокировки — две минуты;
- существующие строки не изменяются;
- trigger function закрыта от `authenticated`, `anon` и `PUBLIC`.

## Responsibility correction workflow

Остаётся отдельным заблокированным контуром:

1. confirmation JSON;
2. validation report с `point_operation_ready=true`;
3. свежий server preview с fingerprint;
4. bundle manifest с `bundle_ready=true`.

Без четырёх файлов реальные `seller_spn_id`, `buyer_spn_id` и `manager_id` не менять.

## Release drift

- Baseline latest live: `20260714102956`.
- Canonical source: `20260714103000`.
- Migration alias CI: PASS.
- Full static release drift contract: PASS.
- PR #275 не менял Supabase, поэтому release-sync не требуется.
- Approved live workflow в Environment `navigator-production-readonly` всё ещё требует ручного запуска владельца с `allow_drift=false`.

## Authenticated E2E blocker

- Изолированного Supabase test project/development branch нет.
- Environment `navigator-e2e` отсутствует.
- Disposable role accounts и mailbox отсутствуют.
- Authenticated role/invite/recovery/mutation E2E: BLOCKED.
- `authenticated-smoke=skipped` не является PASS.
- Production accounts и реальные сделки не использовать для synthetic mutation tests.

## Ручные действия владельца

### Pilot

1. Сформировать owner decision JSON.
2. Выполнить fresh validation.
3. Скачать measurement baseline.
4. Сформировать action checklist.
5. Загрузить checklist в owner start confirmation.
6. Рассмотреть каждое действие: `authorized` или `rejected`.
7. Скачать owner start confirmation JSON.
8. Не считать пакет фактическим стартом.
9. Перед исполнением получить подтверждение ответственного и определить формат execution receipt.

### Исторические дубли

1. Открыть issue #273.
2. Для каждой пары определить canonical deal.
3. Проверить уникальные комментарии, задачи, риски, документы и evidence.
4. Явно указать, что переносить и как закрывать дубль.
5. Только после этого выполнять одну группу за раз с pre/post snapshot и audit event.

### Responsibility correction

1. Подготовить четыре evidence-файла.
2. Передать owner confirmation.
3. Только после свежей server revalidation рассматривать одну point correction.

### Инфраструктура

1. Запустить approved production-readonly drift workflow с `allow_drift=false`.
2. Создать isolated Supabase target и Environment `navigator-e2e`.

## NEXT_WORK_QUEUE

- P0 MANUAL — получить пять pilot-файлов: owner decision, validation, baseline, action checklist и owner start confirmation.
- P0 MANUAL — получить подтверждение ответственного для хотя бы одного authorised action.
- P0 MANUAL — решить canonical deal по четырём duplicate groups в #273.
- P0 MANUAL — получить четыре responsibility evidence-файла.
- P0 MANUAL — approved release drift workflow с `allow_drift=false`.
- P0 BLOCKED — isolated target + authenticated role/invite/recovery/mutation E2E.
- P1 BLOCKED ON OWNER + RESPONSIBLE EVIDENCE — определить audited execution receipt без автоматической task/status mutation.
- P1 BLOCKED ON DUPLICATE OWNER DECISION — выполнить только одну подтверждённую группу cleanup с pre/post snapshot и audit event.
- P1 BLOCKED ON VALID RESPONSIBILITY BUNDLE — одна audited point correction.
- P1 BLOCKED ON AUTH EVIDENCE — audited synthetic task contract mutation.
- P1 — leaked-password protection только после auth E2E.

DO NOT REPEAT без новой причины:

- общий технический аудит;
- guest/no-JWT/private-helper smoke;
- механическую deal-card consolidation;
- risk lifecycle #218;
- operational readiness/task taxonomy/broker/viewer/lawyer previews;
- owner/admin IA;
- adoption report/comparison;
- manager proposal/grouped remediation;
- responsibility draft/validation/server preview/bundle;
- pilot shortlist/owner decision/validation/action-checklist/start-confirmation scaffolding;
- browser save lock и exact server duplicate guard.

## Команда следующего запуска

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #275. Один раз проверь пять pilot-файлов, подтверждение фактического ответственного, четыре responsibility evidence-файла, owner-решения по issue #273, Environment navigator-production-readonly и isolated auth target. Если есть валидный owner start confirmation с authorised action и отдельное подтверждение ответственного — подготовь только audited browser-local execution receipt contract без автоматической task/status mutation. Если владелец выбрал canonical deal для одной duplicate group — выполни только одну audited cleanup operation с новой server revalidation, pre/post snapshot и audit event. Если responsibility bundle валиден — выполни одну point correction. Без подтверждений рабочие данные не менять.`
