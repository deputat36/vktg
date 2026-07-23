# Navigator v2 — Auth logout и storage failure tests v1

Дата: 23 июля 2026 года.

## Цель

Offline проверить logout во время pending refresh, transport failure logout endpoint и fail-closed чтение browser storage.

Runtime-код не меняется. Используются только synthetic sessions, in-memory storage, mocked fetch и mocked Web Locks.

## Сценарий 1 — logout во время pending refresh

Форма:

`RPC 401 → old refresh pending → logout 204 → session cleared → old refresh 200`

Ожидается:

- logout использует текущий access token;
- session и profile cache очищаются до завершения delayed refresh;
- delayed old refresh не записывает новую session;
- исходный RPC не повторяется;
- caller получает `NAV_AUTH_SESSION_EXPIRED`;
- после race session остаётся пустой;
- может сохраниться только email для чистого повторного входа.

## Сценарий 2 — transport failure logout endpoint

Mocked logout endpoint выбрасывает network error.

Ожидается:

- transport error передаётся caller;
- `finally` всё равно очищает local session;
- profile cache также очищается;
- следующий защищённый RPC останавливается до network call.

## Сценарий 3 — logout без session

При отсутствии session logout не должен обращаться к сети, но должен удалить stale profile cache entries, оставшиеся после прерванного browser flow.

## Сценарий 4 — browser storage read denied

Mocked `localStorage.getItem` и `sessionStorage.getItem` выбрасывают `SecurityError`.

Ожидается:

- `getCachedUser()` возвращает `null`;
- `getCachedProfile()` возвращает `null`;
- `requireUser()` останавливает действие до сети;
- storage denial не интерпретируется как authenticated session.

Тест не заявляет поддержку storage write denial. Проверяется только фактическое fail-closed поведение read paths текущего runtime.

## Test boundary

Используются:

- in-memory `localStorage` и `sessionStorage`;
- synthetic storage `SecurityError`;
- mocked `fetch`;
- mocked Web Locks;
- synthetic access/refresh tokens;
- reserved email fixtures `example.test`.

Не используются:

- production Supabase URL/project ref;
- реальные аккаунты или токены;
- реальные данные сотрудников/клиентов;
- raw Auth/API logs;
- сеть;
- Supabase branch, cost confirmation, SQL или deployment.

## Regression workflow

Dedicated workflow запускает:

1. JSON contract validation;
2. source-boundary checker;
3. existing Auth session recovery suite;
4. concurrent refresh suite;
5. network/no-Web-Locks suite;
6. lock/timeout/post-refresh suite;
7. storage/sign-in race suite;
8. новый logout/storage failure suite.

Workflow имеет только `contents: read`.

## Решение

`auth_logout_and_storage_read_failures_covered_offline`

Этот срез не является authenticated role E2E, live multi-tab browser test, реальным logout endpoint failure test, реальным browser storage denial test или разрешением на Auth changes.

## Не подтверждено

- поведение реальных вкладок и процессов;
- физический logout outage;
- реальные browser privacy/storage restrictions;
- storage write denial;
- mobile/desktop visual state;
- authenticated role matrix;
- preview branch readiness;
- production Auth change readiness.

## Границы

Production Supabase не изменён.

Не выполнялись:

- production API calls;
- Supabase branch/cost/accounts/secrets;
- Auth/RLS/grants/Edge changes;
- migrations, DDL или DML;
- изменения `leader_*`.
