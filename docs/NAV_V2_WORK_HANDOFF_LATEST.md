# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 20 июля 2026 года.
- Репозиторий: `deputat36/vktg`.
- `main`: `910523303d54a64a55c5ba054a75318373d4ef3e` — squash merge PR #408.
- Supabase project: `ofewxuqfjhamgerwzull`.
- Project status: `ACTIVE_HEALTHY`.
- PostgreSQL: 17.6.
- Последняя Navigator production migration: `20260716063401_nav_v2_correct_mortgage_broker_scope`.
- Production Supabase, Auth, Edge Functions, RLS, grants и рабочие строки в PR #394–#408 не менялись.
- Intake, governed save, production mapping и privacy-aligned quality SQL остаются только в `supabase/prototypes`.

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

Read-only проверка после PR #408:

- 23 сделки;
- 24 участника;
- 198 документов;
- 53 риска;
- 98 задач;
- 122 события;
- governed intake ledger отсутствует;
- production intake mapper отсутствует;
- privacy-aligned quality helper отсутствует;
- bounded task columns и canonical governed task RPC отсутствуют;
- actor-aware task overloads отсутствуют;
- intake Edge route и новый frontend transport отсутствуют.

Exact production quality hashes остались прежними:

- `nav_v2_sync_deal_quality_tasks(uuid)` — `c7163ba2e7ee374203c462b196bd629f`;
- `nav_v2_deal_quality_tasks_trigger()` — `3c9c1f1ed95e63cb11a10ad33f76a45e`.

Не использовать сырые production counts для оценки сотрудников: база содержит исторические, учебные и тестовые записи.

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

PostgreSQL 17 доказал:

- совместимость с действующими deal/participant/document/risk/task/event columns;
- FK, enum, check, replay и rollback;
- 13 supported-rule fixtures;
- безопасное отображение `object`/`deal` scope в production `both` с сохранением исходного scope;
- отображение `info` risk в допустимый enum без расширения broker scope;
- разрешённые task types и source `intake_v1:`;
- explicit `production_ready=false`.

### PR #408 — privacy-aligned quality completeness

Merge: `910523303d54a64a55c5ba054a75318373d4ef3e`.

Закрыт repository-design уровень конфликта `privacy_quality_task_collision`:

- ФИО и телефоны исключены из quality requirements;
- seller-only не получает buyer requirement;
- buyer-only не получает seller requirement;
- `both` проверяет обе стороны;
- `one_spn_both` требует одинакового СПН;
- partner/unknown не угадывают сторону;
- объект проверяется по адресу/кадастровому номеру либо явной причине отсутствия;
- следующий шаг проверяется для legacy и intake;
- срок и профильные вопросы проверяются только для intake v1;
- каждая новая quality-задача имеет owner, отдельный creator, task type, SLA, priority, due date и auto-close;
- повторный sync не создаёт дубликат;
- prototype не выполняет mass backfill;
- exact production function/trigger rollback доказан по MD5.

Все обязательные workflow PR #408 завершились success, review threads отсутствовали.

Важно: решение существует только в репозитории. Production trigger не изменён, поэтому production deployment всё ещё заблокирован.

## Read-only impact и legacy quality inventory

Текущие открытые legacy quality tasks:

- `auto_quality_seller_name` — 23;
- `auto_quality_buyer_name` — 17;
- `auto_quality_address` — 4;
- `auto_quality_responsible_spn` — 2.

Всего — 46 строк. Первые 40 противоречат privacy-модели. Остальные 6 должны быть сопоставлены с новым representation-aware контрактом, а не механически закрыты.

Read-only preview нового контракта на текущих 23 карточках:

- уточнить representation — 2;
- назначить seller СПН — 0;
- назначить buyer СПН — 1;
- исправить `one_spn_both` — 0;
- уточнить объект — 4;
- указать следующий шаг — 0;
- intake deadline — 0;
- lawyer question — 0;
- broker question — 0.

Это не cleanup-план и не основание для оценки сотрудников.

## Supported и unsupported intake rules

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
- `config/nav-v2-privacy-aligned-quality-completeness-v1.json`
- `supabase/prototypes/nav_v2_privacy_aligned_quality_completeness_v1.sql`
- `supabase/prototypes/nav_v2_privacy_aligned_quality_task_author_v1.sql`

## Binding ограничения

Issue #282 остаётся обязательным cost/deployment gate.

Generic команда `продолжай` не является:

- согласием на платную Supabase branch;
- согласием на technical accounts;
- согласием на production migration;
- согласием на Edge deployment;
- согласием на изменение RLS/grants/Auth;
- согласием на массовый backfill или cleanup.

Не изменять production `leader_*`. Navigator использует только `nav_*` / `nav_v2_*` и общий Auth.

## Следующий безопасный slice

Без production approval подготовить repository-only legacy quality cleanup decision package:

1. Зафиксировать read-only inventory 46 устаревших задач без ФИО и телефонов.
2. Для каждой категории определить безопасную классификацию:
   - obsolete privacy-conflict;
   - resolved under new contract;
   - replace with representation-aware requirement;
   - requires manual review.
3. Сравнить варианты владельческого решения:
   - постепенное закрытие при касании сделки;
   - одноразовое закрытие только name-based задач после deployment;
   - управляемая reconciliation всех четырёх legacy sources.
4. Создать deterministic read-only planner без DML и без production call.
5. Доказать в PostgreSQL 17 zero writes, stable plan, no PII, no employee scoring и полный rollback.
6. Подготовить owner decision schema с `selected_option=null` и обязательными deployment/auth gates.
7. Не закрывать и не удалять production tasks без отдельного решения владельца.

## Команда следующего запуска

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #408. Следующий slice — repository-only legacy quality cleanup decision package: read-only inventory, deterministic classification, owner options, PG17 zero-write/rollback. Не применяй migration, не создавай Supabase branch, не закрывай production tasks и не меняй production без explicit owner/deployment/cost approval.`
