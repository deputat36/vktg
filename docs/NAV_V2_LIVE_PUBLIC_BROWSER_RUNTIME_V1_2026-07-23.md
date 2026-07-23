# Navigator v2 — live public browser runtime v1

Дата: 23 июля 2026 года.

## Результат

Опубликованный GitHub Pages runtime Navigator v2 подтверждён в desktop и mobile Chromium.

Решение:

`live_public_browser_runtime_20260723_02_verified_read_only`

Подтверждено:

- `local_browser_runtime_verified=true`;
- `live_browser_runtime_verified=true`;
- exact `data-nav-v2-build=20260723-02`;
- exact versioned `supabase-v2.js?v=20260723-02`;
- exact versioned `auth-storage-guard-v2.js?v=20260723-02`;
- guest login gate;
- `pageerror` отсутствуют;
- `console.error` отсутствуют;
- 10/10 browser cases passed без flaky и unexpected результатов.

Не подтверждено:

- `authenticated_role_e2e_completed=false`;
- `live_browser_storage_failure_verified=false`.

## Обнаруженный и исправленный дефект

Первый run `30017592617` показал:

- build marker выполнялся;
- storage guard загружался с query version;
- shared `supabase-v2.js` загружался без query version.

Причина: короткие scoped importmap keys не совпадали с нормализованным relative module URL.

Atomic build `20260723-02` добавил normalized mappings на всех 35 страницах. Тест не был ослаблен и теперь требует фактические Resource Timing entries для двух exact versioned assets.

## Test harness correction

Первый post-merge run `30022851155` успешно подтвердил source/hash, но Chromium получил 404: абсолютные test paths сбрасывали project subpath `/vktg/`.

Исправление `41f9056d1021fd9a84ac3adf140b0877599e699b` разрешает страницы внутри configured base directory. Один и тот же тест работает для:

- local root `http://127.0.0.1:4173/`;
- GitHub Pages subpath `https://deputat36.github.io/vktg/`.

Это был defect test harness, а не опубликованного runtime.

## Live evidence

Run: `30023416439`.

Evidence commit: `41f9056d1021fd9a84ac3adf140b0877599e699b`.

Artifact:

- ID `8570253047`;
- digest `sha256:24e71a7e91f394fbb70813cc5ae395dc5c7eb2fcee18aca019d57bf088c4cb5e`.

Browser statistics:

- desktop cases `5`;
- mobile cases `5`;
- expected `10`;
- unexpected `0`;
- flaky `0`.

Representative pages:

- `nav-v2.html`;
- `dashboard-v2.html`;
- `deals-v2.html`;
- `queue-v2.html`;
- `admin-v2.html`.

## CI lifecycle

Pull request:

- repository contract/checkers;
- local browser execution.

Push, schedule и отдельный post-merge evidence PR:

- source/hash attestation;
- live browser execution GitHub Pages;
- JSON/HTML/trace artifact.

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

Успешная public browser проверка не снимает отдельный gate authenticated preview E2E и не разрешает production Supabase changes.
