# Navigator v2 — public build attestation v1

Дата: 23 июля 2026 года.

## Цель

Подтвердить, что публичная версия Navigator v2 на GitHub Pages фактически использует canonical frontend build из `config/nav-v2-build.json`.

Проверка нужна после интеграции fail-closed Auth storage runtime и build bump до `20260723-01`.

## Что проверяется

Read-only runner:

1. получает canonical build ID из `config/nav-v2-build.json`;
2. находит все repository root `*-v2.html` со shared importmap;
3. загружает соответствующие публичные HTML-страницы с cache-busting query;
4. проверяет, что canonical и legacy specifiers разрешаются в `supabase-v2.js?v=20260723-01`;
5. проверяет diagnostic cache-bust в `nav-system-check-v2.html`;
6. сравнивает SHA-256 опубликованного `supabase-v2.js` с repository source;
7. сравнивает SHA-256 опубликованного `auth-storage-guard-v2.js` с repository source;
8. сохраняет JSON report как GitHub Actions artifact.

## Граница

Проверяются только публичные HTML/JS assets.

Проверка:

- не использует email, пароли, JWT, cookies или Authorization header;
- не вызывает authenticated RPC;
- не читает сделки, профили или другие business rows;
- не создаёт technical accounts;
- не создаёт Supabase preview branch;
- не вызывает cost confirmation;
- не меняет production data, schema, indexes, Auth, RLS, grants или Edge;
- не затрагивает `leader_*`.

Supabase не изменяется. Supabase используется только для отдельной read-only drift-сверки вне этого workflow.

Эта проверка не является authenticated role E2E.

Она также не доказывает, что реальные ошибки browser storage (`QuotaExceededError`, `SecurityError`) были воспроизведены в живом браузере. Она подтверждает только публикацию соответствующего исходного runtime и build ID.

## Retry и cache behavior

Каждый public request получает уникальный `nav_build_attestation` query parameter и headers `no-cache/no-store`.

После push в `main` runner допускает ограниченное число повторов, чтобы не трактовать обычную задержку GitHub Pages как окончательный deployment failure.

## Решение до первого успешного live CI

`public_build_attestation_contract_prepared_requires_successful_live_ci`

До успешного live job:

- `live_public_build_verified=false`;
- `runtime_rollout_completed=false`;
- `authenticated_role_e2e_completed=false`;
- `live_browser_storage_failure_verified=false`.

После успешного live job допустимо обновить contract и handoff только фактическими run ID, commit SHA и build ID. Успех public attestation не снимает отдельный gate authenticated preview E2E.
