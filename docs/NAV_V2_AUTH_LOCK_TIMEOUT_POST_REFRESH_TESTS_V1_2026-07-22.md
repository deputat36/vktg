# Navigator v2 — Auth lock, timeout и post-refresh tests v1

Дата: 22 июля 2026 года.

## Цель

Offline проверить ещё четыре пограничных сценария восстановления сессии:

1. Web Locks API существует, но acquisition отклоняется;
2. refresh завершается timeout-путём `AbortError`;
3. повторный RPC после успешного refresh снова возвращает `401`;
4. повторный RPC после успешного refresh возвращает `403`.

Runtime-код не меняется. Срез фиксирует фактическое fail-closed поведение текущего `assets/js/nav-v2/supabase-v2.js`.

## Основание

Текущий runtime использует:

- module-level `refreshRequest` для объединения параллельных refresh;
- Web Lock `navigator-v2-auth-refresh`, когда API доступен;
- `safeFetch()` с `AbortController` и отдельным timeout `12000` мс для refresh;
- только один повтор исходного RPC после `401/403`.

После первого refresh код не должен начинать второй refresh-цикл, даже если повторный RPC снова вернул `401` или `403`.

## Test boundary

Новый файл:

`tests/unit/nav-v2-auth-lock-timeout-post-refresh.test.mjs`

Используются только:

- in-memory `localStorage` и `sessionStorage`;
- mocked `globalThis.fetch`;
- mocked `navigator.locks.request`;
- synthetic access/refresh tokens;
- reserved email fixtures `example.test`.

Не используются:

- production Supabase URL или project ref;
- Supabase Management API;
- реальные аккаунты;
- технические аккаунты;
- реальные токены;
- реальные данные сотрудников или клиентов;
- сырые Auth/API logs;
- сеть.

## Сценарий 1 — Web Locks acquisition failure

Форма:

`RPC 401 → lock request rejected → token endpoint 0 → RPC retry 0`

Ожидается:

- ошибка lock acquisition передаётся caller;
- token endpoint не вызывается;
- session не удаляется;
- refresh token не удаляется;
- profile cache не очищается;
- rejected `refreshRequest` очищается в `finally`;
- следующая попытка после восстановления lock API выполняет новый refresh и один RPC retry.

Это fail-closed поведение. Runtime не пытается обходить неисправный Web Locks API параллельным refresh, который мог бы создать cross-tab refresh storm.

## Сценарий 2 — refresh timeout

Mocked token endpoint выбрасывает ошибку с `name=AbortError`.

Форма:

`RPC 401 → refresh AbortError → RPC retry 0`

Ожидается:

- пользователь получает штатное сообщение `Supabase не ответил за 12 сек`;
- session и refresh token сохраняются;
- profile cache сохраняется;
- RPC не повторяется без успешного refresh;
- rejected `refreshRequest` очищается;
- следующая попытка после восстановления mocked network успешно refresh и retry.

Тест проверяет timeout-ветку `safeFetch`, но не моделирует реальное прохождение 12 секунд и не подтверждает поведение конкретного браузера при физическом отключении сети.

## Сценарии 3–4 — повторный 401/403 после refresh

Формы:

`RPC 401 → refresh 200 → RPC retry 401`

`RPC 401 → refresh 200 → RPC retry 403`

Ожидается:

- token endpoint вызывается ровно один раз;
- исходный RPC повторяется ровно один раз;
- второй `401/403` передаётся caller;
- второй refresh не запускается;
- replacement session сохраняется для дальнейшего действия пользователя или диагностики.

Такое поведение предотвращает бесконечный refresh/retry loop при revoked session, серверной ACL-ошибке или временно несогласованных разрешениях.

## Regression boundary

Dedicated workflow запускает:

1. JSON contract validation;
2. Python source-boundary checker;
3. существующий Auth session recovery suite;
4. существующий concurrent refresh suite;
5. существующий network/no-Web-Locks suite;
6. новый lock/timeout/post-refresh suite.

Workflow имеет только `contents: read` и не выполняет SQL, Supabase CLI, curl, deployment или cloud actions.

## Решение

`auth_lock_timeout_and_post_refresh_failures_covered_offline`

Подтверждено только поведение одного JavaScript module instance с mocked fetch и mocked Web Locks API.

Этот срез не является authenticated role E2E, live multi-tab browser audit, реальным network outage test или разрешением на preview/production Auth changes.

## Не подтверждено

- реальная ошибка browser LockManager;
- зависание очереди Web Locks без reject;
- несколько browser tabs/processes при lock failure;
- физическое отключение и восстановление сети;
- mobile/desktop visual state;
- authenticated role matrix;
- preview branch readiness;
- production Auth change readiness.

## Границы

Не выполнялись:

- production API calls;
- создание Supabase branch;
- cost confirmation;
- создание accounts/secrets;
- Auth/RLS/grants/Edge changes;
- migrations, DDL или DML;
- изменения `leader_*`.
