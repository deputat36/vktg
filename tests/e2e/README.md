# Navigator v2 browser E2E

Этот контур предназначен только для отдельного Supabase development branch. Production-проект `ofewxuqfjhamgerwzull` намеренно блокируется preflight-скриптом.

## Что проверяется

- гостевые auth-gates на desktop и mobile;
- реальный вход для каждой роли;
- dashboard, список сделок и первая разрешённая синтетическая карточка;
- меню роли и отсутствие owner/admin-разделов у обычных ролей;
- admin/access/diagnostics для owner/admin;
- кабинет юриста, мастер СПН и брокерская очередь;
- запрет СПН на чужую синтетическую сделку;
- отсутствие mutation controls у viewer;
- HTTP-ошибки, бесконечные loaders, `console.error` и `pageerror`;
- HTML/JSON report, trace, screenshot и video при ошибке.

## GitHub Environment

Создать environment `navigator-e2e`.

Variables:

- `NAV_E2E_SUPABASE_URL` — URL development branch;
- `NAV_E2E_SPN_FORBIDDEN_DEAL_ID` — UUID синтетической сделки другого СПН.

Secrets:

- `NAV_E2E_SUPABASE_PUBLISHABLE_KEY`;
- пары `NAV_E2E_<ROLE>_EMAIL` / `NAV_E2E_<ROLE>_PASSWORD` для `ADMIN`, `MANAGER`, `SPN`, `LAWYER`, `BROKER`, `VIEWER`;
- `NAV_E2E_OWNER_EMAIL` / `NAV_E2E_OWNER_PASSWORD` — только для disposable owner и только при ручном `include_owner=true`.

Не добавлять service-role key, JWT, refresh token или access link. Workflow подменяет `config/supabase.js` только во временном runner workspace и не выводит значения secrets.

## Тестовые данные

1. Создать Auth users только в development branch. Технические email должны начинаться с `nav-e2e`, ФИО — с `[NAV E2E]`.
2. Создать активные профили шести обязательных ролей. СПН обязательно назначить синтетического manager.
3. Создать минимум две синтетические сделки без реальных клиентов: одну доступную тестовому СПН и одну чужую для negative access.
4. Добавить синтетические документ, задачу и риск, чтобы карточка показывала read/mutation controls.
5. Не копировать production-клиентов, документы, телефоны, email сотрудников или реальные адреса.

## Запуск

В GitHub Actions открыть `Navigator v2 authenticated browser E2E` и выполнить `Run workflow`. `public` не требует credentials; `authenticated` требует полностью подготовленный environment.

Локально public smoke:

```bash
npm ci
npx playwright install chromium
npm run test:e2e:public
```

## Cleanup

После теста development branch удаляется целиком. Если branch нужно сохранить, сначала удалить все сделки и дочерние записи с техническим маркером `[NAV E2E]`, затем деактивировать профили `nav-e2e` и удалить соответствующих Auth users через Supabase Dashboard. Cleanup считается завершённым только когда запрос по префиксу `nav-e2e` возвращает ноль Auth users и ноль активных профилей.

Production cleanup не требуется: preflight запрещает authenticated E2E против production, а public smoke ничего не записывает.
