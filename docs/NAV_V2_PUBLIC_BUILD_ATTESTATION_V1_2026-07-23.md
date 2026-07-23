# Navigator v2 — public build attestation v1

Дата: 23 июля 2026 года.

## Результат

Публичная версия Navigator v2 на GitHub Pages подтверждена на canonical build:

`20260723-02`

Решение:

`public_build_20260723_02_attested_read_only_via_github_pages_ci`

Подтверждено:

- `live_public_build_verified=true`;
- `runtime_rollout_completed=true`;
- 35/35 public importmap pages matched;
- diagnostic page/module matched;
- live shared runtime SHA-256 совпал с repository source;
- live storage guard SHA-256 совпал с repository source.

Не подтверждено и остаётся за отдельными gates:

- `authenticated_role_e2e_completed=false`;
- `live_browser_storage_failure_verified=false`.

## Почему понадобился build 20260723-02

Browser trace показал, что короткие scoped importmap keys не применяли query cache-bust к относительному import `./supabase-v2.js`.

Исправление:

- все 35 root pages содержат compatibility и normalized importmap keys;
- шесть mappings на каждой странице ведут на `supabase-v2.js?v=20260723-02`;
- `NAV_V2_BUILD_ID`, storage guard query и diagnostic cache-bust обновлены атомарно;
- повторно используемый generator: `scripts/bump_nav_v2_shared_build.py`.

## Live evidence

Run: `30023416439`.

Evidence commit: `41f9056d1021fd9a84ac3adf140b0877599e699b`.

Observed at: `2026-07-23T16:04:44.867398+00:00`.

Artifact:

- ID `8570253047`;
- digest `sha256:24e71a7e91f394fbb70813cc5ae395dc5c7eb2fcee18aca019d57bf088c4cb5e`.

Assets:

- `supabase-v2.js` — SHA-256 `f2713e29d1a84e27a4a290af99695211c5c2d4c9ed6df21c36fecf2a9b23ecd8`, 18395 bytes;
- `auth-storage-guard-v2.js` — SHA-256 `4384686ca4782603d4e307686d88f0e21922d66b92ebd59e10ff67d040d27a10`, 5881 bytes.

## Historical evidence build 20260723-01

Предыдущее evidence сохранено в `previous_successful_attestation`:

- run `29989423379`;
- commit `300e3f221ae9e755a6390ccea846121e358190a2`;
- 35/35 pages;
- artifact `8556415410`.

## Граница

Проверяются только публичные HTML/JS assets.

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
