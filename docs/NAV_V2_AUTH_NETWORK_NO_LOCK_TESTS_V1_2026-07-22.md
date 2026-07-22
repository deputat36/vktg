# Navigator v2 — Auth network/no-lock tests v1

Дата: 22 июля 2026 года.

## Цель

Проверить offline два сценария, которые не были отдельно зафиксированы предыдущими Auth recovery suites:

1. параллельное восстановление сессии без Web Locks;
2. временный сетевой сбой refresh с последующим успешным повтором.

Этот срез не меняет runtime-код и не является live browser E2E.

## Основание

В `assets/js/nav-v2/supabase-v2.js` используются два уровня защиты:

- module-level promise `refreshRequest` объединяет параллельные refresh внутри одного JavaScript context;
- `navigator.locks` дополнительно сериализует refresh между browser contexts, когда API доступен.

Если Web Locks отсутствует, `withAuthRefreshLock()` вызывает callback напрямую. Поэтому module-level `refreshRequest` должен продолжать предотвращать refresh storm внутри текущего context.

При временной сетевой ошибке refresh не должен классифицироваться как invalid refresh token. Сохранённая session и profile cache должны остаться доступными для следующей попытки.

## Test boundary

Новый файл:

`tests/unit/nav-v2-auth-network-no-lock.test.mjs`

Используются только:

- in-memory `localStorage` и `sessionStorage`;
- mocked `globalThis.fetch`;
- `navigator` без свойства `locks`;
- synthetic access/refresh tokens;
- reserved email fixtures `example.test`.

Не используются:

- production Supabase URL или project ref;
- Supabase Management API;
- реальные аккаунты;
- реальные токены;
- реальные пользовательские данные;
- raw Auth/API logs;
- сеть.

## Сценарий 1 — parallel refresh без Web Locks

Два разных RPC одновременно получают `401` со старым access token.

Ожидается:

- initial RPC calls: `2`;
- token refresh calls: `1`;
- RPC retries: `2`;
- оба RPC завершаются успешно;
- replacement session сохраняется.

Форма:

`2 RPC 401 → 1 shared refresh 200 → 2 retry 200`

Это подтверждает, что module-level `refreshRequest` предотвращает refresh storm даже без Web Locks внутри одного module instance.

## Сценарий 2 — временный сетевой сбой refresh

Два RPC одновременно получают `401`, а общий refresh завершается mocked network error.

Во время сбоя ожидается:

- initial RPC calls: `2`;
- refresh calls: `1`;
- RPC retries: `0`;
- оба caller получают сетевую ошибку;
- session не удаляется;
- refresh token не удаляется;
- profile cache не очищается.

После восстановления mocked network следующий RPC должен:

1. получить `401` со старым access token;
2. начать новый refresh;
3. сохранить новую session;
4. повторить RPC один раз;
5. завершиться успешно.

Это подтверждает, что rejected shared refresh promise очищается в `finally` и не блокирует последующее восстановление.

## Regression boundary

Dedicated workflow запускает:

1. JSON contract validation;
2. Python source-boundary checker;
3. существующий `nav-v2-auth-session-recovery.test.mjs`;
4. существующий `nav-v2-auth-concurrent-refresh.test.mjs`;
5. новый `nav-v2-auth-network-no-lock.test.mjs`.

Workflow имеет только `contents: read` и не выполняет SQL, Supabase CLI, curl, deployment или cloud actions.

## Решение

`auth_refresh_no_lock_and_transient_network_recovery_covered_offline`

Подтверждено только поведение одного JavaScript module instance с mocked network и отсутствующим Web Locks API.

Не подтверждено:

- реальное взаимодействие нескольких tabs/processes без Web Locks;
- реальный network outage и browser reconnect;
- browser lock acquisition failure при наличии API;
- mobile/desktop visual state;
- authenticated role matrix;
- preview branch readiness;
- production Auth change readiness.

## Границы

Не выполнялись:

- production API calls;
- Supabase branch или account creation;
- cost confirmation;
- Auth/RLS/grants/Edge changes;
- migrations, DDL или DML;
- изменения `leader_*`.
