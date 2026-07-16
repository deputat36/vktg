# Navigator v2 — bounded task server adapter

Дата: 16 июля 2026 года.

Статус: repository-only consumer contract. Production RPC не вызываются.

## Назначение

Adapter связывает frontend и governed bounded-task mutations до deployment. Он формирует точные RPC-preview и остаётся transport-free.

## Create preview

`boundedTaskCreateRpcPreview` принимает deal UUID, `client_request_id` и от 1 до 5 выбранных задач. Каждая задача проверяется по catalog:

- task type;
- owner role;
- default/max SLA;
- evidence kind;
- subject kind и UUID;
- priority.

Свободные title/description, клиентские поля и document URL не входят в payload. Для subject kind `deal` UUID должен совпадать с deal ID.

## Operation previews

Чистые функции формируют аргументы:

- start;
- completion с `evidence_reference_id`;
- `waiting_external` или `deferred` с review date;
- terminal outcome proposal;
- confirm/reject decision.

Для `replaced` обязателен другой replacement task UUID.

Каждый результат содержит `transport_enabled=false`. Adapter не вызывает RPC, fetch или таблицы.

## DTO minimization

`minimizeBoundedTaskMutationResponse` использует allowlist contract-v2 полей. Свободные title, description, client identifiers, URLs и произвольные server keys отбрасываются.

## Idempotency и separation

Каждая preview требует UUID `client_request_id`. Result metadata явно фиксирует:

- automatic backlog не создаётся;
- legacy rows не backfill-ятся;
- readiness, risk gates и deal status не меняются.

## Synthetic matrix

Проверяются valid create, empty batch, unknown field, wrong owner role, SLA above max, deal subject mismatch, start, completion, active waits, terminal replacement, decision и DTO minimization.

## Production gate

До включения transport нужны deployed migrations, authenticated role/mutation E2E, consumer migration со старых task RPC, Security Advisor review и отдельный deploy PR. Официальные routes/menu пока не меняются.

## Rollback

До deployment rollback состоит из удаления adapter, fixtures, checker, workflow и документации. Database state не затрагивается.
