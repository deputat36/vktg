# Navigator v2 — Auth malformed storage и sign-in race tests v1

Дата: 22 июля 2026 года.

## Цель

Offline проверить malformed storage и взаимодействие нового sign-in со старым pending refresh.

Runtime-код не меняется. Используются только synthetic sessions, in-memory storage и mocked fetch/Web Locks.

## Сценарий 1 — malformed storage

В `nav_session_v2` и profile cache записывается повреждённый JSON.

Ожидается:

- `getCachedUser()` возвращает `null`;
- `getCachedProfile()` возвращает `null`;
- `requireUser()` останавливает действие до network call;
- успешный sign-in очищает stale profile caches;
- malformed session заменяется валидной новой session.

## Сценарий 2 — same-user sign-in во время pending refresh

Форма:

`старый RPC 401 → old refresh pending → password sign-in 200 → old refresh 200`

Новая password session должна победить. Delayed refresh payload не имеет права перезаписать её. Исходный RPC повторяется один раз уже с новой session и завершается успешно.

## Сценарий 3 — different-user sign-in во время pending refresh

Новый пользователь входит, пока refresh старого пользователя ещё выполняется.

Ожидается:

- delayed old refresh не перезаписывает replacement user session;
- исходный RPC делает не более одного retry;
- mocked `403` для old RPC передаётся caller;
- replacement user session сохраняется.

## Сценарий 4 — failed sign-in во время pending refresh

`signIn()` очищает старую session до password request. Password request возвращает `400`, после чего delayed old refresh завершается успешно.

Ожидается:

- failed sign-in оставляет session пустой;
- stale profile cache очищен;
- delayed old refresh не воскрешает старую session;
- исходный RPC получает `NAV_AUTH_SESSION_EXPIRED` без retry.

## Test boundary

Используются:

- in-memory `localStorage` и `sessionStorage`;
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
- branch, cost confirmation, SQL или deployment.

## Regression workflow

Dedicated workflow запускает:

1. JSON contract validation;
2. source-boundary checker;
3. existing Auth session recovery suite;
4. existing concurrent refresh suite;
5. existing network/no-Web-Locks suite;
6. existing lock/timeout/post-refresh suite;
7. новый storage/sign-in race suite.

Workflow имеет только `contents: read`.

## Решение

`auth_malformed_storage_and_signin_refresh_races_covered_offline`

Этот срез не является authenticated role E2E, live multi-tab browser test, реальным browser-storage corruption test или разрешением на Auth changes.

## Не подтверждено

- поведение реальных вкладок и процессов;
- физическое повреждение browser storage;
- реальные одновременные логины пользователей;
- mobile/desktop visual state;
- authenticated role matrix;
- preview branch readiness;
- production Auth change readiness.

## Границы

Не выполнялись:

- production API calls;
- Supabase branch/cost/accounts/secrets;
- Auth/RLS/grants/Edge changes;
- migrations, DDL или DML;
- изменения `leader_*`.
