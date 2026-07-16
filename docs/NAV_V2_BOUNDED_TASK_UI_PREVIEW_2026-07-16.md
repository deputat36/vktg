# Navigator v2 — bounded task UI preview

Дата: 16 июля 2026 года.

Статус: repository-only UI preview. Production Supabase, routes и role menu не меняются.

## Цель

Показать будущий интерфейс coexistence legacy и contract-v2 задач до включения database transport.

Страница использует только synthetic tasks и existing pure bounded-task adapter.

## Legacy actions

Legacy-задача сохраняет старые действия:

- «В работу»;
- «Готово»;
- «Открыта».

Preview прямо помечает этот путь как исторический и без evidence-контракта.

## Bounded actions

Для активной contract-v2 задачи отображаются только governed действия:

- начать или возобновить;
- завершить с evidence;
- Waiting external;
- Deferred;
- предложить `not_applicable`;
- предложить `replaced`;
- предложить `cancelled`.

После terminal outcome proposal operational actions скрываются. Manager/owner видит confirm/reject.

Завершённая bounded-задача не имеет кнопки reopen. Новое действие должно стать новой audited задачей.

## Evidence

Complete требует `evidence_reference_id` UUID. Preview показывает поле и точные будущие RPC arguments.

Свободный evidence-текст, URL, ФИО клиента и телефоны не используются.

## Waiting external

Требует bounded reason code и review date. Задача остаётся активной.

## Deferred

Требует bounded reason code и review date. Resume очищает active outcome и возвращает SLA в server contract.

## Роли

Synthetic role selector проверяет СПН, юриста, ипотечного брокера, manager и owner.

- СПН не выполняет юридическую или финансовую задачу;
- lawyer выполняет назначенную legal task;
- broker выполняет только financial task;
- manager/owner видят operational и decision actions;
- terminal proposal ожидает решение manager/owner.

Это демонстрация role-aware DTO, а не авторизация реального пользователя.

## Transport

Страница не вызывает Supabase, RPC, fetch или таблицы. Она не использует localStorage/sessionStorage и не сохраняет synthetic state.

Каждое действие формирует только exact RPC preview с `transport_enabled=false`.

Страница не добавлена в role menu и доступна только по прямой ссылке.

## Synthetic matrix

Проверяются:

- legacy SPN actions и denial lawyer;
- legal task lawyer/SPN/broker boundary;
- broker financial task;
- active waiting task;
- terminal proposal manager decision;
- completed task without reopen;
- evidence validation;
- exact start/complete/wait/proposal/decision RPC names.

## Production gate

До включения этого UI в карточку нужны:

1. утверждённый evidence picker/source registry;
2. dual-path browser E2E;
3. один authoritative task handler;
4. deployed lite DTO v2 и mutation RPC;
5. governed Edge Function actions;
6. authenticated application E2E;
7. отдельный deploy PR и controlled pilot.

## Rollback

Удалить preview HTML, CSS, JS, fixtures, checker, workflow, документацию и module budget entry. Production data и runtime routes не затрагиваются.
