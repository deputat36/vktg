# Navigator v2 — public build attestation v1

Дата: 23 июля 2026 года.

## Цель

Подтвердить, что публичная версия Navigator v2 на GitHub Pages фактически использует canonical frontend build из `config/nav-v2-build.json`.

Проверяются только публичные HTML/JS assets.

## Текущий canonical build

`20260723-02`

Build подготовлен после browser-trace обнаружения, что короткие scoped importmap keys не применяли query cache-bust к относительным imports `./supabase-v2.js`.

Исправление добавляет normalized importmap keys на всех 35 страницах и требует фактическую browser Resource Timing запись:

`supabase-v2.js?v=20260723-02`

## Что проверяет read-only runner

1. canonical build ID;
2. все repository root `*-v2.html` со shared importmap;
3. короткие и normalized importmap mappings;
4. diagnostic cache-bust;
5. SHA-256 опубликованного `supabase-v2.js`;
6. SHA-256 опубликованного `auth-storage-guard-v2.js`;
7. JSON report как GitHub Actions artifact.

Каждый public request получает cache-busting query и `no-cache/no-store` headers. После push в `main` допускается ограниченный retry из-за задержки GitHub Pages deployment.

## Historical evidence build 20260723-01

Предыдущая успешная attestation сохранена в `previous_successful_attestation`:

- run `29989423379`;
- evidence commit `300e3f221ae9e755a6390ccea846121e358190a2`;
- matched pages `35/35`;
- artifact `8556415410`;
- artifact digest `sha256:d68cf8bd64011c62c951b3c39dd475d0d6a4df10ea7c3a3aa47e45c74335bcbb`.

Это historical evidence и не подтверждает новый build `20260723-02`.

## Текущее решение

`public_build_attestation_contract_prepared_requires_successful_live_ci`

До post-merge live job:

- `live_public_build_verified=false`;
- `runtime_rollout_completed=false`;
- `authenticated_role_e2e_completed=false`;
- `live_browser_storage_failure_verified=false`.

## Граница

Проверка:

- не использует email, пароли, JWT, cookies или Authorization header;
- не вызывает authenticated RPC;
- не читает сделки, профили или business rows;
- не создаёт technical accounts или Supabase branch;
- не вызывает cost confirmation;
- не меняет production data, schema, indexes, Auth, RLS, grants или Edge;
- не затрагивает `leader_*`.

Supabase не изменяется.

Эта проверка не является authenticated role E2E. Она также не доказывает, что реальные ошибки browser storage `QuotaExceededError` или `SecurityError` были воспроизведены в живом браузере.
