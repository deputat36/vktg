# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 2026-07-14.
- Текущий `main`: `9b34bf2d28f68f84a7f7005d3972263df5ebe6c6` — merge PR #286.
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

- #286 — live Advisor whitelist attestation: 48/48 Navigator v2 SECURITY DEFINER warnings.
- #285 — connector-equivalent release drift, Edge и Auth evidence record.
- #284 — query correlation для ожидаемых no-JWT Edge probes.
- #283/#281 — cost-controlled runbook для isolated authenticated E2E.
- #280/#278/#279 — exact duplicate review pack, assertion fix и release sync.
- #277 — browser-local evidence согласия ответственного.
- #275/#276 — owner start confirmation и handoff.
- #270/#271/#272 — browser save lock, server exact duplicate guard и release sync.
- #262/#264/#266/#268 — pilot shortlist, owner decision, validation и action checklist.

## Supabase production

Актуальный read-only snapshot:

- Profiles: 5.
- Deals: 23.
- Tasks: 98.
- Risks: 53.
- Documents: 198.
- Events: 118.
- Latest live migration: `20260714125054`.
- Preview branches: 0.

Edge Functions:

- `nav-invite-user`: v10 ACTIVE, `verify_jwt=true`, bundle `14020dac054cadf3ca86d19313cf2bc2b012aca9d634e76e8dd0ffde11b05a5f`.
- `nav-v2-deal-api`: v4 ACTIVE, `verify_jwt=true`, bundle `b64e3fdbc2fa22ccb4998e69232e4351308f1d9b0a7c3c2bec7093186d3e4095`.

## Release drift и live verification

Документ:

`docs/NAV_V2_LIVE_VERIFICATION_20260714.md`

Проверено через GitHub connector и Supabase:

- latest migration совпадает с baseline: `20260714125054`;
- live → canonical alias: `20260714125054` → `20260714130000`;
- canonical Git blob: `cd6c0962b7f3bfcce5bc3b51fe717fbfca100a14`;
- Edge versions, status, `verify_jwt`, live bundle hashes и source blobs совпадают с baseline;
- production counts не изменены;
- preview branches отсутствуют.

Это connector-equivalent evidence. Оно не заменяет ручной workflow `navigator-production-readonly` с `allow_drift=false`.

## Edge no-JWT observability

PR #284 добавил к production smoke:

- `nav_v2_probe=nav-v2-edge-auth-smoke`;
- уникальный `probe_id`;
- безопасные diagnostic headers без credentials.

Production Edge logs подтвердили для обеих Navigator функций:

- marker виден в URL;
- status остаётся `401`;
- JWT-защита не ослаблена;
- ожидаемый CI smoke теперь отличим от посторонних unauthorized requests.

Dedicated workflow `Navigator v2 Edge auth observability`: PASS.

## Security Advisor whitelist

Файлы:

- `config/nav-v2-advisor-scope.json`;
- `config/nav-v2-advisor-live-attestation.json`;
- `scripts/check_nav_v2_advisor_scope.py`;
- `scripts/check_nav_v2_advisor_live_attestation.py`.

Live PostgreSQL attestation:

- expected Navigator v2 warnings: 48;
- observed Navigator v2 warnings: 48;
- missing: 0;
- unexpected: 0;
- SECURITY INVOKER exceptions: `nav_v2_update_document_status`, `nav_v2_get_frontend_coverage_health`.

Decision:

- callable `public.nav_v2_*` RPC являются intentional API с server-side gates;
- массовый revoke запрещён;
- unrelated shared-project warnings не считаются исправленными;
- leaked-password protection остаётся `blocked` issues #16/#159 до isolated invite/recovery/role E2E.

Issue #161: whitelist технически завершён; держать открытой только для leaked-password follow-up либо закрыть после переноса остатка в #16/#159.

## Auth evidence

Production Auth logs показали:

1. `invalid_credentials`;
2. успешный `/recover`;
3. последующий успешный password login;
4. успешные refresh-token sessions.

Это полезное production evidence, но не authenticated E2E PASS, потому что не было disposable fixtures, полной role matrix и negative mutation coverage.

## Exact duplicate review

Страница:

`operational-duplicate-review-v2.html`

Источник:

`nav_v2_get_operational_adoption_report`

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

1. Прибрежная 1: canonical suggestion `32978be1-4652-472d-80f3-c030f69ad61a`, duplicate `a1256578-3150-4ee1-9e3a-163bd8d0a56d`.
2. Адрес не указан: canonical suggestion `e69a656a-54ec-4f1f-b5e6-e1f28334ba03`, duplicate `76ecc56e-36d4-47b9-8476-508f93b13cfe`.
3. Чкалова 4 кв44: canonical suggestion `c2dd4db4-c995-4e63-8df7-cf318558050d`, duplicate `cdce4e04-4421-4079-9c9c-03380cc59631`.
4. Первомайская, 3: canonical suggestion `366330f5-966c-4f97-8147-7e79e2ea408d`, duplicate `06a14681-d77d-4b3c-b65f-f887fffb3bbd`.

Owner decision export:

`navigator_v2_exact_duplicate_owner_decision`

Issue #273 остаётся открытой. Без owner decision не готовить cleanup mutation.

## Operational pilot artifact chain

Пользовательские файлы не предоставлены. Server execution заблокирован.

1. `navigator_v2_operational_pilot_owner_decision`.
2. `navigator_v2_operational_pilot_owner_decision_validation`.
3. `navigator_v2_operational_pilot_measurement_baseline`.
4. `navigator_v2_operational_pilot_action_checklist`.
5. `navigator_v2_operational_pilot_owner_start_confirmation`.
6. `navigator_v2_operational_pilot_responsible_acknowledgement_evidence`.

Responsible acknowledgement остаётся внешним evidence:

- `acknowledgement_is_authenticated_self_action=false`;
- `authenticated_self_acknowledgements=0`;
- `execution_authorized=false`;
- `pilot_started=false`.

Нельзя выполнять pilot mutation, пока шесть файлов не существуют и identity ответственного не подтверждена authenticated self-action либо отдельным явно утверждённым owner exception rule.

## Responsibility correction workflow

Заблокирован до четырёх файлов:

1. confirmation JSON;
2. validation report с `point_operation_ready=true`;
3. fresh server preview с fingerprint;
4. bundle manifest с `bundle_ready=true`.

Без полного bundle не изменять `seller_spn_id`, `buyer_spn_id`, `manager_id`.

## Isolated authenticated E2E target

Manual approval issue:

#282 — `Approve cost-controlled Supabase branch for authenticated E2E`.

Последний cost snapshot:

- Micro preview branch: USD 0.01344/hour;
- max planned lifetime: 6 hours;
- planned compute ceiling: USD 0.08064;
- egress/storage may add cost;
- preview branch usage is not protected by Spend Cap.

Repository state:

- `status=approval_required`;
- `confirmed=false`;
- `branch_creation_allowed=false`.

Hard rules:

- generic `продолжай` не является cost approval;
- перед созданием повторно вызвать `get_cost`;
- затем получить `confirm_cost` ID;
- branch name: `navigator-e2e`;
- production data и реальные пользователи запрещены;
- service-role secret запрещён;
- required roles: admin, manager, spn, lawyer, broker, viewer;
- delete branch immediately after evidence;
- hard lifetime ceiling: 6 hours.

До explicit approval не вызывать `confirm_cost` и не создавать branch/Auth users/secrets.

## NEXT_WORK_QUEUE

- P0 MANUAL — owner/admin экспортирует `navigator_v2_exact_duplicate_owner_decision`.
- P0 BLOCKED — после valid duplicate decision создать fresh read-only cleanup preview одной группы; без mutation.
- P0 MANUAL — предоставить шесть pilot-файлов.
- P0 BLOCKED — подтвердить identity ответственного authenticated self-action или explicit owner exception.
- P0 MANUAL — предоставить четыре responsibility evidence-файла.
- P0 MANUAL — запустить production-readonly drift workflow с `allow_drift=false`.
- P0 MANUAL COST APPROVAL — подтвердить issue #282 точной формулировкой.
- P0 BLOCKED ON #282 — после approval: recheck cost → confirm_cost → create disposable branch → synthetic role matrix → evidence → delete branch.
- P1 BLOCKED ON AUTH EVIDENCE — audited synthetic task-contract mutation.
- P1 BLOCKED ON AUTH EVIDENCE — включение leaked-password protection.

## DO NOT REPEAT без новой причины

- общий технический аудит;
- public guest/no-JWT/private-helper smoke;
- механическое сокращение deal-card;
- risk lifecycle #218;
- readiness/task taxonomy/broker/viewer/lawyer previews;
- owner/admin IA;
- adoption report/comparison;
- manager proposal/remediation;
- responsibility draft/validation/preview/bundle;
- pilot shortlist/decision/validation/checklist/start/acknowledgement scaffolding;
- browser save lock и exact duplicate trigger;
- duplicate comparison pack;
- isolated E2E runbook/cost scaffold;
- Edge probe observability;
- Advisor whitelist attestation.

## Команда следующего запуска

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #286. Один раз проверь duplicate owner decision, шесть pilot-файлов, четыре responsibility evidence-файла, manual drift workflow result и explicit approval в #282. Без owner evidence не готовь mutations. Без точного cost approval не вызывай confirm_cost и не создавай Supabase branch. Если gates пусты — выбирай только read-only/CI/observability улучшения, не повторяя уже завершённые audit slices.`
