# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 21 июля 2026 года.
- Репозиторий: `deputat36/vktg`.
- `main`: `36696d373ab869e3dd7a78b989627eea873402c0` — squash merge PR #423.
- Supabase project: `ofewxuqfjhamgerwzull`.
- Organization: `Lider`, plan `free`.
- Project status: `ACTIVE_HEALTHY`.
- PostgreSQL: 17.6.
- Последняя Navigator production migration: `20260716063401_nav_v2_correct_mortgage_broker_scope`.
- Production Supabase, Auth, Edge Functions, RLS, grants и рабочие строки в PR #394–#423 не менялись.

Live counts могут меняться от реальной работы пользователей. Не откатывать данные только из-за изменения counts.

## Цель и продуктовая граница

Navigator — единая заявка на подготовку сделки и диспетчер взаимодействия СПН, юриста, ипотечного брокера и менеджера:

`потребность → короткий сбор фактов → маршрутизация → план документов и условий → решение профильной роли → выполнение → evidence → подтверждение готовности → задаток/сделка → закрытие`

Navigator не является CRM, файловым архивом, банковской CRM или автоматическим юристом.

- СПН фиксирует известные факты и выполняет свои действия.
- Юрист принимает юридические решения и подтверждает юридические gates.
- Брокер отвечает только за ипотечную консультацию, программу и одобрение.
- Маткапитал, сертификаты, субсидии, дети и опека без ипотеки относятся к СПН и юристу.
- Менеджер контролирует владельцев, сроки и исключения, но не заменяет профильную роль.
- Файлы остаются во внешнем утверждённом хранилище.

Каждый создаваемый пункт обязан иметь:

`trigger → owner → deadline → action → evidence → outcome → confirmation → gate impact`

Автоматический backlog нельзя расширять без completion contract.

## Текущий production baseline

Read-only проверка после PR #423:

- 23 сделки;
- 24 участника;
- 198 документов;
- 53 риска;
- 98 задач;
- 122 события.

В production отсутствуют:

- final 25-rule mapper;
- governed intake ledger;
- privacy-aligned quality helper;
- legacy cleanup planner;
- bounded actor-aware RPC overlay;
- новый intake Edge route;
- bounded frontend transport.

Exact production quality hashes не изменились:

- `nav_v2_sync_deal_quality_tasks(uuid)` — `c7163ba2e7ee374203c462b196bd629f`;
- `nav_v2_deal_quality_tasks_trigger()` — `3c9c1f1ed95e63cb11a10ad33f76a45e`.

Открытый legacy quality inventory:

- seller-name — 23;
- buyer-name — 17;
- address — 4;
- responsible-SPN — 2.

Всего — 46 строк. Не использовать counts или возраст задач для оценки сотрудников.

## Действующий runtime

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

- три верхнеуровневых этапа;
- versioned facts/evidence/rules/documents/decisions;
- legal passport и side-aware work plan;
- server recomputation и privacy allowlist;
- verified actor + trusted owner context;
- private request ledger и fingerprint;
- replay и atomic rollback;
- base inventory 13 supported / 12 fail-closed.

### PR #406–#410 — production-schema mapping, quality и cleanup decision

- production-like FK/enums/checks и 13 fixtures;
- privacy-aligned quality без ФИО и телефонов;
- 46 legacy tasks классифицированы 40/4/2;
- `selected_cleanup_option=null`;
- production cleanup не выполнялся.

### PR #412–#419 — полный legal catalog

- wave 1: `spouse`, `seller_absent`, `encumbrance`, `inheritance`;
- wave 2: `bankruptcy_risk`, `redevelopment`, `after_registration`, `certificate`;
- special: `legal_problem`, `partner_agency`, `flat_ground`, `house_land`.

Effective repository coverage:

- supported — 25;
- unsupported — 0.

PostgreSQL 17 доказал governed lifecycle, 25 exact-schema fixtures, replay, fail-closed tamper cases и layered rollback.

25/0 означает structural repository coverage, но не deployment readiness.

### PR #421 — deployment decision package

Merge: `6fd19cf766f5b60e2bdafae6e68cef5898da1ecf`.

Зафиксированы:

- три owner options;
- ordered rollout 0–9;
- отдельный authenticated E2E этап;
- отдельное production decision после E2E;
- optional cleanup только последним этапом.

Текущее состояние:

- `selected_deployment_option=null`;
- `selected_cleanup_option=null`;
- `production_ready=false`;
- `production_applied=false`;
- `branch_creation_allowed=false`.

### PR #422 — current branch cost snapshot

Merge: `dd33b2ab1de6523604386ddbf3aad8d15fd2cdb3`.

Read-only Supabase cost lookup от 21 июля 2026 года:

- branch cost — `0.01344` в час;
- six-hour ceiling — `0.08064`;
- connector не вернул валюту;
- `explicit_owner_cost_approval=false`;
- `cost_confirmation_id=null`;
- snapshot не разрешает branch creation;
- перед будущим `confirm_cost` стоимость проверяется повторно.

Cost refresh добавлен комментарием в issue #282.

### PR #423 — preview deployment bundle source manifest

Merge: `36696d373ab869e3dd7a78b989627eea873402c0`.

Собран ordered source inventory:

0. read-only preflight;
1. privacy-aligned quality replacement;
2. bounded tasks + actor identity;
3. governed intake + full 25-rule mapper;
4. Edge identity/action routes;
5. frontend flagged transport;
6. authenticated preview E2E;
7. optional legacy cleanup.

Текущее состояние manifest:

- `repository_source_inventory_complete=true`;
- `repository_bundle_manifest_ready=true`;
- `deployment_bundle_ready=false`;
- executable migrations отсутствуют;
- production rollback bundle отсутствует;
- Edge identity handler остаётся detached;
- `BOUNDED_TRANSPORT_ENABLED=false`;
- каждый layer имеет `apply_allowed=false`.

## Обязательные gates

### Preview branch gate

Создание preview branch запрещено без:

- явного выбора `authenticated_e2e_only`;
- execution-time cost recheck;
- explicit cost approval;
- `cost_confirmation_id`;
- six-hour lifetime ceiling;
- automatic delete plan;
- synthetic-only data policy.

Issue #282 остаётся binding cost gate. Generic команда `продолжай` не является approval.

### Deployment bundle gate

Даже после cost approval branch apply запрещён, пока отсутствуют:

- deterministic preview forward bundle;
- approved preview rollback bundle;
- resolved SQL dependency/order attestation;
- integrated Edge identity/action route;
- authenticated role matrix;
- cleanup verification plan.

### Production gate

Production deployment запрещён без:

- successful authenticated E2E;
- отдельного owner/deployment approval;
- approved migration and rollback;
- controlled pilot scope;
- production attestation;
- monitoring and rollback triggers.

### Cleanup gate

Закрытие 46 legacy quality rows запрещено без:

- live privacy-aligned replacement;
- выбранного cleanup option;
- owner cleanup approval;
- reconciliation attestation.

## Binding ограничения

Generic команда `продолжай` не является:

- согласием на платную Supabase branch;
- согласием на technical accounts;
- согласием на production migration;
- согласием на Edge deployment;
- согласием на изменение RLS/grants/Auth;
- согласием на backfill или cleanup;
- выбором deployment или cleanup option.

Не изменять production `leader_*`. Navigator использует только `nav_*` / `nav_v2_*` и общий Auth.

## Канонические артефакты

- `config/nav-v2-intake-contract-v1.json`
- `config/nav-v2-deployment-decision-package-v1.json`
- `config/nav-v2-preview-deployment-bundle-manifest-v1.json`
- `config/nav-v2-auth-e2e-readiness.json`
- `config/nav-v2-legacy-quality-cleanup-decision-v1.json`
- `docs/NAV_V2_DEPLOYMENT_DECISION_PACKAGE_V1_2026-07-20.md`
- `docs/NAV_V2_PREVIEW_DEPLOYMENT_BUNDLE_MANIFEST_V1_2026-07-21.md`
- `docs/NAV_V2_PRIVACY_ALIGNED_QUALITY_COMPLETENESS_V1_2026-07-20.md`
- `docs/NAV_V2_LEGACY_QUALITY_CLEANUP_DECISION_V1_2026-07-20.md`
- `docs/NAV_V2_INTAKE_SPECIAL_SEMANTICS_INTEGRATION_2026-07-20.md`

## Следующий безопасный slice

Без Supabase branch и без production approval разрешён CI-only preview bundle assembler:

1. Читать exact source order из `config/nav-v2-preview-deployment-bundle-manifest-v1.json`.
2. Render canonical intake adapter только во временный каталог CI.
3. Собирать forward SQL artifact вне `supabase/migrations`.
4. Собирать отдельный rehearsal rollback artifact вне `supabase/migrations`.
5. Запускать оба артефакта только на disposable PostgreSQL 17 service container.
6. Проверять duplicate definitions, dependency order, grants, replay и rollback.
7. Не добавлять Edge import, не включать transport и не вызывать Supabase cloud APIs.
8. Оставить `deployment_bundle_ready=false`, пока Edge integration и production rollback не утверждены.

## Команда следующего запуска

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #423. Следующий slice — CI-only preview bundle assembler: deterministic forward/rehearsal rollback artifacts во временном каталоге, PostgreSQL 17 validation, без supabase/migrations, branch, Auth, Edge deploy, production writes или cleanup.`
