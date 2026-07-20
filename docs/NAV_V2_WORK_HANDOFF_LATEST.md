# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 20 июля 2026 года.
- Репозиторий: `deputat36/vktg`.
- `main`: `2579bb52661eb9469b585eadba71974178920f7e` — squash merge PR #416.
- Supabase project: `ofewxuqfjhamgerwzull`.
- Project status: `ACTIVE_HEALTHY`.
- PostgreSQL: 17.6.
- Последняя Navigator production migration: `20260716063401_nav_v2_correct_mortgage_broker_scope`.
- Production Supabase, Auth, Edge Functions, RLS, grants и рабочие строки в PR #394–#416 не менялись.
- Intake, governed save, schema mapping, privacy-aligned quality, cleanup planner и semantics overlays остаются только в `supabase/prototypes`.

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

Read-only проверка после PR #416:

- 23 сделки;
- 24 участника;
- 198 документов;
- 53 риска;
- 98 задач;
- 122 события;
- wave1/wave2 qualifiers отсутствуют;
- wave1/wave2 effective previews и mappers отсутствуют;
- governed intake ledger отсутствует;
- privacy-aligned quality helper отсутствует;
- cleanup planner отсутствует;
- bounded task columns и canonical governed task RPC отсутствуют;
- intake Edge route и новый frontend transport отсутствуют.

Exact production quality hashes остаются прежними:

- `nav_v2_sync_deal_quality_tasks(uuid)` — `c7163ba2e7ee374203c462b196bd629f`;
- `nav_v2_deal_quality_tasks_trigger()` — `3c9c1f1ed95e63cb11a10ad33f76a45e`.

Открытый legacy quality inventory не изменён:

- seller-name — 23;
- buyer-name — 17;
- address — 4;
- responsible-SPN — 2.

Не использовать production counts или возраст задач для оценки сотрудников: база содержит исторические, учебные и тестовые записи.

## Действующий пользовательский runtime

Production создание сделки по-прежнему использует:

- `spn-v2.html`;
- `assets/js/nav-v2/spn-smart-v4.js`;
- legacy RPC `public.nav_v2_save_wizard_result(jsonb)`;
- сохранённый legacy server implementation;
- текущие duplicate/idempotency/recovery guards;
- действующую name-based quality-функцию.

Новый трёхэтапный intake и все новые SQL-контракты остаются detached repository-only prototypes.

## Завершённые repository-only волны

### PR #394–#404 — intake UX, trust boundary и governed save

- безопасное recovery после неопределённого сохранения;
- три верхнеуровневых этапа;
- versioned facts/evidence/rules/documents/decisions;
- legal passport v1;
- side-aware document/task work plan;
- server recomputation и privacy allowlist;
- verified actor + trusted owner context;
- private request ledger и fingerprint;
- exact/concurrent replay;
- atomic rollback;
- base structural inventory 13 supported / 12 fail-closed.

### PR #406 — exact production-schema mapping rehearsal

Merge: `687002e6119207fb0719283b8d786e3b0bc72ced`.

PostgreSQL 17 доказал base compatibility с действующими columns/FK/enums/checks, 13 fixtures, replay и rollback. Mapper остаётся `production_ready=false`.

### PR #408 — privacy-aligned quality completeness

Merge: `910523303d54a64a55c5ba054a75318373d4ef3e`.

Repository-design конфликт `privacy_quality_task_collision` закрыт:

- ФИО и телефоны исключены из quality requirements;
- checks учитывают seller/buyer/both/one-SPN/partner/unknown;
- объект проверяется по адресу/кадастровому номеру либо явной причине отсутствия;
- следующий шаг проверяется для legacy и intake;
- срок и профильные вопросы проверяются только для intake v1;
- новые quality-задачи имеют owner, отдельный creator, task type, SLA, priority, due date и auto-close;
- mass backfill отсутствует;
- exact production function/trigger rollback доказан по MD5.

Production quality trigger не изменён.

### PR #410 — legacy quality cleanup decision package

Merge: `05d05ba77b7acc67b459b391352a9308ff1acecd`.

Read-only classification:

- `obsolete_privacy_conflict` — 40 строк;
- `replace_object_context` — 4 строки;
- `replace_representation` — 2 строки.

Planner доказал deterministic 40/4/2, zero PII, zero employee scoring, zero DML, неизменный task hash и rollback.

Owner options:

1. `gradual_on_touch` — рекомендован, но не выбран;
2. `one_time_name_only_after_deploy`;
3. `controlled_reconciliation_after_deploy`.

`selected_option=null`. Production cleanup не выполнялся.

### PR #412–#413 — legal semantics wave 1

Qualification и integration для:

- `spouse`;
- `seller_absent`;
- `encumbrance`;
- `inheritance`.

Effective repository overlay: 17 supported / 8 unsupported.

Доказаны exact catalog semantics, lawyer ownership, side-aware documents, risk/gate flags, exact replay, partial-failure rollback и exact production-like schema на 17 fixtures.

### PR #415–#416 — legal semantics wave 2

Qualification и integration для:

- `bankruptcy_risk`;
- `redevelopment`;
- `after_registration`;
- `certificate`.

Effective repository overlay: 21 supported / 4 unsupported.

Server/governed PostgreSQL 17 доказал:

- wave1 17/8 regression сохранён;
- gap снимается только при exact wave2 qualification;
- lawyer owner и document scope seller/object/deal/buyer сохраняются;
- combined plan допускает базовые SPN rules и четыре wave2 lawyer rules одновременно;
- exact ledger replay не создаёт дубли;
- remaining special semantics остаются blocked;
- partial failure не оставляет ledger/shadow rows;
- layered rollback проходит.

Exact-schema PostgreSQL 17 доказал:

- base 13 + wave1 4 + wave2 4 = 21 synthetic deals;
- production-like FK/enums/status/task types проходят;
- object/deal отображаются в `both` с исходным `source_hint`;
- seller/buyer scope сохраняется напрямую;
- создаются lawyer `legal_blocker` tasks с `intake_v1:<rule>`;
- exact replay, tamper/FK failures и полный rollback проходят.

`production_ready=false`. Production execute отсутствует.

## Effective supported и fail-closed rules

Effective repository supported inventory — 21 правило:

- `minor_seller`, `minor_buyer`, `child_money`, `power_of_attorney`, `shares`;
- `minor_registered`, `privatisation`, `court_basis`;
- `matcap`, `mortgage`, `military_mortgage`;
- `settlements_not_agreed`, `expenses_not_agreed`;
- `spouse`, `seller_absent`, `encumbrance`, `inheritance`;
- `bankruptcy_risk`, `redevelopment`, `after_registration`, `certificate`.

Effective fail-closed inventory — 4 специальных правила:

- `legal_problem`;
- `partner_agency`;
- `flat_ground`;
- `house_land`.

## Текущие gates

### Cleanup gate

Любое закрытие 46 legacy quality rows запрещено без:

- явного выбора owner option;
- deployment privacy-aligned replacement;
- authenticated role matrix;
- owner cleanup approval;
- deployment approval;
- rollback attestation.

### Intake deployment gate

Подключение нового intake save path запрещено без:

- завершения четырёх special semantics;
- authenticated E2E;
- explicit owner/deployment approval;
- approved migration/Edge rollout;
- controlled pilot.

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
- `docs/NAV_V2_INTAKE_SEMANTICS_WAVE1_QUALIFICATION_2026-07-20.md`
- `docs/NAV_V2_INTAKE_SEMANTICS_WAVE1_INTEGRATION_2026-07-20.md`
- `docs/NAV_V2_INTAKE_SEMANTICS_WAVE2_QUALIFICATION_2026-07-20.md`
- `docs/NAV_V2_INTAKE_SEMANTICS_WAVE2_INTEGRATION_2026-07-20.md`
- `config/nav-v2-intake-semantics-wave2-integration-v1.json`
- `supabase/prototypes/nav_v2_intake_semantics_wave2_integration_v1.sql`

## Binding ограничения

Issue #282 остаётся обязательным cost/deployment gate.

Generic команда `продолжай` не является:

- согласием на платную Supabase branch;
- согласием на technical accounts;
- согласием на production migration;
- согласием на Edge deployment;
- согласием на изменение RLS/grants/Auth;
- согласием на backfill или cleanup;
- выбором cleanup option.

Не изменять production `leader_*`. Navigator использует только `nav_*` / `nav_v2_*` и общий Auth.

## Следующий безопасный slice

Cleanup остаётся owner-gated. Продолжить repository-only special semantics qualification для четырёх оставшихся правил:

1. `legal_problem` — stage-driven urgent lawyer case, documents могут отсутствовать.
2. `partner_agency` — representation-driven responsibility boundary.
3. `flat_ground` — object-type driven проверка связи помещения с землёй, входом и коммуникациями.
4. `house_land` — object-type driven согласованность документов дома и участка.

Требования:

- использовать только exact versioned catalog;
- не принимать юридическое решение автоматически;
- сохранить lawyer ownership и отсутствие broker leakage;
- отдельно квалифицировать trigger kind: stage / representation / object_type;
- проверить no-document rule для `legal_problem`;
- проверить partner responsibility document scope;
- проверить object/document scopes для `flat_ground` и `house_land`;
- сохранить effective 21/4 до отдельной final integration wave;
- доказать positive/combined/negative cases и rollback в PostgreSQL 17;
- не подключать production mapper, Edge или frontend.

После qualification отдельным PR можно интегрировать special wave и перейти к effective 25/0. Это всё ещё не является deployment readiness без authenticated E2E и owner approval.

## Команда следующего запуска

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #416. Cleanup остаётся owner-gated. Следующий slice — repository-only special semantics qualification для legal_problem, partner_agency, flat_ground и house_land с exact catalog trigger/owner/document/risk/handoff PG17 evidence. Не применяй migration, не создавай Supabase branch и не меняй production без explicit owner/deployment/cost approval.`
