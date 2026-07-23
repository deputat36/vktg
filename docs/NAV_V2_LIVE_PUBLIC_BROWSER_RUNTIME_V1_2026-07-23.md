# Navigator v2 — live public browser runtime v1

Дата: 23 июля 2026 года.

## Цель

Закрыть разрыв между двумя уже существующими доказательствами:

- source/hash attestation подтверждает, что GitHub Pages публикует ожидаемые HTML и JavaScript-файлы;
- локальный Playwright smoke подтверждает, что browser runtime работает в repository checkout.

Новая проверка должна подтвердить, что опубликованный GitHub Pages runtime действительно выполняется в Chromium и выставляет canonical build marker.

## Что проверяется

Для пяти ключевых публичных страниц в desktop и mobile Chromium:

1. документ отвечает без HTTP-ошибки;
2. отображается guest login gate;
3. `document.documentElement.dataset.navV2Build` равен canonical build из `config/nav-v2-build.json`;
4. browser Resource Timing содержит exact `supabase-v2.js?v=<build>`;
5. browser Resource Timing содержит exact `auth-storage-guard-v2.js?v=<build>`;
6. отсутствуют `pageerror` и `console.error`.

Representative pages:

- `nav-v2.html`;
- `dashboard-v2.html`;
- `deals-v2.html`;
- `queue-v2.html`;
- `admin-v2.html`.

Перед live browser запуском обязательно выполняется существующая source/hash attestation. Это не позволяет browser smoke принять старый GitHub Pages deployment за актуальный runtime.

## Режимы CI

Pull request:

- contract/checker;
- local browser execution из PR checkout;
- source/hash attestation текущего GitHub Pages;
- live browser execution текущего GitHub Pages.

Push в `main`, schedule и manual dispatch:

- contract/checker;
- source/hash attestation с ограниченным retry;
- live browser execution GitHub Pages;
- JSON/HTML/trace evidence как Actions artifact.

Ежедневный запуск назначен после scheduled source/hash attestation.

## Граница

Проверка использует только публичные страницы и публичные assets.

Она:

- не использует email, пароли, JWT, cookies или Authorization header;
- не вызывает authenticated role matrix;
- не читает сделки, профили или другие business rows;
- не создаёт пользователей;
- не создаёт Supabase preview branch;
- не вызывает cost confirmation;
- не меняет production data, schema, indexes, Auth, RLS, grants или Edge;
- не затрагивает `leader_*`.

Проверка не воспроизводит реальные browser storage exceptions `QuotaExceededError` или `SecurityError`. Она подтверждает только выполнение опубликованного hardened runtime.

## Решение до первого успешного CI

`live_public_browser_runtime_contract_prepared_requires_successful_ci`

До успешного local и live browser jobs:

- `local_browser_runtime_verified=false`;
- `live_browser_runtime_verified=false`;
- `authenticated_role_e2e_completed=false`;
- `live_browser_storage_failure_verified=false`.

Успешная public browser проверка не снимает отдельный gate authenticated preview E2E и не разрешает production Supabase changes.
