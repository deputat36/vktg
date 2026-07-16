# Navigator v2 — contract-aware deal-card-lite DTO

Дата: 16 июля 2026 года.

Статус: repository-only prototype. Production Supabase не изменяется.

## Задача

Task-action guard сейчас видит только общий `can_change_status`. Этого недостаточно, чтобы безопасно разделить 98 legacy-задач и будущие contract-v2 задачи.

Overlay сохраняет публичную сигнатуру:

`nav_v2_get_deal_card_lite(uuid)`

DTO version повышается до 2 только в repository prototype.

## Legacy rows

Для строк с `task_contract_version IS NULL`:

- сохраняется neutral title;
- `legacy_status_path=true`;
- `can_change_status` использует существующий helper;
- governed permissions равны false;
- `supports_reopen=true` отражает текущий старый UI-контракт;
- contract/evidence/outcome поля равны null.

Legacy rows не backfill-ятся и не меняются.

## Bounded rows

Для `task_contract_version=2` DTO возвращает:

- task type и catalog title;
- evidence kind;
- completion criterion;
- gate scope;
- subject kind;
- outcome code/state/reason/review date;
- `is_bounded=true`;
- `legacy_status_path=false`;
- `requires_evidence_reference=true`;
- `supports_reopen=false`.

`can_change_status` всегда false, чтобы contract-v2 row не попала в старый status RPC.

## Governed permissions

Отдельные flags:

- `can_start`;
- `can_complete`;
- `can_set_active_outcome`;
- `can_propose_terminal_outcome`;
- `can_decide_terminal_outcome`.

Operational permissions используют `nav_v2_can_operate_bounded_task`. Decision permission использует `nav_v2_can_decide_bounded_task`.

После terminal proposal operational actions выключены. Manager/owner/admin с доступом получают decision action.

## Evidence и reopen

DTO только сообщает `requires_evidence_reference=true`. Evidence picker ещё не реализован, поэтому transport включать нельзя.

`supports_reopen=false` не принимает продуктового решения о новом reopen RPC. Оно запрещает старой кнопке «Открыта» воздействовать на completed contract-v2 task.

## Privacy

Task title для legacy нейтрален. Для bounded используется catalog label, а не свободный title.

DTO не возвращает description, ФИО клиентов, телефоны, email, document URL или free-form evidence. Маскирование unit-level address сохраняется.

## PostgreSQL 17

Harness последовательно применяет:

1. synthetic Auth, роли, сделки и legacy task;
2. lite DTO compatibility setup;
3. bounded task base contract;
4. governed mutation helpers;
5. explicit lite DTO baseline;
6. contract-aware overlay;
7. role/privacy/no-mutation assertions;
8. rollback к DTO version 1.

Проверяются:

- seller SPN и legacy path;
- assigned lawyer governed actions;
- manager decision после terminal proposal;
- отсутствие old status permission у bounded rows;
- запрет operational actions во время proposal;
- отсутствие unit-level address и free-form task data;
- read-only поведение.

## Grants

Overlay не меняет grants, owner, RLS или public signature. Production transport и Edge Function не меняются.

## Оставшиеся blockers

- evidence picker/reference flow;
- утверждённая reopen semantics;
- единый authoritative frontend handler;
- contract-aware UI preview;
- dual-path browser E2E;
- governed Edge Function actions;
- authenticated application E2E.

## Production gate

Не применять до завершения UI/E2E, Security Advisor review и отдельного migration PR с минимальными grants.

## Rollback

Rollback повторно применяет explicit DTO version 1. Bounded catalog, mutation helpers и task rows сохраняются. Production rollback не требуется, так как prototype не применяется.
