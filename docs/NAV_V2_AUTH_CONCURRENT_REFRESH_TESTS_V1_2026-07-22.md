# Navigator v2 — Concurrent Auth refresh tests v1

Дата: 22 июля 2026 года.

## Цель

Проверить offline, что два параллельных RPC с истёкшим access token используют один общий refresh request, а не создают refresh storm.

Этот срез не меняет runtime-код и не является live multi-tab browser E2E.

## Основание

В `assets/js/nav-v2/supabase-v2.js` используется module-level promise:

`refreshRequest`

Первый RPC начинает refresh. Остальные RPC в том же JavaScript context должны получить уже выполняющийся promise.

Дополнительно refresh защищён exclusive Web Lock:

`navigator-v2-auth-refresh`

Existing recovery suite проверяла одиночный RPC, replacement session, already-used race и logout race. Отдельного сценария двух одновременно упавших разных RPC не было.

## Новый test

`tests/unit/nav-v2-auth-concurrent-refresh.test.mjs`

Используются:

- in-memory `localStorage` и `sessionStorage`;
- mocked `globalThis.fetch`;
- mocked `navigator.locks`;
- synthetic sessions;
- reserved email fixtures `example.test`;
- два разных non-deduped RPC.

Production Supabase URL, project ref, реальные accounts, tokens и user data не используются.

## Сценарий 1 — valid shared refresh

Два RPC одновременно получают `401` со старой session.

Ожидается:

- initial RPC calls: `2`;
- token refresh calls: `1`;
- exclusive lock acquisitions: `1`;
- RPC retries с новой session: `2`;
- оба результата успешны;
- replacement session сохранена.

Это подтверждает fan-in:

`2 expired RPC → 1 refresh → 2 retry`

## Сценарий 2 — invalid shared refresh

Два RPC одновременно получают `401`, а общий refresh возвращает `refresh_token_not_found`.

Ожидается:

- initial RPC calls: `2`;
- token refresh calls: `1`;
- exclusive lock acquisitions: `1`;
- RPC retries: `0`;
- stale session очищена;
- оба caller получают `NAV_AUTH_SESSION_EXPIRED`.

Это подтверждает отсутствие refresh storm и повторных RPC после invalid refresh.

## Regression boundary

Dedicated workflow запускает:

1. JSON contract validation;
2. Python source-boundary checker;
3. существующий `nav-v2-auth-session-recovery.test.mjs`;
4. новый `nav-v2-auth-concurrent-refresh.test.mjs`.

Existing одиночные и race scenarios должны продолжать проходить.

## Решение

`concurrent_auth_refresh_fan_in_covered_by_offline_unit_tests`

Подтверждено только offline поведение одного module instance с mocked Web Lock и mocked network.

Не подтверждено:

- реальное взаимодействие нескольких browser tabs/processes;
- поведение браузеров без Web Locks;
- mobile/desktop visual state;
- authenticated role matrix;
- network interruption во время real refresh;
- preview branch readiness;
- production Auth change readiness.

## Границы

Не выполняются:

- network requests;
- Supabase Management API calls из CI;
- production API calls;
- создание accounts или branches;
- cost confirmation;
- Auth/RLS/grants/Edge changes;
- migrations или DDL/DML;
- изменения `leader_*`.
