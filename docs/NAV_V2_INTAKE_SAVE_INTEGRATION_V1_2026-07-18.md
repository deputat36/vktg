# Navigator v2: integration contract сохранения новой анкеты v1

Дата: 18 июля 2026 года.

Статус: repository-only prototype. Production Supabase не изменён, public RPC не добавлен, миграция и production ledger не созданы.

## Результат

Добавлен detached контракт цепочки:

`recompute → allowlist → sanitize → legacy save mock`

Pure-функция `nav_v2_private.nav_v2_prepare_intake_legacy_save_v1(jsonb, uuid, jsonb)`:

- повторно запускает canonical intake adapter;
- принимает обязательный `client_request_id` UUID отдельно от browser payload;
- принимает owner assignments только через отдельный trusted server context;
- строит новый allowlisted legacy payload вместо сохранения произвольных верхнеуровневых client keys;
- применяет точный production sanitizer snapshot;
- показывает вызов legacy save, но фиксирует `execute: false`;
- возвращает rule/document/actor parity gates и всегда оставляет production call выключенным;
- не выполняет DML и сообщает `writes_performed: false`.

## Production snapshot

Read-only проверка production на 18 июля 2026 года подтвердила:

- `nav_v2_sanitize_client_deal_json` удаляет только известные aliases ФИО, телефонов и email на верхнем уровне deal;
- public `nav_v2_save_wizard_result(jsonb)` сначала вызывает sanitizer, затем старую private-функцию;
- public wrapper не принимает `client_request_id` и не имеет persistent replay ledger;
- legacy save создаёт сделку, участников, документы, риски, расходы, задачи и событие в одном вызове;
- legacy save назначает текущего `auth.uid()` и всегда создаёт базовые документы продавца и покупателя;
- новая integration function в production отсутствует.

Harness содержит точную копию определения sanitizer из migration `20260715224500_nav_v2_minimize_client_identifiers.sql`. Source checker сравнивает определения целиком и не допускает расхождения.

## Exact allowlist

Из client deal сохраняются только четыре validated поля:

- `intake_contract_version`;
- `intake_catalog_version`;
- `intake_action`;
- `intake_draft`.

Сервер заново добавляет legal passport, work plan, request ID и legacy projection. Присланные клиентом `owner_id`, `lead_spn_id`, `sellerName`, произвольные secrets, passport/work-plan preview и другие верхнеуровневые поля не проходят в legacy payload.

Production sanitizer применяется после allowlist как второй защитный слой. Его поведение не расширено и не ослаблено.

## Request-ID и mock write boundary

Production wrapper пока не обеспечивает server idempotency. Поэтому production gate всегда содержит blocker `production_request_ledger_missing`.

Только PostgreSQL 17 harness создаёт mock ledger и mock legacy sink. Он доказывает:

- первый UUID создаёт ровно один mock business result;
- точный replay возвращает тот же result без второй business-записи;
- fingerprint связывает запрос с verified actor, trusted owner context и подготовленным legacy payload;
- тот же UUID от другого verified actor отклоняется;
- тот же UUID с другим fingerprint отклоняется;
- новый UUID создаёт отдельный result;
- catalog mismatch не доходит до mock boundary.

Mock tables и DML находятся только в `tests/sql`. Mock call открывается лишь после adapter, owner, rule, side и actor gates. Production prototype остаётся pure.

## Owner-resolution gate

Trusted server context имеет закрытый набор ключей:

- verified actor и его роль;
- lead, seller и buyer SPN;
- lawyer;
- broker.

Client owner IDs игнорируются. Task candidates остаются `preview_only`: функция может показать, какой проверенный UUID соответствует роли, но не создаёт задачи и не меняет `ready_tasks` canonical work plan.

Отдельный gate обнаруживает несовместимость legacy actor model. Если менеджер или другой verified actor создаёт карточку для иного lead SPN, текущий legacy save назначил бы самого actor — такой вызов заблокирован для будущей интеграции.

## Legacy parity

Точно проецируются 13 правил:

`minor_seller`, `minor_buyer`, `child_money`, `power_of_attorney`, `shares`, `minor_registered`, `privatisation`, `court_basis`, `matcap`, `mortgage`, `military_mortgage`, `settlements_not_agreed`, `expenses_not_agreed`.

12 правил имеют явный semantic gap и не маскируются под поддержанные:

`spouse`, `seller_absent`, `encumbrance`, `inheritance`, `bankruptcy_risk`, `redevelopment`, `after_registration`, `legal_problem`, `partner_agency`, `flat_ground`, `house_land`, `certificate`.

Дополнительный STOP действует, когда сопровождается не обе стороны: current legacy save всё равно создаёт generic seller/buyer documents. Unknown evidence сохраняется в snapshot, но старые boolean columns сворачивают unknown в false — это также явно отражено в результате.

## PostgreSQL 17

Detached CI последовательно:

1. рендерит и повторно проверяет canonical server adapter;
2. поднимает точный sanitizer snapshot и mock ledger;
3. применяет pure integration preview;
4. проверяет allowlist, request map, mortgage-only broker scope, matcap/lawyer split и server owner resolution;
5. проверяет 13/12 rule inventory, side scope и legacy actor mismatch;
6. выполняет replay, changed-payload rejection и recovery;
7. подтверждает неизменность marker rows;
8. удаляет integration overlay, mock ledger, sanitizer snapshot и base adapter.

## Production STOP

`production_call.allowed` намеренно всегда равен `false`. До production-интеграции обязательны:

1. persistent request ledger с unique scope по verified actor и UUID;
2. новая governed save boundary, которая возвращает прежний result при exact replay;
3. server-side assignment, не подменяющий lead SPN текущим actor;
4. side-aware создание документов вместо generic seller/buyer rows;
5. полная server semantics для 12 unsupported rules;
6. disposable Supabase branch rehearsal, authenticated role matrix и rollback;
7. отдельное owner/deployment approval.

Наличие зелёного mock harness не является разрешением на deploy.

## Rollback

Repository rollback удаляет contract JSON, pure SQL, tests, checkers, workflow и этот документ. Data rollback не нужен: production writes отсутствуют.

PG17 rollback удаляет четыре integration functions, mock function/tables и sanitizer snapshot, проверяет отсутствие overlay, затем запускает уже существующий rollback base adapter.
