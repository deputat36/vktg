# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 2026-07-14.
- Текущий `main`: `c790364d067417a0f555da78ba30ea5144b2fb30` — merge PR #281.
- Supabase project: `ofewxuqfjhamgerwzull`.
- Последняя production migration: `20260714125054_nav_v2_exact_duplicate_review_pack`.
- Canonical migration: `20260714130000_nav_v2_exact_duplicate_review_pack.sql`.
- Public operational report version: 8.
- Exact duplicate review version: 1.
- Pilot shortlist version: 1.
- Canonical frontend build: `20260711-01`.
- Open PR: нет.
- Supabase branches: только production `main`.
- Isolated authenticated target: не создан.
- `authenticated-smoke=skipped` не является authenticated PASS.

## Последние завершённые PR

- #281 — cost-controlled runbook и CI-контракт для isolated authenticated E2E target.
- #280 — release baseline/alias/handoff sync после duplicate-review deploy.
- #279 — устойчивый assertion после SQL normalization.
- #278 — read-only exact duplicate review pack и owner decision draft.
- #277 — browser-local evidence согласия ответственного.
- #275/#276 — owner start confirmation и handoff.
- #270/#271/#272 — browser save lock, server exact duplicate guard и release sync.
- #262/#264/#266/#268 — pilot shortlist, owner decision, validation и action checklist.

## Supabase production

Контроль после PR #281:

- Profiles: 5.
- Deals: 23.
- Tasks: 98.
- Risks: 53.
- Documents: 198.
- Events: 118.
- Latest live migration: `20260714125054`.
- Preview branches: 0.
- Production schema и рабочие строки PR #281 не менял.

Edge Functions:

- `nav-invite-user`: v10 ACTIVE, `verify_jwt=true`.
- `nav-v2-deal-api`: v4 ACTIVE, `verify_jwt=true`.

## Exact duplicate review

Страница:

`operational-duplicate-review-v2.html`

Источник:

`nav_v2_get_operational_adoption_report`

Private helper:

`nav_v2_private.nav_v2_get_exact_duplicate_review_pack_unchecked_20260714(integer)`

Access boundary:

- `PUBLIC`: execute отсутствует;
- `anon`: execute отсутствует;
- `authenticated`: прямой execute отсутствует;
- `service_role`: execute разрешён;
- public wrapper доступен active owner/admin/manager;
- active SPN получает SQLSTATE `42501`.

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

Группы:

1. Прибрежная 1
   - suggested canonical: `32978be1-4652-472d-80f3-c030f69ad61a`;
   - duplicate: `a1256578-3150-4ee1-9e3a-163bd8d0a56d`.
2. Адрес не указан
   - suggested canonical: `e69a656a-54ec-4f1f-b5e6-e1f28334ba03`;
   - duplicate: `76ecc56e-36d4-47b9-8476-508f93b13cfe`.
3. Чкалова 4 кв44
   - suggested canonical: `c2dd4db4-c995-4e63-8df7-cf318558050d`;
   - duplicate: `cdce4e04-4421-4079-9c9c-03380cc59631`.
4. Первомайская, 3
   - suggested canonical: `366330f5-966c-4f97-8147-7e79e2ea408d`;
   - duplicate: `06a14681-d77d-4b3c-b65f-f887fffb3bbd`.

Earliest-created deal является только рекомендацией. Автоматический canonical selection запрещён.

Owner decision export:

`navigator_v2_exact_duplicate_owner_decision`

Допустимые resolution:

- `keep_both`;
- `merge_then_archive`;
- `archive_duplicate`;
- `cancel_duplicate`;
- `needs_manual_review`.

Даже готовый пакет содержит:

- `cleanup_authorized=false`;
- `server_mutation_available=false`;
- fresh server revalidation required;
- pre/post snapshots required;
- audit event required;
- one group at a time.

Issue #273 остаётся открытой. Owner decision JSON не предоставлен.

## Operational pilot artifact chain

Пользовательские файлы не предоставлены. Server execution заблокирован.

1. Owner decision
   - page: `operational-pilot-decision-v2.html`;
   - export: `navigator_v2_operational_pilot_owner_decision`.
2. Fresh validation
   - page: `operational-pilot-decision-validation-v2.html`;
   - export: `navigator_v2_operational_pilot_owner_decision_validation`.
3. Measurement baseline
   - export: `navigator_v2_operational_pilot_measurement_baseline`.
4. Action checklist
   - page: `operational-pilot-action-checklist-v2.html`;
   - export: `navigator_v2_operational_pilot_action_checklist`.
5. Owner start confirmation
   - page: `operational-pilot-start-confirmation-v2.html`;
   - export: `navigator_v2_operational_pilot_owner_start_confirmation`.
6. Responsible acknowledgement evidence
   - page: `operational-pilot-responsible-acknowledgement-v2.html`;
   - export: `navigator_v2_operational_pilot_responsible_acknowledgement_evidence`;
   - `acknowledgement_is_authenticated_self_action=false`;
   - `authenticated_self_acknowledgements=0`;
   - `execution_authorized=false`;
   - `pilot_started=false`.

No pilot action may be written until the six-file chain exists and responsible identity is authenticated or an explicit documented owner exception rule is approved.

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

## Isolated authenticated E2E target — PR #281

Repository files:

- `config/nav-v2-e2e-target-plan.json`;
- `docs/NAV_V2_AUTH_E2E_TARGET_RUNBOOK.md`;
- `tests/e2e/README.md`;
- `scripts/check_nav_v2_e2e_contract.py`.

Manual approval issue:

#282 — `Approve cost-controlled Supabase branch for authenticated E2E`.

Cost snapshot from Supabase Management API on 2026-07-14:

- Micro preview branch: USD 0.01344/hour;
- max planned lifetime: 6 hours;
- planned compute ceiling: USD 0.08064;
- egress/storage may add cost;
- Preview Branch usage is not protected by Supabase Spend Cap.

Repository state:

- `status=approval_required`;
- `confirmed=false`;
- `branch_creation_allowed=false`.

Hard rules:

- generic command `продолжай` is not cost approval;
- price must be checked again before creation;
- `confirm_cost` ID required;
- branch name: `navigator-e2e`;
- production data copy forbidden;
- real employee/customer data forbidden;
- only `nav-e2e*` / `[NAV E2E]*` identities;
- required roles: admin, manager, spn, lawyer, broker, viewer;
- owner only with separate opt-in;
- publishable key only;
- service-role secret forbidden;
- persistent branch forbidden;
- merge to production forbidden;
- delete immediately after evidence capture;
- hard lifetime ceiling: 6 hours;
- cleanup evidence must show branch deletion and zero technical users/profiles.

Approval phrase is recorded in issue #282.

Until explicit approval:

- do not call `confirm_cost`;
- do not create Supabase branch;
- do not create technical Auth users;
- do not create GitHub Environment secrets;
- authenticated role matrix remains BLOCKED.

## Release drift

- baseline latest live: `20260714125054`;
- canonical source: `20260714130000`;
- source blob: `cd6c0962b7f3bfcce5bc3b51fe717fbfca100a14`;
- live aliases: 18;
- canonical mappings: 18 plus existing task-contract forward mapping;
- migration alias CI: PASS;
- full static release contract: PASS.

Approved production-readonly workflow still requires owner manual dispatch with `allow_drift=false`.

## Advisors

After duplicate-review DDL:

- private helper did not leak;
- public role-gated adoption wrapper remains an expected authenticated SECURITY DEFINER warning;
- no duplicate-review-specific performance problem identified;
- shared-project warnings from legacy Nav, Leader, Parket and other systems were not automatically modified;
- leaked-password protection remains disabled until invite/recovery E2E.

## NEXT_WORK_QUEUE

- P0 MANUAL — owner/admin exports one complete `navigator_v2_exact_duplicate_owner_decision` from `operational-duplicate-review-v2.html`.
- P0 BLOCKED ON VALID DUPLICATE DECISION — fresh read-only server revalidation/cleanup preview for one group only; no mutation.
- P0 MANUAL — provide six pilot files through responsible acknowledgement evidence.
- P0 BLOCKED ON RESPONSIBLE IDENTITY — authenticated acknowledgement or explicit documented owner exception rule.
- P0 MANUAL — provide four responsibility evidence files.
- P0 MANUAL — run approved production-readonly drift workflow with `allow_drift=false`.
- P0 MANUAL COST APPROVAL — approve issue #282 with the exact approval phrase.
- P0 BLOCKED ON #282 — after approval only: recheck cost → confirm_cost → create `navigator-e2e` branch → synthetic fixtures → role matrix → evidence → delete branch.
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
- duplicate review comparison delivered in PR #278;
- isolated E2E runbook and cost-control scaffolding delivered in PR #281.

## Команда следующего запуска

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #281. Один раз проверь наличие duplicate owner decision JSON, шести pilot-файлов, четырёх responsibility evidence-файлов, approved release drift result и explicit approval в issue #282. Без duplicate decision не готовь cleanup mutation. Без точного approval #282 не вызывай confirm_cost и не создавай Supabase branch. Если #282 одобрена — повторно проверь стоимость, получи confirm_cost, создай disposable navigator-e2e branch без production data, выполни synthetic authenticated role matrix и удали branch после evidence.`
