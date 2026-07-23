# Navigator v2 — live public browser runtime v1

Дата: 23 июля 2026 года.

## Цель

Подтвердить в реальном Chromium не только наличие опубликованных файлов, но и выполнение canonical browser module graph Navigator v2.

Проверка закрывает разрыв между:

- source/hash attestation GitHub Pages;
- локальными Playwright smoke tests;
- фактическим выполнением опубликованных ES modules.

## Обнаруженный дефект

Первый run `30017592617` подтвердил guest login gate и `data-nav-v2-build=20260723-01`, но browser trace показал:

- `supabase-v2.js` загружался без build query;
- `auth-storage-guard-v2.js` загружался с `?v=20260723-01`.

Причина: scoped importmap содержал короткие keys `./supabase-v2.js`, которые нормализовались относительно документа, а не каталога importing module. Поэтому относительные imports внутри `assets/js/nav-v2/` обходили ожидаемый cache-bust.

Это не было замаскировано ослаблением теста.

## Исправление

Подготовлен atomic build `20260723-02`:

- все 35 root importmap pages сохраняют короткие compatibility keys;
- дополнительно содержат normalized importmap keys `./assets/js/nav-v2/supabase-v2.js` и legacy query variants;
- все шесть mappings указывают на `supabase-v2.js?v=20260723-02`;
- `NAV_V2_BUILD_ID` обновлён до `20260723-02`;
- storage guard import обновлён до `?v=20260723-02`;
- diagnostic cache-bust обновлён до `20260723-02`;
- предыдущая успешная attestation build `20260723-01` сохранена как historical evidence;
- build `20260723-02` остаётся pending до post-merge live проверки.

Для атомарного изменения создан повторно используемый генератор:

`scripts/bump_nav_v2_shared_build.py`

Он fail-closed проверяет исходный build, минимум страниц, diagnostic marker и exact replacements.

## Browser acceptance

Для пяти ключевых страниц в desktop и mobile Chromium проверяются:

1. guest login gate;
2. exact `data-nav-v2-build`;
3. фактическая Resource Timing запись `supabase-v2.js?v=<build>`;
4. фактическая Resource Timing запись `auth-storage-guard-v2.js?v=<build>`;
5. отсутствие `pageerror` и `console.error`.

Representative pages:

- `nav-v2.html`;
- `dashboard-v2.html`;
- `deals-v2.html`;
- `queue-v2.html`;
- `admin-v2.html`.

## CI lifecycle

Pull request:

- contract/checker;
- build/importmap checker;
- local browser execution из PR checkout;
- local JSON/HTML/trace artifact.

Push в `main`, schedule и manual dispatch:

- contract/checker;
- source/hash attestation с retry;
- live browser execution GitHub Pages;
- JSON/HTML/trace artifact.

Live GitHub Pages execution намеренно не выполняется на deployment PR: ещё не опубликованный build не может совпасть с текущим Pages output. Он становится обязательным после merge/push.

## Граница

Проверка использует только публичные страницы и assets.

Она:

- не использует email, пароли, JWT, cookies или Authorization header;
- не вызывает authenticated role matrix;
- не читает сделки, профили или business rows;
- не создаёт пользователей или Supabase branch;
- не вызывает cost confirmation;
- не меняет production data, schema, indexes, Auth, RLS, grants или Edge;
- не затрагивает `leader_*`.

Проверка не воспроизводит реальные browser storage exceptions `QuotaExceededError` или `SecurityError`. Она подтверждает выполнение опубликованного hardened runtime.

## Текущее решение

`live_public_browser_runtime_contract_prepared_requires_successful_ci`

До успешных local и post-merge live jobs:

- `local_browser_runtime_verified=false`;
- `live_browser_runtime_verified=false`;
- `authenticated_role_e2e_completed=false`;
- `live_browser_storage_failure_verified=false`.

Успешная public browser проверка не снимает отдельный gate authenticated preview E2E и не разрешает production Supabase changes.
