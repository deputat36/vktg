# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 25 июля 2026 года.
- Репозиторий: `deputat36/vktg`.
- Последний подтверждённый product `main`: `6cdfc18a4dc191111bb1f559de09b018de15d734` — squash merge PR #501.
- Открытые product PR по Navigator v2 отсутствуют на момент фиксации.
- Shared frontend build: `20260723-02`.
- Public GitHub Pages: `https://deputat36.github.io/vktg/`.
- Supabase project: `ofewxuqfjhamgerwzull`.
- Project: `ACTIVE_HEALTHY`, region `eu-west-1`.
- PostgreSQL: `17.6.1.121`.
- Последняя Navigator migration: `20260716063401_nav_v2_correct_mortgage_broker_scope`.
- Последняя общая migration: `20260721122333_revoke_anon_execute_leader_internal_rpcs` — относится к `leader_*`.
- Edge `nav-v2-deal-api`: v4, `ACTIVE`, `verify_jwt=true`.
- Edge SHA-256: `b64e3fdbc2fa22ccb4998e69232e4351308f1d9b0a7c3c2bec7093186d3e4095`.
- Preview branches отсутствуют.
- Technical `nav-e2e` users/profiles отсутствуют.

Не трогать `leader_*`.

## Назначение Navigator

Navigator — единая заявка на подготовку сделки и диспетчер взаимодействия СПН, юриста, ипотечного брокера и менеджера:

`потребность → факты → маршрутизация → документы/условия → решение профильной роли → выполнение → evidence → готовность → задаток/сделка → закрытие`

Navigator не является основной CRM, файловым архивом, банковской CRM, автоматическим юристом или системой оценки сотрудников по сырым counters.

Основная CRM хранит клиентов, объекты, обращения, задачи, договорённости, документы, сроки и историю взаимодействия. Navigator объясняет маршрут, проверяет полноту, показывает риски и готовит процессную запись для ручного переноса в CRM.

Автоматически создаваемый пункт должен иметь:

`trigger → owner → deadline → action → evidence → outcome → confirmation → gate impact`

## Production runtime

Действующее создание сделки:

- `spn-v2.html`;
- `assets/js/nav-v2/spn-smart-v4.js`;
- legacy RPC `public.nav_v2_save_wizard_result(jsonb)`;
- duplicate/idempotency/recovery guards.

Действующий legacy task lifecycle:

- `assets/js/nav-v2/task-action-guard-v2.js`;
- `assets/js/nav-v2/task-lifecycle-closure-model-v1.js`;
- legacy RPC `public.nav_v2_update_task_status(uuid, nav_v2_task_status)`;
- evidence-комментарий через `public.nav_v2_add_comment(uuid, text, text)`;
- deployed Edge facade v4 остаётся legacy-only.

Новый intake, bounded contracts, actor-aware routes и preview packages остаются repository-only.

## Shared frontend build

Build `20260723-02` содержит integrated Auth storage guard, versioned shared runtime, normalized importmap mappings на 35 root pages, диагностический cache-bust и permanent rollout gates.

Канонические configs:

- `config/nav-v2-public-build-attestation-v1.json`;
- `config/nav-v2-live-public-browser-runtime-v1.json`.

Build bumper:

- `scripts/bump_nav_v2_shared_build.py`.

Public decision:

`public_build_20260723_02_attested_read_only_via_github_pages_ci`

Browser decision:

`live_public_browser_runtime_20260723_02_verified_read_only`

Public evidence:

- run `30023416439`;
- evidence commit `41f9056d1021fd9a84ac3adf140b0877599e699b`;
- build `20260723-02`;
- pages `35/35`;
- artifact `8570253047`;
- artifact digest `sha256:24e71a7e91f394fbb70813cc5ae395dc5c7eb2fcee18aca019d57bf088c4cb5e`;
- desktop cases `5/5`;
- mobile cases `5/5`;
- unexpected `0`;
- flaky `0`.

Current public state:

- `live_public_build_verified=true`;
- `runtime_rollout_completed=true`;
- `authenticated_role_e2e_completed=false`;
- `live_browser_storage_failure_verified=false`.

Public/browser evidence относится к shared build и не доказывает полноценный новый cloud role/mutation E2E. Реальные browser storage failures не воспроизводились.

## Запись для основной CRM

Действующий read-only блок `В CRM` содержит текущий этап, результат, препятствие, договорённость, недостающие пункты, следующее действие, ответственного и срок.

Запись не сохраняется автоматически. Сотрудник проверяет и копирует её вручную. Navigator не создаёт параллельную CRM или отдельный журнал.

Task policy для legacy-задач использует явные `task_type`, `assigned_role` и `due_date`, а при отсутствии `task_type` — read-only классификацию по `source`. Production backfill не выполнялся.

## Закрытые frontend-блокеры task lifecycle

### Замыкание lifecycle — PR #495

Merge SHA: `8ce918a2bb3f2551b7797530400f9ded4cea15aa`.

Решение: `legacy_task_lifecycle_closure_frontend_enabled_atomic_server_completion_blocked`.

Действует последовательность:

- `open` → `Начать работу`;
- `in_progress` → обязательный результат и `Сохранить результат и завершить`;
- `done` → `Вернуть в работу`;
- `cancelled` → без рабочих действий.

Результат сохраняется раньше статуса `done`. Неуспешное сохранение результата не закрывает задачу; повтор в текущей сессии не дублирует уже сохранённый комментарий.

### Восстановление серверных разрешений — PR #497

Merge SHA: `a1bbd44421b966775ba1b20fc918124dfaceeb5a`.

Решение: `full_card_task_permission_bridge_enabled_lite_dto_database_change_blocked`.

Production lite DTO не содержит permission-полей. Frontend использует полный deal-card DTO как авторитетный fallback, сохраняет explicit denial и fail-closed поведение и не вычисляет права по роли или тексту задачи.

### Выбор исполнимой задачи — PR #499

Merge SHA: `214dc8534a4649b257c86b03761d6f3b7dbfc4e7`.

Решение: `actionable_task_preferred_in_existing_deal_focus_no_new_screen`.

Подтверждённый разрыв до исправления:

- у СПН было 6 доступных связок «пользователь–сделка» с открытыми задачами;
- во всех 6 была собственная исполнимая задача;
- во всех 6 прежний focus выбирал более срочную задачу другой роли;
- у юриста 13 из 17 связок имели исполнимую задачу, ещё 4 были control-only.

Теперь карточка сначала выбирает задачу с серверным `can_change_status=true`, открывает вкладку `Задачи`, прокручивает точный пункт и устанавливает keyboard focus на разрешённую кнопку. Чужие задачи остаются видимыми для контроля, но не перехватывают главное действие.

Профильная desktop/mobile проверка подтвердила точный переход `open → in_progress` через действующий status RPC. Новый task screen или mutation source не создавались.

### Непрерывный маршрут из списков — PR #501

Merge SHA: `6cdfc18a4dc191111bb1f559de09b018de15d734`.

Решение: `existing_dashboard_and_deal_list_links_preserve_work_section`.

Проверка перед изменением показала, что production transitions всё ещё отсутствуют, а рабочий стол и список сделок теряли уже известный контекст работы: кнопка открывала общую сводку вместо нужной вкладки.

Теперь существующие ссылки сохраняют рабочий контекст:

- просрочка и задачи СПН/брокера → `#tasks`;
- красный риск и стоп-фактор → `#risks`;
- документный режим → `#docs`;
- назначение ответственности → сводка;
- явные фильтры `overdue`, `red`, `docs` сохраняют соответствующую вкладку.

CTA показывает конкретное действие: `Открыть задачи`, `Открыть риски`, `Открыть документы` или `Открыть карточку`.

Логика встроена в существующий safe-link контур, не увеличивает module budget, не выполняет RPC/mutation/storage и не создаёт новый экран.

Проверка PR #501:

- 18 workflow завершились успешно;
- semantic/static contract и module budget зелёные;
- desktop/mobile browser scenarios для `#tasks`, `#risks`, `#docs` зелёные;
- public build, live runtime, Auth storage, session recovery, keyboard focus и screen structure зелёные;
- первоначальный browser failure был вызван неверным импортом test helper, тест не запускался; импорт исправлен, повторный полный head зелёный;
- review threads отсутствовали.

Канонические файлы:

- `config/nav-v2-work-route-continuity-v1.json`;
- `docs/NAV_V2_WORK_ROUTE_CONTINUITY_V1_2026-07-25.md`;
- `tests/e2e/work-route-continuity.spec.js`.

## Operational baseline

Последняя read-only production-сверка перед PR #501:

- задач: 98;
- `open`: 88;
- `in_progress`: 0;
- `done`: 0;
- `cancelled`: 10;
- событий `task_status_changed`: 0;
- командных комментариев в `nav_deal_comments_v2`: 5;
- последнее production task/event изменение: 16 июля 2026 года;
- последний комментарий: 24 мая 2026 года.

Repository/frontend merges не должны менять эти значения. Автоматические переходы, переназначения, перенос сроков и массовое закрытие не выполнялись.

Permission DTO, выбор actionable task и потеря вкладки при входе из dashboard/deals больше не считать открытыми blockers.

## Заблокированные пункты

### Permission-поля непосредственно в lite DTO

Статус: `blocked_requires_explicit_production_database_approval`.

Долгосрочное упрощение потребует production migration, проверки grants/RLS, exact rollback и authenticated permission E2E. Действующий fallback не блокирует frontend.

### Атомарное server-side завершение задачи

Статус: `blocked_requires_explicit_production_database_approval`.

Полная атомарность результата и статуса потребует production migration, rollback package, grants/RLS/actor scope, idempotency key и отдельного authenticated mutation E2E. Действующий frontend безопасно сохраняет evidence раньше статуса.

### Bounded task transport

Статус: `blocked_transport_disabled`.

Bounded actions распознаются, но network transport остаётся выключенным. Production Edge v4 не изменялся.

### Production backfill и массовое закрытие

Статус: `blocked_not_authorized_and_not_required_for_frontend_release`.

Не выполнять массовое заполнение `task_type`, переназначение, изменение сроков или закрытие существующих задач без отдельного решения владельца.

## Auth storage hardening

Shared runtime сохраняет fail-closed storage reads, session fingerprint tombstone, best-effort profile/email cache, normalized storage error, запрет RPC retry при несохраняемой refreshed session и cross-tab/concurrent refresh guards.

Authenticated browser role E2E остаётся отдельным cloud-gated этапом.

## Index/capacity status

Candidate decisions:

- `nav_user_profiles_role_idx (role)` — `retain`;
- `nav_deal_answers_v2_deal_idx (deal_id)` — `review_possible_redundancy_only`;
- unique `(deal_id, question_key)` остаётся.

Observation baseline:

- capture `2026-07-22T05:31:47.591346+00:00`;
- capture count `1`;
- required минимум `2`;
- cadence/thresholds `null`;
- representative workload не доказан.

Capacity form:

- 15 required values остаются `null`;
- form `unsubmitted`;
- approvals `false`;
- execution flags `false`.

Второй snapshot без отдельного выбора cadence/thresholds не выполнять.

Успешная offline validation формы не является execution authorization.

## Active gates

Generic `продолжай`, `работай по плану`, `действуй автономно` не являются approval.

### Preview/Auth E2E

Cloud шаг требует отдельного решения владельца: exact mode и цель, fresh branch cost, amount/currency/recurrence, explicit cost approval, disposable branch, synthetic technical accounts only, no production data/real employees и cleanup evidence.

Не вызывать cost confirmation.

Не создавать Supabase branch/accounts/secrets.

### Production index/DDL

Требуются approved observation cadence/thresholds, второй capture, representative authenticated workload, submitted capacity form, benchmark authorization, permitted environment, production-scale evidence, exact migration/rollback и отдельное DDL approval.

Не менять production DDL/DML/RLS/Auth/Edge.

Без этих решений cloud execution запрещено.

## Следующий безопасный slice

1. Не создавать новый task screen, CRM-summary или параллельный журнал.
2. В read-only monitoring проверить появление первых `task_status_changed`, `in_progress`, `done` и evidence-комментариев после публикации work-route continuity.
3. Если реальные переходы появились, проверить порядок evidence → done, отсутствие дубля комментария, уход завершённой задачи из active debt и выбор следующего пункта блоком `В CRM`.
4. Если переходы не появились после фактического использования обновлённого интерфейса, следующий repository-only этап — сопоставить role-specific list DTO с полной карточкой: доступность одной и той же приоритетной сделки, значения `open_tasks_count`/`overdue_tasks_count`, наличие задач текущей роли и сохранение exact deal id.
5. Исправлять существующий маршрут или DTO-consumer; новый экран создавать только при доказанной необходимости.
6. После подтверждённых task outcomes перейти к документам и рискам: terminal outcome должен убирать пункт из active debt.
7. Не выполнять production backfill, массовое назначение, перенос сроков или закрытие задач без отдельного решения владельца.
8. Permission-поля lite DTO, атомарный task-completion RPC и bounded transport держать заблокированными до отдельного production approval.
9. Поддерживать scheduled public source/browser monitoring.
10. Не выполнять второй index snapshot без выбранной cadence/thresholds.
11. Не создавать preview branch или technical identities без отдельного cost/Auth approval.
12. Не менять production schema/data/Auth/RLS/grants/Edge.
13. Не трогать `leader_*`.
