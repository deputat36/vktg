# Navigator v2 browser E2E

Этот контур предназначен только для отдельного Supabase development branch. Production-проект `ofewxuqfjhamgerwzull` намеренно блокируется preflight-скриптом.

Полный cost-controlled lifecycle описан в `docs/NAV_V2_AUTH_E2E_TARGET_RUNBOOK.md`. Машиночитаемый план находится в `config/nav-v2-e2e-target-plan.json`.

## Стоимость и подтверждение

Перед созданием ветки обязательно заново проверить цену Supabase Branching и получить отдельное подтверждение пользователя через cost-confirmation flow.

Снимок на 2026-07-14:

- USD 0.01344 в час для Micro preview branch;
- плановый максимум жизни ветки — 6 часов;
- плановый compute ceiling — USD 0.08064;
- egress и storage могут добавить расходы;
- generic-команда «продолжай» не считается подтверждением стоимости.

Без отдельного подтверждения ветку не создавать.

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

Не добавлять service-role key, JWT, refresh token, database password или access link. Workflow подменяет `config/supabase.js` только во временном runner workspace и не выводит значения secrets.

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

После теста development branch удаляется целиком сразу после сохранения evidence. Максимальное плановое время жизни — 6 часов.

Cleanup считается завершённым только когда:

- ветка отсутствует в Supabase branch list;
- технических Auth users с префиксом `nav-e2e` не осталось;
- активных профилей `[NAV E2E]` не осталось;
- branch ID, creation/deletion timestamps и workflow evidence записаны в связанные issues.

Если branch нужно сохранить вопреки плану, это требует нового явного решения и новой оценки стоимости. Не оставлять ветку активной по умолчанию.

Production cleanup не требуется: preflight запрещает authenticated E2E против production, а public smoke ничего не записывает.
