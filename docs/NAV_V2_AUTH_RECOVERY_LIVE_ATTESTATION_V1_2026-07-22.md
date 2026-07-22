# Navigator v2 — Live Auth recovery attestation v1

Дата: 22 июля 2026 года.

## Цель

Зафиксировать обезличенное read-only подтверждение того, что действующий production runtime восстанавливает истёкшую access-сессию по ожидаемой схеме:

`RPC 401 → refresh 200 → повторный RPC 200`

Это repository evidence. Оно не изменяет Supabase и не является authenticated role E2E.

## Источники

Использованы только read-only Management API результаты за последние 24 часа:

- Auth logs;
- API logs;
- PostgreSQL logs.

Сырые логи в репозиторий не добавляются.

Не сохранены:

- идентификаторы пользователей;
- ФИО;
- email;
- IP-адреса;
- user-agent;
- request ID;
- токены;
- заголовки;
- payload;
- business rows;
- query text;
- исходные event messages.

## Наблюдение

В свежем log window обнаружены две независимые последовательности одного типа:

1. RPC со старым access token получает `401`.
2. Запрос refresh token завершается `200`.
3. Повторный RPC того же семейства завершается `200`.

Обезличенные интервалы UTC:

- `2026-07-22T04:49:30Z–04:49:34Z`;
- `2026-07-22T11:54:42Z–11:54:49Z`.

В возвращённом свежем Auth sample не обнаружен `refresh_token_not_found`.

Это означает только отсутствие такого события в ограниченном sample за последние 24 часа. Это не доказывает, что ошибка не может повториться в будущем.

## Соответствие коду

Действующий helper:

`assets/js/nav-v2/auth-session-recovery-v2.js`

распознаёт:

- `refresh_token_not_found`;
- invalid refresh token;
- already-used refresh token;
- expired/invalid access JWT;
- replacement session из другой вкладки;
- logout во время refresh.

Unit suite:

`tests/unit/nav-v2-auth-session-recovery.test.mjs`

уже проверяет:

- invalid refresh очищает старую session и не запускает второй RPC retry;
- valid refresh выполняет retry ровно один раз;
- новая session другой вкладки не перезаписывается;
- already-used race сохраняет победившую новую session;
- logout во время refresh не воскрешает удалённую session.

Live log sequence совпадает с формой valid-refresh unit test:

`401 → refresh 200 → retry 200`.

Management logs не раскрывают внутреннее состояние браузера, localStorage, Web Lock и визуальное состояние страницы. Поэтому attestation не заменяет browser test.

## Unauthenticated RPC boundary

Отдельный auth-smoke без пользовательской session подтвердил ожидаемую границу:

- callable RPC, требующий authenticated context, возвращает `401`, а PostgreSQL фиксирует `permission denied`;
- internal/private helper, который не должен быть Data API RPC, возвращает `404`;
- неожиданных успешных unauthenticated вызовов не обнаружено.

`401` и `404` в этом smoke являются ожидаемыми security outcomes, а не runtime regression.

## Решение

`live_auth_refresh_recovery_observed_redacted_not_authenticated_role_e2e`

Подтверждено:

- production refresh recovery shape наблюдалась дважды;
- свежий sample не содержит нового invalid-refresh loop;
- unauthenticated RPC boundary работает ожидаемо;
- существующие unit tests соответствуют наблюдаемому сценарию.

Не подтверждено:

- role matrix для admin/manager/spn/lawyer/broker/viewer;
- desktop/mobile visual E2E;
- поведение всех страниц и mutation controls;
- multi-tab race в реальном браузере;
- готовность включить leaked-password protection;
- готовность создать preview branch;
- production Auth change approval.

## Активные gates

Остаются обязательными:

- отдельное решение `authenticated_e2e_only`;
- fresh preview branch cost;
- отдельное cost confirmation;
- disposable branch не более 6 часов;
- synthetic technical accounts;
- authenticated desktop/mobile role matrix;
- cleanup evidence;
- отдельное решение по leaked-password protection.

Generic команды «продолжай», «работай по плану» и «действуй автономно» не являются такими approvals.

## Границы изменений

Не выполнялись:

- production DDL/DML;
- Auth settings changes;
- RLS или grants changes;
- Edge deployment;
- Supabase branch creation;
- cost confirmation;
- создание real или technical accounts;
- изменение `leader_*`.
