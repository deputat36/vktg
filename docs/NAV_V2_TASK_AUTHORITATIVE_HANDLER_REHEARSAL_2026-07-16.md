# Navigator v2 — authoritative task handler rehearsal

Дата: 16 июля 2026 года.

Статус: repository-only integration rehearsal.

## Цель

Доказать на synthetic fixture, что один authoritative handler может полностью владеть кликом по задаче и не допустить одновременный вызов старого base listener и guard listener.

Рабочая карточка сделки, Edge Function и production Supabase не меняются.

## Candidate handler

`task-action-authoritative-rehearsal-v2.js` устанавливает один listener в capture phase.

Для целевого элемента он:

1. выполняет `preventDefault`;
2. выполняет `stopPropagation`;
3. выполняет `stopImmediatePropagation`;
4. разрешает synthetic DTO задачи;
5. собирает bounded input;
6. вызывает pure `taskActionRoutePreview` ровно один раз;
7. возвращает transport-free result.

In-flight guard не допускает повторную обработку одного task/action key.

## Competing handlers

Synthetic fixture дополнительно устанавливает два bubble listeners, имитирующих текущие guard и base handler.

Ожидаемый результат после всех кликов:

- authoritative calls: 8;
- guard calls: 0;
- base calls: 0;
- network RPC calls: 0.

## Legacy actions

Проверяется legacy completion через `nav_v2_update_task_status` preview.

Legacy coexistence сохраняется только для существующих строк без contract v2. Массовый backfill не выполняется.

## Bounded actions

Проверяются:

- start;
- completion с evidence UUID;
- waiting external;
- deferred;
- terminal proposal;
- terminal decision.

Каждое действие выбирает соответствующий governed RPC preview.

## Bounded reopen

Bounded reopen отклоняется без RPC. Завершённая bounded-задача неизменяема; новая работа должна создаваться отдельной audited-задачей.

## Browser regression

Playwright test последовательно нажимает восемь кнопок и проверяет:

- точный route для каждого действия;
- evidence UUID при completion;
- отсутствие RPC для reopen;
- итоговые counters `authoritative=8`, `base=0`, `guard=0`;
- отсутствие `/rest/v1/rpc/` запросов;
- отсутствие runtime console/page errors.

## Separation

Candidate module не импортирован в:

- `deal-card-v2.js`;
- `task-action-guard-v2.js`;
- `nav-v2-deal-api/index.ts`.

Transport, Supabase mutations, routes, menu, RLS/grants/Auth и task rows не меняются.

## Следующий этап

После зелёного rehearsal можно подготовить отдельный runtime integration PR:

- перенести authoritative logic в `task-action-guard-v2.js`;
- удалить competing task listener из `deal-card-v2.js`;
- оставить transport disabled;
- обновить legacy и dual-path browser tests;
- не подключать Edge actions до database deployment.

## Production gate

Runtime integration не означает deployment. До включения transport всё ещё нужны authenticated application E2E, database migrations/minimal grants, Edge action deployment, security advisors и controlled pilot.

## Rollback

Удалить candidate module, fixture, E2E, checker, workflow, config и этот документ. Production state останется прежним.
