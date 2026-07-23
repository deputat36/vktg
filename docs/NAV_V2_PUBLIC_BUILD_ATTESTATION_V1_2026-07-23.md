# Navigator v2 — public build attestation v1

Дата: 23 июля 2026 года.

## Цель

Подтвердить, что публичная версия Navigator v2 на GitHub Pages фактически использует canonical frontend build из `config/nav-v2-build.json`.

Проверка выполнена после интеграции fail-closed Auth storage runtime и build bump до `20260723-01`.

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

Supabase не изменяется. Supabase использован только для отдельной read-only drift-сверки вне этого workflow.

Эта проверка не является authenticated role E2E.

Она также не доказывает, что реальные ошибки browser storage (`QuotaExceededError`, `SecurityError`) были воспроизведены в живом браузере. Она подтверждает только публикацию соответствующего исходного runtime и build ID.

## Retry и cache behavior

Каждый public request получает уникальный `nav_build_attestation` query parameter и headers `no-cache/no-store`.

После push в `main` runner допускает ограниченное число повторов, чтобы не трактовать обычную задержку GitHub Pages как окончательный deployment failure.

## Live evidence

GitHub Actions run: `29989423379`.

Evidence commit: `300e3f221ae9e755a6390ccea846121e358190a2`.

Observed at: `2026-07-23T07:51:10.572762+00:00`.

Artifact:

- ID: `8556415410`;
- digest: `sha256:d68cf8bd64011c62c951b3c39dd475d0d6a4df10ea7c3a3aa47e45c74335bcbb`.

Фактический результат:

- canonical build: `20260723-01`;
- repository importmap pages: `35`;
- live matched pages: `35`;
- каждая страница содержит три ожидаемых mapping;
- diagnostic page/module: matched;
- `supabase-v2.js` live SHA-256: `febb71791013d24a0d9dc1296cb84f586848b93ba2bf603119a4bc6c247ce9a2`;
- `auth-storage-guard-v2.js` live SHA-256: `4384686ca4782603d4e307686d88f0e21922d66b92ebd59e10ff67d040d27a10`;
- оба live asset hash полностью совпали с repository source.

## Решение

`public_build_20260723_01_attested_read_only_via_github_pages_ci`

Подтверждено:

- `live_public_build_verified=true`;
- `runtime_rollout_completed=true`.

Не подтверждено и остаётся за отдельными gates:

- `authenticated_role_e2e_completed=false`;
- `live_browser_storage_failure_verified=false`.

Успех public attestation не снимает отдельный gate authenticated preview E2E и не разрешает production Auth/RLS/DDL/Edge изменения.
