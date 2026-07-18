# Navigator v2 — governed intake save boundary v1

Дата: 18 июля 2026 года. Статус: **repository-only prototype**. Этот пакет не является production migration, не создаёт публичный RPC и не выполняет DML в Supabase.

## Результат

Спроектирована следующая private mutation boundary для новой анкеты СПН:

`server recompute → exact allowlist/sanitize → owner/side-aware write plan → persistent request ledger → business rows → stored result`

В PostgreSQL 17 она исполняется как **single transaction** на shadow-таблицах harness. Прототип закрывает три архитектурных недостатка текущего legacy save:

1. persistent request ledger связывает UUID запроса с verified actor и fingerprint;
2. документы создаются только из canonical side-aware плана;
3. creator и владельцы deal/participants/documents/risks/tasks задаются из trusted server context, а не из неявного текущего actor.

Production STOP сохраняется: 12 semantic gaps legacy-проекции, authenticated role matrix, deployment approval и production migration отсутствуют.

## Production baseline

Read-only срез перед работой подтвердил:

- Supabase project healthy, PostgreSQL 17.6;
- 23 сделки, 24 участника, 198 документов, 53 риска, 98 задач, 122 события и 3 review;
- `nav_v2_private.nav_v2_prepare_intake_legacy_save_v1(jsonb,uuid,jsonb)` отсутствует;
- governed save function и persistent request ledger отсутствуют;
- текущий legacy save использует `auth.uid()`, создаёт generic seller/buyer documents и не имеет durable request replay ledger.

Live counts могут изменяться из-за реальной работы. Этот slice их не меняет и не использует для оценки сотрудников.

## Atomic ledger contract

Prototype table: `nav_v2_private.nav_v2_intake_save_requests_v1`.

| Поле | Инвариант |
|---|---|
| `client_request_id` | глобальный primary key |
| `verified_actor_id` | только trusted server identity |
| `payload_fingerprint` | bind actor, owner context и recomputed allowlisted payload |
| `state` | только `started` или `completed` |
| `result_payload` | обязателен только для `completed` |
| `replay_count` | увеличивается только при exact completed replay |

На request UUID берётся transaction-scoped advisory lock. После lock возможны только три исхода:

- записи нет: создаётся `started`, затем business rows и `completed` в той же транзакции;
- есть exact `completed`: business rows не создаются, возвращается stored result;
- actor или fingerprint отличается: запрос отклоняется.

Deferred constraint trigger запрещает commit состояния `started`. Поэтому helper claim нельзя безопасно использовать как отдельную транзакцию: final server mutation обязана компоновать claim, все business rows и completion в одном вызове.

Это особенно важно для mutation-запросов: автоматические повторы client library нельзя считать идемпотентностью бизнес-операции. Durable replay остаётся обязанностью server boundary.

## Side-aware row plan

Canonical server adapter остаётся единственным источником `accompanied_sides` и `document_candidates`.

- Допустимые стороны: `seller`, `buyer`, `object`, `deal`.
- Seller/buyer row допускается только для явно сопровождаемой стороны.
- Object/deal row допускается только при explicit matched rule.
- Generic пара seller+buyer не создаётся.
- Каждый документ получает explicit `owner_id` из `seller_spn_id`, `buyer_spn_id` или `lead_spn_id`.
- Любой неизвестный side или unresolved owner блокирует весь write plan.

PG17 fixture с `minor_seller` доказывает seller/deal rows и отсутствие buyer row.

## Owner-aware topology

Trusted context разрешает только:

- `verified_actor_id`, `verified_actor_role`;
- `lead_spn_id`, `seller_spn_id`, `buyer_spn_id`;
- `lawyer_id`, `broker_id`.

План строк:

| Строка | Источник владельца |
|---|---|
| deal `created_by` | verified actor |
| deal lead/seller/buyer/lawyer/broker | trusted owner context |
| participant | explicit creator и назначенные роли |
| document | owner role canonical document candidate |
| risk | canonical rule owner |
| task | server-resolved task preview owner |
| created event actor | verified actor |

Client owner IDs не читаются. Fixture `manager actor → другой lead SPN` сохраняет manager как creator и отдельного SPN как lead/seller participant, закрывая прежний `legacy_assigns_current_actor` только в новом governed plan.

## 12 semantic gaps остаются fail-closed

Новый ledger не делает неполную legacy-семантику допустимой. Запись блокируется при любом из правил:

`spouse`, `seller_absent`, `encumbrance`, `inheritance`, `bankruptcy_risk`, `redevelopment`, `after_registration`, `legal_problem`, `partner_agency`, `flat_ground`, `house_land`, `certificate`.

Их legal passport/work-plan preview сохраняет смысл для ревью, но business DML не начинается. Для каждого правила до production нужны точные column/row semantics, backward compatibility и rollback decision.

## PostgreSQL 17 evidence

Detached workflow поднимает чистый PostgreSQL 17 и последовательно применяет:

1. synthetic roles/private schema и public marker rows;
2. exact production sanitizer snapshot;
3. rendered canonical server adapter;
4. pure integration preview;
5. governed ledger/write plan;
6. shadow business boundary.

Проверки доказывают:

- private ACL и RLS на ledger;
- Side-aware seller-only documents;
- Owner-aware creator/lead/participant assignment;
- fail-closed unsupported rule и unresolved broker;
- exact replay с одним deal/event;
- changed actor и changed payload rejection;
- невозможность commit stranded `started`;
- zero changes в public marker rows.

### Concurrent replay

Две независимые `psql`-сессии одновременно вызывают один request UUID. Первая транзакция удерживает advisory lock две секунды. После завершения:

- business deal ровно один;
- ledger row ровно один и `completed`;
- `replay_count = 1`;
- обе сессии получают один `deal_id`, одна как first execution, другая как idempotent recovery.

### Failure recovery

Fault injection срабатывает после вставки всех shadow business rows, но до ledger completion. PostgreSQL откатывает и ledger claim, и dependent rows. Повтор с тем же UUID затем выполняется как первая успешная попытка. Stranded reusable state не остаётся.

## Phased migration storyboard

Это порядок будущего отдельного deployment slice, а не разрешение на apply.

### Phase 0 — approvals и exact schema mapping

- owner/deployment approval;
- актуальная оценка стоимости изоляции;
- exact mapping в production columns/constraints;
- решение для всех 12 gaps;
- rollback owner и maintenance window.

STOP при любом unresolved rule, owner mapping или incompatible legacy consumer.

### Phase 1 — private ledger foundation

- migration создаёт private ledger, checks, index и deferred trigger;
- schema/table/function grants остаются только server role;
- public, anon и authenticated direct access отсутствует;
- apply/rollback проверяются на disposable approved environment.

STOP при grant/RLS drift или возможности commit `started`.

### Phase 2 — pure write-plan in deployed private schema

- canonical catalog version pin;
- recompute, allowlist и sanitizer regression;
- exact owner and side mapping к реальным FK;
- zero business DML smoke.

STOP при client-controlled owner, generic side rows или catalog mismatch.

### Phase 3 — atomic governed mutation

- один private server entrypoint;
- plan, claim, deal/participants/documents/risks/tasks/event и completion в одной транзакции;
- legacy save не вызывается внутри новой boundary;
- no backfill и feature flag off by default.

STOP при partial write, non-exact replay или несовпадении stored result.

### Phase 4 — authenticated role matrix

- bearer user → verified actor → service role boundary;
- owner/admin/manager/SPN positive cases;
- lawyer/broker/client impersonation and cross-deal negative cases;
- audit evidence связывает actor, request UUID и result.

Mocked CI не считается authenticated proof.

### Phase 5 — controlled pilot

- только новые approved synthetic/pilot cases;
- без массового legacy backfill;
- наблюдение duplicate/side/owner/audit invariants;
- отдельное GO на production default.

## Rollback

Harness rollback выполняется слоями:

1. shadow executor и row tables;
2. governed completion/begin/plan helpers;
3. deferred trigger и ledger;
4. integration preview/sanitizer/mock;
5. canonical adapter/private schema и synthetic roles.

После каждого слоя public marker rows должны остаться точной копией baseline. Для будущего production rollback сначала выключается feature flag, затем удаляется governed entrypoint; completed ledger сохраняется до решения retention/audit и не удаляется автоматически вместе с business rows.

## Production STOP

Запрещено без отдельного explicit approval:

- переносить prototype в `supabase/migrations`;
- вызывать Supabase migration/apply tools;
- создавать public RPC, Edge deployment или browser service-role path;
- создавать Supabase branch/technical Auth users;
- выполнять production DML, backfill или cleanup;
- считать этот PG17 harness доказательством production Auth/RLS;
- пропускать 12 semantic gaps;
- подключать новую boundary к текущему save wizard.

**Production Supabase не изменён.**
