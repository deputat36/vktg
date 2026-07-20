# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 20 июля 2026 года.
- Репозиторий: `deputat36/vktg`.
- `main`: `c0052992356102e20276bdd6c4e6c22bccad2e26` — squash merge PR #419.
- Supabase project: `ofewxuqfjhamgerwzull`.
- Project status: `ACTIVE_HEALTHY`.
- PostgreSQL: 17.6.
- Последняя Navigator production migration: `20260716063401_nav_v2_correct_mortgage_broker_scope`.
- Production Supabase, Auth, Edge Functions, RLS, grants и рабочие строки в PR #394–#419 не менялись.
- Все новые intake, quality, cleanup и semantics SQL остаются только в `supabase/prototypes`.

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

Read-only проверка после PR #419:

- 23 сделки;
- 24 участника;
- 198 документов;
- 53 риска;
- 98 задач;
- 122 события;
- final qualifier/preview/mapper отсутствуют;
- wave1/wave2 qualifiers и integrations отсутствуют;
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

Всего — 46 строк. Не использовать эти counts или возраст задач для оценки сотрудников.

## Действующий пользовательский runtime

Production создание сделки по-прежнему использует:

- `spn-v2.html`;
- `assets/js/nav-v2/spn-smart-v4.js`;
- legacy RPC `public.nav_v2_save_wizard_result(jsonb)`;
- сохранённый legacy server implementation;
- текущие duplicate/idempotency/recovery guards;
- действующую name-based quality-функцию.

Новый трёхэтапный intake и все новые SQL-контракты остаются detached repository-only prototypes.

## Завершённая repository-only цепочка

### PR #394–#404 — intake UX, trust boundary и governed save

- безопасное recovery;
- три верхнеуровневых этапа;
- versioned facts/evidence/rules/documents/decisions;
- legal passport и side-aware work plan;
- server recomputation и privacy allowlist;
- verified actor + trusted owner context;
- private request ledger и fingerprint;
- exact/concurrent replay;
- atomic rollback;
- base structural inventory 13 supported / 12 fail-closed.

### PR #406 — exact production-schema mapping rehearsal

Merge: `687002e6119207fb0719283b8d786e3b0bc72ced`.

Доказаны FK/enums/checks, 13 fixtures, replay и rollback на production-like schema.

### PR #408 — privacy-aligned quality completeness

Merge: `910523303d54a64a55c5ba054a75318373d4ef3e`.

ФИО и телефоны исключены из quality requirements. Checks стали representation-aware, bounded, owner-aware и auto-close capable. Mass backfill отсутствует. Production quality trigger не менялся.

### PR #410 — legacy quality cleanup decision package

Merge: `05d05ba77b7acc67b459b391352a9308ff1acecd`.

Read-only classification:

- `obsolete_privacy_conflict` — 40;
- `replace_object_context` — 4;
- `replace_representation` — 2.

Рекомендован `gradual_on_touch`, но `selected_option=null`. Production cleanup не выполнялся.

### PR #412–#413 — semantics wave 1

Интегрированы `spouse`, `seller_absent`, `encumbrance`, `inheritance`.

Effective repository overlay: 17 supported / 8 unsupported.

### PR #415–#416 — semantics wave 2

Интегрированы `bankruptcy_risk`, `redevelopment`, `after_registration`, `certificate`.

Effective repository overlay: 21 supported / 4 unsupported.

### PR #418–#419 — special semantics и полный catalog

Qualification и final integration для:

- `legal_problem` — stage trigger, red risk, no required documents;
- `partner_agency` — representation trigger, deal document scope;
- `flat_ground` — object-type trigger, two object documents;
- `house_land` — object-type trigger, three object documents.

Effective repository overlay: 25 supported / 0 unsupported.

Governed PostgreSQL 17 доказал:

- canonical, wave1 и wave2 regressions;
- exact special qualification;
- single и compatible composite plans;
- request-ledger replay;
- injected failure без ledger/shadow rows;
- layered rollback.

Exact-schema PostgreSQL 17 доказал:

- base 13 + wave1 4 + wave2 4 + special 4 = 25 fixtures;
- production-like FK/enums/status/task types;
- lawyer-only `legal_blocker` tasks с `intake_v1:<rule>`;
- red risk для `legal_problem`;
- deal/object document scope mapping с сохранением `source_hint`;
- exact replay;
- missing qualification, unexpected document, tampered risk/side и invalid FK fail-closed;
- полный rollback.

Важно: 25/0 означает structural repository coverage, но не deployment readiness.

## Полный catalog inventory

Repository-only structurally supported — 25 правил:

- `minor_seller`, `minor_buyer`, `child_money`, `power_of_attorney`, `shares`;
- `minor_registered`, `privatisation`, `court_basis`;
- `matcap`, `mortgage`, `military_mortgage`;
- `settlements_not_agreed`, `expenses_not_agreed`;
- `spouse`, `seller_absent`, `encumbrance`, `inheritance`;
- `bankruptcy_risk`, `redevelopment`, `after_registration`, `certificate`;
- `legal_problem`, `partner_agency`, `flat_ground`, `house_land`.

Repository-only unsupported inventory — 0.

## Обязательные gates

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

- real authenticated E2E;
- explicit owner/cost/deployment approval;
- approved migration и Edge rollout;
- controlled pilot;
- production attestation и rollback plan.

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

## Канонические артефакты

- `config/nav-v2-intake-contract-v1.json`
- `docs/NAV_V2_SPN_INTAKE_DESIGN_2026-07-17.md`
- `docs/NAV_V2_GOVERNED_INTAKE_SAVE_BOUNDARY_V1_2026-07-18.md`
- `docs/NAV_V2_INTAKE_PRODUCTION_SCHEMA_MAPPING_V1_2026-07-20.md`
- `docs/NAV_V2_PRIVACY_ALIGNED_QUALITY_COMPLETENESS_V1_2026-07-20.md`
- `docs/NAV_V2_LEGACY_QUALITY_CLEANUP_DECISION_V1_2026-07-20.md`
- `docs/NAV_V2_INTAKE_SEMANTICS_WAVE1_INTEGRATION_2026-07-20.md`
- `docs/NAV_V2_INTAKE_SEMANTICS_WAVE2_INTEGRATION_2026-07-20.md`
- `docs/NAV_V2_INTAKE_SPECIAL_SEMANTICS_QUALIFICATION_2026-07-20.md`
- `docs/NAV_V2_INTAKE_SPECIAL_SEMANTICS_INTEGRATION_2026-07-20.md`
- `config/nav-v2-intake-special-semantics-integration-v1.json`
- `supabase/prototypes/nav_v2_intake_special_semantics_integration_preview_v1.sql`
- `supabase/prototypes/nav_v2_intake_special_semantics_mapping_v1.sql`

## Следующий безопасный slice

Structural catalog work завершён. Без production approval разрешена только repository-only deployment decision package:

1. Свести intake, quality replacement, actor identity, bounded tasks и final 25/0 mapper в один ordered rollout manifest.
2. Зафиксировать обязательный порядок миграций и Edge deployment без их применения.
3. Зафиксировать authenticated role matrix: owner/admin/manager/SPN/lawyer/broker/viewer, allowed/forbidden deals, broker mortgage-only, cross-actor replay.
4. Зафиксировать pilot scope, rollback triggers, production attestation и cleanup decision dependency.
5. Оставить `selected_deployment_option=null`, `production_ready=false`, `production_applied=false`.
6. Не создавать Supabase branch, technical accounts и production migration без explicit owner/cost approval.

## Команда следующего запуска

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #419. Structural catalog coverage 25/0 завершён. Следующий slice — repository-only deployment decision package и ordered rollout manifest без branch, migration, Edge deploy, Auth/RLS/grants или cleanup. Production не менять без explicit owner/cost/deployment approval.`
