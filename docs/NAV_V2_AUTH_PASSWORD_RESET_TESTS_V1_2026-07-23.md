# Navigator v2 — Auth password reset tests v1

Дата: 23 июля 2026 года.

## Цель

Offline проверить пользовательский путь восстановления пароля без отправки реального письма и без обращения к production Supabase.

Runtime-код не меняется. Используются только in-memory storage, mocked `window.location`, mocked `fetch` и synthetic fixtures `example.test`.

## Сценарий 1 — пустой email

Пустая или состоящая из пробелов строка должна:

- завершиться локальной ошибкой;
- не вызывать network;
- не менять ранее сохранённый email для входа.

## Сценарий 2 — успешный запрос

Входной email очищается от пробелов.

Проверяются:

- endpoint `/auth/v1/recover`;
- метод `POST`;
- JSON body с очищенным email;
- redirect на `nav-accept-invite-v2.html` относительно текущей страницы;
- email запоминается только после ответа `200`;
- активная session не заменяется и не удаляется;
- active profile cache сохраняется.

## Сценарий 3 — transport failure

При mocked network error:

- caller получает сообщение подключения к Supabase;
- текущая session сохраняется;
- profile cache сохраняется;
- ранее сохранённый login email не заменяется неуспешным reset address.

## Сценарий 4 — timeout

Mocked `AbortError` должен вернуть штатное сообщение:

`Supabase не ответил за 12 сек`

Session и remembered email остаются без изменений.

## Сценарий 5 — rate limit/server rejection

Mocked response:

- status `429`;
- code `over_request_rate_limit`;
- message `Too many reset requests`.

Ошибка передаётся caller. Session, profile cache и ранее сохранённый login email не меняются.

## Test boundary

Используются:

- in-memory `localStorage` и `sessionStorage`;
- mocked `window.location.href`;
- mocked `fetch`;
- synthetic access/refresh tokens;
- reserved email fixtures `example.test`.

Не используются:

- production Supabase URL/project ref;
- реальные аккаунты или токены;
- реальные email-адреса сотрудников;
- отправка реального password-reset письма;
- переход по реальной recovery link;
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
8. logout/storage failure suite;
9. новый password-reset suite.

Workflow имеет только `contents: read`.

## Решение

`auth_password_reset_paths_covered_offline`

Этот срез не является authenticated role E2E, реальной отправкой password-reset email, проверкой реальной recovery link, реальным rate-limit test или разрешением на Auth changes.

## Не подтверждено

- доставка письма конкретным email-провайдером;
- срок действия и одноразовость реальной recovery link;
- экран установки нового пароля в реальном браузере;
- реальное Supabase rate limiting;
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
