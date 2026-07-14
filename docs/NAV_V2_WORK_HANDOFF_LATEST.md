# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 2026-07-14.
- Текущий `main` до release-sync: `8bbb66fb3d64a31e67d502926c33dcd29e2568bb` — merge PR #279.
- Release-sync: PR #280.
- Supabase project: `ofewxuqfjhamgerwzull`.
- Последняя production migration: `20260714125054_nav_v2_exact_duplicate_review_pack`.
- Canonical source: `20260714130000_nav_v2_exact_duplicate_review_pack.sql`.
- Canonical Git blob: `cd6c0962b7f3bfcce5bc3b51fe717fbfca100a14`.
- Public operational report version: 8.
- Exact duplicate review version: 1.
- Pilot shortlist version: 1.
- Canonical frontend build: `20260711-01`.
- Supabase branches: только production `main`; isolated auth target отсутствует.
- `authenticated-smoke=skipped` не является authenticated PASS.

## Последние завершённые PR

- #280 — release baseline/alias/handoff sync после duplicate-review deploy.
- #279 — устойчивый assertion после нормализации SQL в `pg_get_functiondef`.
- #278 — read-only exact duplicate review pack и owner decision draft.
- #277 — browser-local evidence согласия ответственного по pilot action.
- #276 — handoff после owner start confirmation.
- #275 — browser-local owner start confirmation перед ручным pilot action.
- #272/#271/#270 — release sync, server exact duplicate guard и browser cross-tab save guard.
- #268/#266/#264/#262 — action checklist, fresh validation, owner decision и pilot shortlist.

## Supabase production

Контроль после deploy duplicate-review:

- Deals: 23.
- Tasks: 98.
- Risks: 53.
- Documents: 198.
- Events: 118.
- Profiles: 5.
- Synthetic rollback-smoke rows: 0.
- Duplicate trigger присутствует и включён.
- Latest live migration: `20260714125054`.
- Рабочие строки во время duplicate-review deploy не менялись.

Operational adoption в owner-context:

- report version: 8;
- deals in 30-day scope: 18;
- confirmed results: 1;
- active without result: 17;
- confirmed result rate: 5,6%;
- open tasks: 82;
- open risks: 48;
- pilot shortlist: 3;
- exact duplicate groups: 4;
- exact duplicate deals: 8.

## Exact duplicate review pack — PR #278/#279

Страница:

`operational-duplicate-review-v2.html`

Источник:

существующий `nav_v2_get_operational_adoption_report`; новый browser RPC не создавался.

Private helper:

`nav_v2_private.nav_v2_get_exact_duplicate_review_pack_unchecked_20260714(integer)`

Граница доступа:

- `PUBLIC`: execute отсутствует;
- `anon`: execute отсутствует;
- `authenticated`: прямой execute отсутствует;
- `service_role`: execute разрешён;
- public adoption wrapper доступен только active owner/admin/manager;
- active SPN получает SQLSTATE `42501`.

Пакет сравнивает:

- основную карточку;
- задачи;
- риски;
- документы;
- события;
- комментарии;
- проверки;
- участников;
- расходы.

Нормализация:

- исключаются demo-карточки с `ДЕМО:`;
- child IDs и `deal_id` в event payload не считаются бизнес-расхождением;
- сравниваются семантические значения, а не generated IDs/timestamps.

Live summary:

- groups: 4;
- deals: 8;
- exact semantic groups: 4;
- diverged groups: 0;
- groups with comments/reviews: 0;
- `selection_available=false`;
- `mutation_available=false`;
- `cleanup_execution_available=false`;
- `owner_decision_required=true`.

### Группа 1 — Прибрежная 1

- group key: `94266cef2846bca73aaa42f92782e842`;
- creator: Алексей Ковтун;
- interval: 84,9 сек;
- suggested earliest deal: `32978be1-4652-472d-80f3-c030f69ad61a`;
- second deal: `a1256578-3150-4ee1-9e3a-163bd8d0a56d`;
- all semantic entities currently equal.

### Группа 2 — адрес не указан

- group key: `42fc63e900b74f0618d21e17591678c2`;
- creator: Алексей Ковтун;
- interval: 51,6 сек;
- suggested earliest deal: `e69a656a-54ec-4f1f-b5e6-e1f28334ba03`;
- second deal: `76ecc56e-36d4-47b9-8476-508f93b13cfe`;
- all semantic entities currently equal.

### Группа 3 — Чкалова 4 кв44

- group key: `a4e27cd2675ba5f7eeaace9024287992`;
- creator: Алексей Ковтун;
- interval: 6,4 сек;
- suggested earliest deal: `c2dd4db4-c995-4e63-8df7-cf318558050d`;
- second deal: `cdce4e04-4421-4079-9c9c-03380cc59631`;
- all semantic entities currently equal.

### Группа 4 — Первомайская, 3

- group key: `0105855fc9d3f59de73cf742d325d326`;
- creator: Овчинников Александр Константинович;
- interval: 6,1 сек;
- suggested earliest deal: `366330f5-966c-4f97-8147-7e79e2ea408d`;
- second deal: `06a14681-d77d-4b3c-b65f-f887fffb3bbd`;
- all semantic entities currently equal.

Важно:

- earliest-created deal — только предложение средней уверенности;
- система не выбирает canonical deal автоматически;
- одинаковое текущее состояние не является разрешением удалить вторую карточку;
- owner/admin должен явно определить canonical deal и resolution.

Owner decision export:

`navigator_v2_exact_duplicate_owner_decision`

Варианты resolution:

- `keep_both`;
- `merge_then_archive`;
- `archive_duplicate`;
- `cancel_duplicate`;
- `needs_manual_review`.

Даже готовый decision package содержит:

- `cleanup_authorized=false`;
- `server_mutation_available=false`;
- automatic canonical selection/merge/archive/cancel disabled;
- required fresh server revalidation;
- required pre/post snapshots;
- required audit event;
- one group at a time.

Issue #273 остаётся открытой до owner-решения и выполнения каждой группы отдельно.

## Duplicate prevention

Browser layer — PR #270:

- deterministic draft + user fingerprint;
- Web Locks cross-tab lock;
- localStorage lease fallback на 120 секунд;
- recent save receipt на 10 минут;
- repeat identical submit blocked.

Server layer — PR #271:

- BEFORE INSERT trigger на `nav_deals_v2`;
- advisory transaction lock по author + payload hash;
- exact `jsonb` equality;
- двухминутное окно;
- существующие строки не изменяются;
- trigger function закрыта от `PUBLIC`, `anon`, `authenticated`.

## Operational pilot shortlist

Read-only shortlist остаётся прежним:

1. `a6740629-8e36-4fb9-8b3f-08510fd0497f` — quick result, Пушкинская 97-11.
2. `03029d49-6e43-47b6-856e-4886f0ac320a` — responsibility confirmation, Танцырей.
3. `a696d7f8-6c9f-4a2b-87e9-3a7594a31787` — document workflow, Приборная.

Shortlist:

- не является рейтингом сотрудников;
- не выбирает сделки;
- не запускает pilot;
- не создаёт tasks/assignments/status changes;
- требует owner decision.

## Pilot artifact chain

Пользовательские JSON-файлы не предоставлены. Серверное исполнение заблокировано.

### 1. Owner decision

- page: `operational-pilot-decision-v2.html`;
- export: `navigator_v2_operational_pilot_owner_decision`;
- all lanes reviewed;
- `decision_package_ready=true`;
- `pilot_started=false`.

### 2. Fresh validation

- page: `operational-pilot-decision-validation-v2.html`;
- export: `navigator_v2_operational_pilot_owner_decision_validation`;
- `decision_package_valid=true`;
- `fresh_revalidation_passed=true`;
- stale data blocks the chain.

### 3. Measurement baseline

- export: `navigator_v2_operational_pilot_measurement_baseline`;
- only fresh confirmed deals;
- `baseline_ready=true`;
- execution state starts false.

### 4. Action checklist

- page: `operational-pilot-action-checklist-v2.html`;
- export: `navigator_v2_operational_pilot_action_checklist`;
- exactly one action per confirmed deal;
- responsible, deadline, evidence, expected result and next step required;
- `checklist_is_execution_authorization=false`.

### 5. Owner start confirmation

- page: `operational-pilot-start-confirmation-v2.html`;
- export: `navigator_v2_operational_pilot_owner_start_confirmation`;
- owner/admin chooses `authorized` or `rejected`;
- authorization expiry must be future and no later than action due date;
- `owner_confirmation_is_server_execution=false`;
- `pilot_started=false`.

### 6. Responsible acknowledgement evidence — PR #277

- page: `operational-pilot-responsible-acknowledgement-v2.html`;
- export: `navigator_v2_operational_pilot_responsible_acknowledgement_evidence`;
- records external evidence of `acknowledged`, `rejected` or `needs_clarification`;
- identity must match action checklist;
- acknowledgement time must fit owner authorization and action deadline;
- owner/admin is only the recorder;
- `acknowledgement_is_authenticated_self_action=false`;
- `authenticated_self_acknowledgements=0`;
- `execution_authorized=false`;
- `pilot_started=false`;
- requires authenticated responsible confirmation or explicit owner exception rule;
- requires separate execution receipt.

No pilot action may be written to production until the chain is provided and authenticated identity/mutation evidence exists.

## Responsibility correction workflow

Still blocked until four files are supplied:

1. confirmation JSON;
2. validation report with `point_operation_ready=true`;
3. fresh server preview with fingerprint;
4. evidence bundle manifest with `bundle_ready=true`.

Without this bundle do not change:

- `seller_spn_id`;
- `buyer_spn_id`;
- `manager_id`.

## Release drift

After PR #280:

- baseline latest live: `20260714125054`;
- canonical source: `20260714130000`;
- source blob: `cd6c0962b7f3bfcce5bc3b51fe717fbfca100a14`;
- live aliases: 18;
- approved canonical repository-only mappings: 18 plus the existing task-contract forward mapping;
- migration alias CI must be PASS;
- full static release contract must be PASS.

Approved production-readonly workflow still requires owner manual dispatch with `allow_drift=false`.

## Advisors

After duplicate-review DDL:

- Security Advisor: private helper did not leak; public role-gated adoption wrapper remains an expected authenticated SECURITY DEFINER warning.
- Performance Advisor: no duplicate-review-specific issue identified.
- Shared-project warnings from legacy Nav, Leader, Parket and other systems were not automatically modified.
- Leaked-password protection remains disabled until authenticated invite/recovery E2E.

## Authenticated E2E blocker

- only Supabase production `main` exists;
- `navigator-e2e` Environment absent;
- disposable role accounts/mailbox absent;
- authenticated role/invite/recovery/mutation E2E is BLOCKED;
- `authenticated-smoke=skipped` is not PASS.

## NEXT_WORK_QUEUE

- P0 MANUAL — owner/admin opens `operational-duplicate-review-v2.html` and exports one complete duplicate decision package.
- P0 MANUAL — choose canonical deal and resolution for each group in issue #273.
- P0 BLOCKED ON VALID DUPLICATE DECISION — prepare fresh server revalidation and audited cleanup preview for only one group; no mutation yet.
- P0 MANUAL — provide six pilot files through responsible acknowledgement evidence.
- P0 BLOCKED ON RESPONSIBLE IDENTITY — authenticated acknowledgement or explicit documented owner exception rule.
- P0 MANUAL — provide four responsibility evidence files.
- P0 MANUAL — run approved production-readonly drift workflow with `allow_drift=false`.
- P0 BLOCKED — create isolated Supabase target and `navigator-e2e` Environment after explicit cost approval.
- P1 BLOCKED ON AUTH EVIDENCE — audited synthetic task-contract mutation.
- P1 — leaked-password protection only after invite/recovery E2E.

## DO NOT REPEAT without a new reason

- general technical audit;
- public guest/no-JWT/private-helper smoke;
- mechanical deal-card consolidation;
- risk lifecycle #218;
- readiness/task taxonomy/broker/viewer/lawyer previews;
- owner/admin IA;
- adoption report/comparison;
- manager proposal/grouped remediation;
- responsibility draft/validation/server preview/bundle;
- pilot shortlist/owner decision/validation/checklist/start/acknowledgement scaffolding;
- browser save lock and exact server duplicate guard;
- duplicate review comparison already delivered in PR #278.

## Команда следующего запуска

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #280. Один раз проверь наличие duplicate owner decision JSON, шести pilot-файлов, четырёх responsibility evidence-файлов, результатов approved release drift workflow и isolated auth target. Если duplicate decision валиден — подготовь только fresh read-only server revalidation/cleanup preview для одной группы; без preview и owner decision production не менять. Если pilot acknowledgement валиден и identity подтверждена — подготовь только execution receipt contract без автоматической задачи или status mutation. Без evidence рабочие данные не менять.`
