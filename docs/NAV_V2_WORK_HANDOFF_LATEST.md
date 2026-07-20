# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 20 июля 2026 года.
- Репозиторий: `deputat36/vktg`.
- `main`: `05d05ba77b7acc67b459b391352a9308ff1acecd` — squash merge PR #410.
- Supabase project: `ofewxuqfjhamgerwzull`.
- Project status: `ACTIVE_HEALTHY`.
- PostgreSQL: 17.6.
- Последняя Navigator production migration: `20260716063401_nav_v2_correct_mortgage_broker_scope`.
- Production Supabase, Auth, Edge Functions, RLS, grants и рабочие строки в PR #394–#410 не менялись.
- Intake, governed save, production mapping, privacy-aligned quality и cleanup planner SQL остаются только в `supabase/prototypes`.

Live counts могут меняться от реальной работы пользователей. Не откатывать данные только из-за изменения counts.

## Цель и продуктовая граница

Navigator — единая заявка на подготовку сделки и диспетчер взаимодействия СПН, юриста, ипотечного брокера и менеджера:

`потребность → короткий сбор фактов → маршрутизация → план документов и условий → решение профильной роли → выполнение → evidence → подтверждение готовности → задаток/сделка → закрытие`

Navigator не является CRM, файловым архивом, банковской CRM или автоматическим юристом.

- СПН фиксирует известные факты, собирает безопасные статусы документов и выполняет свои действия.
- Юрист принимает юридические решения и подтверждает юридические gates.
- Брокер отвечает только за ипотечную консультацию, программу и одобрение.
- Маткапитал, сертификаты, субсидии, дети и опека без ипотеки относятся к СПН и юристу.
- Менеджер контролирует владельцев, сроки и исключения, но не заменяет профильную роль.
- Файлы остаются во внешнем утверждённом хранилище; Navigator хранит только безопасную ссылку, статус, владельца и срок.

Каждый создаваемый пункт обязан иметь:

`trigger → owner → deadline → action → evidence → outcome → confirmation → gate impact`

Автоматический backlog нельзя расширять без completion contract.

## Текущий production baseline

Read-only проверка после PR #410:

- 23 сделки;
- 24 участника;
- 198 документов;
- 53 риска;
- 98 задач;
- 122 события;
- governed intake ledger отсутствует;
- production intake mapper отсутствует;
- privacy-aligned quality helper отсутствует;
- cleanup planner отсутствует;
- bounded task columns и canonical governed task RPC отсутствуют;
- actor-aware task overloads отсутствуют;
- intake Edge route и новый frontend transport отсутствуют.

Exact production quality hashes остались прежними:

- `nav_v2_sync_deal_quality_tasks(uuid)` — `c7163ba2e7ee374203c462b196bd629f`;
- `nav_v2_deal_quality_tasks_trigger()` — `3c9c1f1ed95e63cb11a10ad33f76a45e`.

Открытый legacy quality inventory не изменён:

- seller-name — 23;
- buyer-name — 17;
- address — 4;
- responsible-SPN — 2.

Не использовать сырые production counts или возраст задач для оценки сотрудников: база содержит исторические, учебные и тестовые записи.

## Действующий пользовательский runtime

Production создание сделки по-прежнему использует:

- `spn-v2.html`;
- `assets/js/nav-v2/spn-smart-v4.js`;
- legacy RPC `public.nav_v2_save_wizard_result(jsonb)`;
- сохранённый legacy server implementation;
- текущие duplicate/idempotency/recovery guards;
- действующую name-based quality-функцию.

Новый трёхэтапный intake и все новые SQL-контракты остаются detached repository-only prototypes.

## Завершённая intake-цепочка

### PR #394–#398 — безопасный UX и intake contract

- безопасное recovery после неопределённого сохранения;
- три верхнеуровневых этапа;
- четыре состояния факта и evidence source;
- versioned каталог вопросов, триггеров, рисков, документов и решений;
- legal passport v1;
- lawyer-first отображение;
- side-aware document/task work plan.

### PR #400–#404 — server trust boundary и governed save

- detached server recomputation;
- запрет client owner IDs и чувствительных идентификаторов;
- 13 поддержанных и 12 fail-closed правил;
- verified actor + trusted owner context;
- private request ledger и payload fingerprint;
- exact/concurrent replay;
- atomic rollback;
- owner-aware participants/tasks;
- side-aware documents.

### PR #406 — exact production-schema mapping rehearsal

Merge: `687002e6119207fb0719283b8d786e3b0bc72ced`.

PostgreSQL 17 доказал compatibility с действующими columns/FK/enums/checks, 13 supported rules, replay и rollback. Mapper остаётся `production_ready=false`.

### PR #408 — privacy-aligned quality completeness

Merge: `910523303d54a64a55c5ba054a75318373d4ef3e`.

Repository-design уровень `privacy_quality_task_collision` закрыт:

- ФИО и телефоны исключены из quality requirements;
- checks учитывают seller/buyer/both/one-SPN/partner/unknown;
- объект проверяется по адресу/кадастровому номеру либо явной причине отсутствия;
- следующий шаг проверяется для legacy и intake;
- срок и профильные вопросы проверяются только для intake v1;
- новые quality-задачи имеют owner, отдельный creator, task type, SLA, priority, due date и auto-close;
- repeated sync не создаёт duplicate;
- mass backfill отсутствует;
- exact production function/trigger rollback доказан по MD5.

Решение существует только в репозитории. Production quality trigger не изменён.

### PR #410 — legacy quality cleanup decision package

Merge: `05d05ba77b7acc67b459b391352a9308ff1acecd`.

Read-only production classification:

- `obsolete_privacy_conflict` — 40 строк / 23 сделки;
- `replace_object_context` — 4 строки / 4 сделки;
- `replace_representation` — 2 строки / 2 сделки.

Repository-only planner доказал:

- exact synthetic inventory 46 строк;
- deterministic repeated output;
- exact classification 40/4/2;
- zero PII и zero employee-scoring semantics;
- zero business DML;
- неизменный count/hash synthetic tasks;
- service-role-only rehearsal;
- fail-closed manual review;
- полный rollback.

Owner options:

1. `gradual_on_touch` — рекомендован как самый безопасный;
2. `one_time_name_only_after_deploy`;
3. `controlled_reconciliation_after_deploy`.

`selected_option=null`. Ни один вариант не выбран автоматически. Production cleanup не выполнялся.

## Текущие gates

### Cleanup gate

Любое закрытие legacy quality rows запрещено без:

- явного выбора owner option;
- deployment privacy-aligned replacement;
- authenticated role matrix;
- owner cleanup approval;
- deployment approval;
- rollback attestation.

### Intake deployment gate

Подключение нового intake save path запрещено без:

- завершения fail-closed rule semantics;
- authenticated E2E;
- explicit owner/deployment approval;
- approved migration/Edge rollout;
- controlled pilot.

## Supported и fail-closed intake rules

Supported structural mapping rules:

- `minor_seller`, `minor_buyer`, `child_money`, `power_of_attorney`, `shares`;
- `minor_registered`, `privatisation`, `court_basis`;
- `matcap`, `mortgage`, `military_mortgage`;
- `settlements_not_agreed`, `expenses_not_agreed`.

Fail-closed rules:

- `spouse`, `seller_absent`, `encumbrance`, `inheritance`;
- `bankruptcy_risk`, `redevelopment`, `after_registration`, `legal_problem`;
- `partner_agency`, `flat_ground`, `house_land`, `certificate`.

## Канонические артефакты

- `docs/NAV_V2_SPN_INTAKE_AUDIT_2026-07-17.md`
- `docs/NAV_V2_SPN_INTAKE_DESIGN_2026-07-17.md`
- `config/nav-v2-intake-contract-v1.json`
- `docs/NAV_V2_INTAKE_SERVER_ADAPTER_V1_2026-07-18.md`
- `docs/NAV_V2_INTAKE_SAVE_INTEGRATION_V1_2026-07-18.md`
- `docs/NAV_V2_GOVERNED_INTAKE_SAVE_BOUNDARY_V1_2026-07-18.md`
- `docs/NAV_V2_INTAKE_PRODUCTION_SCHEMA_MAPPING_V1_2026-07-20.md`
- `docs/NAV_V2_PRIVACY_ALIGNED_QUALITY_COMPLETENESS_V1_2026-07-20.md`
- `docs/NAV_V2_LEGACY_QUALITY_CLEANUP_DECISION_V1_2026-07-20.md`
- `config/nav-v2-legacy-quality-cleanup-decision-v1.json`
- `supabase/prototypes/nav_v2_legacy_quality_cleanup_plan_v1.sql`

## Binding ограничения

Issue #282 остаётся обязательным cost/deployment gate.

Generic команда `продолжай` не является:

- согласием на платную Supabase branch;
- согласием на technical accounts;
- согласием на production migration;
- согласием на Edge deployment;
- согласием на изменение RLS/grants/Auth;
- согласием на массовый backfill или cleanup;
- выбором cleanup option.

Не изменять production `leader_*`. Navigator использует только `nav_*` / `nav_v2_*` и общий Auth.

## Следующий безопасный slice

Cleanup-поток достиг owner decision gate. Без обхода этого gate продолжить repository-only intake semantics wave 1:

1. Зафиксировать exact contract для четырёх fail-closed правил:
   - `spouse`;
   - `seller_absent`;
   - `encumbrance`;
   - `inheritance`.
2. Использовать только существующий versioned intake catalog: trigger, owner, documents, expected decision и gate impact не придумывать заново.
3. Добавить server/governed structural mapping без расширения broker scope и без автоматического юридического решения.
4. Сохранить fail-closed при отсутствии owner, required document status, evidence source или requested decision.
5. Доказать в PostgreSQL 17:
   - side-aware documents;
   - lawyer-only tasks;
   - correct risk/block flags;
   - no unsupported leakage;
   - exact replay/rollback;
   - production schema compatibility.
6. Уменьшить unsupported inventory с 12 до 8 только после зелёных tests.
7. Не подключать mapper к production и не менять cleanup rows.

## Команда следующего запуска

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #410. Cleanup остаётся owner-gated. Следующий slice — repository-only intake semantics wave 1 для spouse, seller_absent, encumbrance и inheritance с PG17 side/owner/risk/replay/rollback. Не применяй migration, не создавай Supabase branch и не меняй production без explicit owner/deployment/cost approval.`
