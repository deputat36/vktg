# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 21 июля 2026 года.
- Репозиторий: `deputat36/vktg`.
- `main`: `6449e8c4d91a014b24f715bf8fc84eba46ddce20` — squash merge PR #425.
- Supabase project: `ofewxuqfjhamgerwzull`.
- Organization: `Lider`, plan `free`.
- Project status: `ACTIVE_HEALTHY`.
- PostgreSQL: 17.6.
- Последняя Navigator production migration: `20260716063401_nav_v2_correct_mortgage_broker_scope`.
- Production Supabase, Auth, Edge Functions, RLS, grants и рабочие строки в PR #394–#425 не менялись.

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

Read-only проверка после PR #425:

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

### PR #394–#419 — intake, trust boundary и полный catalog

- три верхнеуровневых этапа;
- versioned facts/evidence/rules/documents/decisions;
- legal passport и side-aware work plan;
- server recomputation и privacy allowlist;
- verified actor + trusted owner context;
- private request ledger, replay и atomic rollback;
- production-like mapping;
- legal semantics wave1, wave2 и special;
- effective repository coverage 25 supported / 0 unsupported.

PostgreSQL 17 доказал governed lifecycle, 25 exact-schema fixtures, fail-closed tamper cases и layered rollback.

25/0 означает structural repository coverage, но не deployment readiness.

### PR #408–#410 — privacy quality и cleanup decision

- ФИО и телефоны исключены из нового quality contract;
- 46 legacy tasks классифицированы 40/4/2;
- deterministic zero-write planner доказан;
- `selected_cleanup_option=null`;
- production cleanup не выполнялся.

### PR #421 — deployment decision package

Merge: `6fd19cf766f5b60e2bdafae6e68cef5898da1ecf`.

Зафиксированы три owner options, ordered rollout 0–9, отдельный authenticated E2E и отдельное production decision после E2E.

Текущее состояние:

- `selected_deployment_option=null`;
- `selected_cleanup_option=null`;
- `production_ready=false`;
- `production_applied=false`;
- `branch_creation_allowed=false`.

### PR #422 — current branch cost snapshot

Merge: `dd33b2ab1de6523604386ddbf3aad8d15fd2cdb3`.

Read-only cost lookup от 21 июля 2026 года:

- branch cost — `0.01344` в час;
- six-hour ceiling — `0.08064`;
- connector не вернул валюту;
- `explicit_owner_cost_approval=false`;
- `cost_confirmation_id=null`;
- перед будущим `confirm_cost` стоимость проверяется повторно.

Cost refresh зафиксирован в issue #282.

### PR #423 — preview deployment source manifest

Merge: `36696d373ab869e3dd7a78b989627eea873402c0`.

Собран ordered source inventory:

0. read-only preflight;
1. privacy-aligned quality;
2. bounded tasks + actor identity;
3. governed intake + full 25-rule mapper;
4. Edge identity/action routes;
5. frontend flagged transport;
6. authenticated preview E2E;
7. optional cleanup.

`repository_source_inventory_complete=true`, но `deployment_bundle_ready=false`.

### PR #425 — CI-only preview bundle assembler

Merge: `6449e8c4d91a014b24f715bf8fc84eba46ddce20`.

Assembler формирует только во временном каталоге восемь rehearsal SQL-артефактов:

- quality forward/rollback;
- bounded core forward/rollback;
- bounded DTO forward/rollback;
- intake forward/rollback;
- `bundle-index.json`.

Доказано:

- две сборки побайтно идентичны;
- source order, SHA-256 и byte sizes совпадают;
- canonical adapter рендерится без unresolved markers;
- generated output не попадает в репозиторий или `supabase/migrations`;
- quality apply/assert/rollback — success;
- bounded core canonical/actor apply/assert/rollback — success;
- bounded DTO role/privacy apply/assert/rollback — success;
- intake base/governed/wave1/wave2/special/final 25-rule apply/assert/rollback — success;
- каждый segment сохраняет diagnostic log и всегда выполняет rollback;
- все 49 общих Navigator static checks — success.

Границы:

- artifacts rehearsal-only;
- `deployment_bundle_ready=false`;
- `production_rollback_bundle_ready=false`;
- это не production migrations и не утверждённый production rollback package;
- Supabase cloud API не вызывается.

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

- утверждённые preview migration candidates;
- утверждённый preview rollback package;
- integrated Edge identity/action route;
- authenticated role matrix;
- cleanup verification plan.

CI-only rehearsal bundle не закрывает эти gates.

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
- `config/nav-v2-preview-bundle-assembler-v1.json`
- `config/nav-v2-auth-e2e-readiness.json`
- `config/nav-v2-legacy-quality-cleanup-decision-v1.json`
- `scripts/assemble-nav-v2-preview-bundle-v1.mjs`
- `scripts/run-nav-v2-preview-bundle-segment-v1.sh`
- `docs/NAV_V2_PREVIEW_BUNDLE_ASSEMBLER_V1_2026-07-21.md`
- `docs/NAV_V2_PREVIEW_DEPLOYMENT_BUNDLE_MANIFEST_V1_2026-07-21.md`
- `docs/NAV_V2_DEPLOYMENT_DECISION_PACKAGE_V1_2026-07-20.md`

## Следующий безопасный slice

Без Supabase branch и без deploy approval разрешена repository-only Edge identity integration:

1. Подключить detached `task-action-edge-identity-v2.js` к Edge `index.ts` только за константой/feature flag `false`.
2. Не менять действующий legacy route по умолчанию.
3. Не помещать service-role key во frontend или responses/logs.
4. Проверять user JWT, verified actor candidate и точное соответствие actor-aware SQL signatures.
5. Добавить unit/static tests для missing/invalid Authorization, inactive profile, role mismatch, cross-actor replay и broker scope.
6. Добавить Deno/Node contract test без Supabase cloud calls.
7. Не деплоить Edge Function и не включать frontend bounded transport.
8. Сохранить `edge_deploy_ready=false` и `deployment_bundle_ready=false`.

## Команда следующего запуска

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #425. Следующий slice — repository-only Edge identity integration behind disabled feature flag: import detached handler, exact actor-aware SQL parity tests, no Edge deploy, no branch, no Auth/RLS/grants changes, no frontend transport, no production writes or cleanup.`
