# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 2026-07-14.
- Текущий `main`: `f02d1be8201fa78c435e489d4bd9fe8ba2500b5a` — merge PR #272.
- Последняя production migration: `20260714102956_nav_v2_exact_wizard_save_guard`.
- Canonical migration: `20260714103000_nav_v2_exact_wizard_save_guard.sql`.
- Release baseline и migration aliases синхронизированы PR #272.
- Canonical frontend build: `20260711-01`.
- Deal-card budget: 22; механическое сокращение без новой продуктовой причины запрещено.
- `spn-v2.html` budget: 18 после добавления межвкладочной защиты сохранения.

## Последние завершённые PR

- #272 — release baseline/alias sync после deploy exact wizard-save guard.
- #271 — server-side exact repeated wizard payload guard и rollback smoke.
- #270 — browser cross-tab save lock, lease и recent receipt.
- #268 — browser-local action checklist для confirmed pilot deals.
- #267 — handoff после pilot decision validation.
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

Post-deploy verification:

- Deals: 23.
- Tasks: 98.
- Risks: 53.
- Documents: 198.
- Events: 118.
- Profiles: 5.
- Synthetic rollback-smoke rows: 0.
- Exact duplicate groups, созданные до защиты: 4.

Новый trigger:

- `nav_v2_block_exact_recent_wizard_duplicate` присутствует и включён;
- BEFORE INSERT на `public.nav_deals_v2`;
- owner функции: `postgres`;
- SECURITY DEFINER с фиксированным `search_path=public`;
- execute для `authenticated`, `anon` и `PUBLIC` отсутствует;
- блокирует только точный `wizard_snapshot` одного автора в течение двух минут;
- существующие строки не изменяет.

## Post-deploy rollback smoke

Проверка выполнялась через production `nav_v2_save_wizard_result` внутри транзакции:

1. Первый synthetic wizard payload создал сделку.
2. Второй точный payload был заблокирован с кодом `NAV_V2_EXACT_WIZARD_DUPLICATE`.
3. `existing_deal_id` совпал с ID первой synthetic-сделки.
4. Payload с изменённым `clientNextStep` создал отдельный ID.
5. Выполнен явный `ROLLBACK`.
6. Synthetic rows после проверки: 0.
7. Рабочие counts не изменились.

Воспроизводимый сценарий:

`scripts/nav_v2_exact_wizard_save_guard_rollback_smoke.sql`

## Operational adoption — актуальный snapshot

30-дневный read-only отчёт после появления двух новых дублей:

- 18 реальных сделок в scope;
- 1 сделка с подтверждённым результатом;
- 17 сделок с активностью без подтверждённого результата;
- confirmed result rate: 5,6%;
- 82 открытые задачи;
- 48 открытых рисков;
- 4 группы вероятных дублей.

Рост относительно предыдущего snapshot полностью объяснён двумя повторными wizard-save:

- +2 deals;
- +6 tasks;
- +4 risks;
- +30 documents;
- +2 events.

Operational shortlist остался тем же:

1. `a6740629-8e36-4fb9-8b3f-08510fd0497f` — quick result, Пушкинская 97-11.
2. `03029d49-6e43-47b6-856e-4886f0ac320a` — responsibility confirmation, Танцырей.
3. `a696d7f8-6c9f-4a2b-87e9-3a7594a31787` — document workflow, Приборная.

Shortlist остаётся read-only:

- `selection_available=false`;
- `mutation_available=false`;
- `owner_decision_required=true`;
- не является рейтингом сотрудников.

## Exact duplicate groups

Read-only hash-проверка подтвердила четыре полных группы одинаковых wizard payload одного автора.

### Овчинников — Первомайская,3

- `366330f5-966c-4f97-8147-7e79e2ea408d`;
- `06a14681-d77d-4b3c-b65f-f887fffb3bbd`;
- интервал создания: 6,1 секунды;
- совпадают deal row, summary, snapshot, 3 tasks, 2 risks, 15 documents и created event.

### Ковтун — Чкалова 4 кв44

- `c2dd4db4-c995-4e63-8df7-cf318558050d`;
- `cdce4e04-4421-4079-9c9c-03380cc59631`.

### Ковтун — адрес не указан

- `e69a656a-54ec-4f1f-b5e6-e1f28334ba03`;
- `76ecc56e-36d4-47b9-8476-508f93b13cfe`.

### Ковтун — Прибрежная 1

- `32978be1-4652-472d-80f3-c030f69ad61a`;
- `a1256578-3150-4ee1-9e3a-163bd8d0a56d`.

Существующие записи не удалены и не объединены. Ручной разбор вынесен в issue #273. Для каждой пары нужны canonical deal, перенос уникальных данных, pre/post snapshot и audit event.

## Защита от новых дублей

### Browser layer — PR #270

- deterministic fingerprint полного draft + user ID;
- Web Locks API между вкладками;
- localStorage lease fallback на 120 секунд;
- recent receipt на 10 минут;
- receipt создаётся после исчезновения draft до перехода на карточку;
- повторная идентичная отправка блокируется;
- guard не вызывает mutation RPC напрямую;
- существующий address duplicate warning сохранён.

### Server layer — PR #271

- advisory transaction lock по автору и hash payload;
- окончательное решение только по точному `jsonb` equality;
- окно блокировки — две минуты;
- другие payload и другие авторы не блокируются;
- публичный RPC surface не расширялся;
- `nav_v2_save_wizard_result(jsonb)` не переписывался.

Issue #269 закрыта как выполненная по предотвращению. Историческая очистка остаётся в #273.

## Operational pilot artifacts

Файлы владельца по-прежнему не предоставлены.

### 1. Owner decision

Экран: `operational-pilot-decision-v2.html`.

Export:

`navigator_v2_operational_pilot_owner_decision`

Gate:

- автор owner/admin;
- все три lane имеют `confirmed` или `rejected`;
- основание не короче 10 символов;
- `decision_package_ready=true`;
- `pilot_started=false`;
- `pilot_start_authorized=false`.

### 2. Fresh validation

Экран: `operational-pilot-decision-validation-v2.html`.

Export:

`navigator_v2_operational_pilot_owner_decision_validation`

Gate:

- `decision_package_valid=true`;
- `fresh_revalidation_passed=true`;
- все контролируемые поля совпадают со свежим shortlist;
- любое изменение переводит запись в `stale`.

### 3. Measurement baseline

Export:

`navigator_v2_operational_pilot_measurement_baseline`

Gate:

- только актуальные `confirmed` deals;
- `baseline_ready=true`;
- readiness/tasks/risks/documents/responsibility зафиксированы;
- execution state начинается с `false`;
- automatic task/assignment/status changes запрещены.

### 4. Action checklist

Экран: `operational-pilot-action-checklist-v2.html`.

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
- `automatic_task_creation_available=false`;
- `automatic_assignment_available=false`;
- `automatic_status_change_available=false`;
- `pilot_started=false`;
- `pilot_start_authorized=false`;
- требуется отдельное owner start confirmation и согласие ответственного.

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
- Alias manifest: 17 live mappings и 17 canonical mappings, плюс ранее одобренный task-contract forward copy.
- New mapping source blob: `6aab0d57fa1cc33ffbbcc27444300db8da2df5dd`.
- Migration alias CI: PASS.
- Full static release drift contract: PASS.
- Approved live workflow в Environment `navigator-production-readonly` всё ещё требует ручного запуска владельца с `allow_drift=false`.

## Advisor

После DDL проверены Security и Performance Advisor.

- Новый trigger не добавил отдельного предупреждения по search path или grants.
- Остались прежние SECURITY DEFINER/Auth warnings и общие performance notices.
- Leaked-password protection не включать до authenticated E2E.

## Authenticated E2E blocker

- Изолированного Supabase test project/development branch нет.
- Environment `navigator-e2e` отсутствует.
- Disposable role accounts и mailbox отсутствуют.
- Authenticated role/invite/recovery/mutation E2E: BLOCKED.
- `authenticated-smoke=skipped` не является PASS.

## Ручные действия владельца

### Pilot

1. Сформировать owner decision JSON.
2. Выполнить fresh validation.
3. Скачать measurement baseline.
4. Загрузить baseline в action checklist.
5. Заполнить одно действие на каждую confirmed-сделку.
6. Скачать checklist JSON.
7. Не считать checklist запуском пилота.

### Исторические дубли

1. Открыть issue #273.
2. Для каждой из четырёх пар определить canonical deal.
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

- P0 MANUAL — получить четыре pilot-файла: owner decision, validation, baseline и action checklist.
- P0 MANUAL — решить canonical deal по четырём duplicate groups в #273.
- P0 MANUAL — получить четыре responsibility evidence-файла.
- P0 MANUAL — approved release drift workflow с `allow_drift=false`.
- P0 BLOCKED — isolated target + authenticated role/invite/recovery/mutation E2E.
- P1 BLOCKED ON VALID CHECKLIST — подготовить отдельное owner start confirmation без автоматической записи.
- P1 BLOCKED ON DUPLICATE OWNER DECISION — выполнить только одну подтверждённую группу очистки с pre/post snapshot и audit event.
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
- pilot shortlist/owner decision/validation/action-checklist scaffolding;
- browser save lock и exact server duplicate guard.

## Команда следующего запуска

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #272. Один раз проверь четыре pilot-файла, четыре responsibility evidence-файла, owner-решения по issue #273, Environment navigator-production-readonly и isolated auth target. Если checklist валиден — подготовь только отдельное browser-local owner start confirmation без mutation. Если владелец выбрал canonical deal для одной duplicate group — выполни только одну audited cleanup operation с новой server revalidation, pre/post snapshot и audit event. Если responsibility bundle валиден — выполни одну point correction. Без подтверждений рабочие данные не менять.`
