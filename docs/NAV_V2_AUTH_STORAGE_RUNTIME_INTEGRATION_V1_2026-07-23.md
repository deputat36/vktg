# Navigator v2 — Auth storage runtime integration v1

Дата: 23 июля 2026 года.

## Результат

Detached helper `assets/js/nav-v2/auth-storage-guard-v2.js` интегрирован в общий `assets/js/nav-v2/supabase-v2.js`.

Source build повышен:

`20260711-01 → 20260723-01`

Все 35 root `*-v2.html`, использующие scoped importmap для `./supabase-v2.js`, переведены на новый build. `nav-system-check-v2.html` использует тот же cache-bust для diagnostic module.

## Исправленные пути

1. Ошибка записи remembered email больше не прерывает invalid-session cleanup.
2. Ошибка `localStorage.removeItem` при logout использует fallback overwrite значением `null`.
3. Profile cache очищается независимо от результата удаления session.
4. Optional profile-cache write не меняет результат успешного RPC.
5. Успешно принятый password-reset request не становится ошибкой из-за convenience-email write.
6. Невозможность сохранить новую session возвращает `NAV_AUTH_STORAGE_UNAVAILABLE`.
7. После session persistence failure текущая страница не использует stale session.
8. RPC не retry после refresh, если refreshed session невозможно сохранить.
9. Полное отсутствие `localStorage` или `sessionStorage` обрабатывается fail-closed.
10. Чтение remembered email при `SecurityError` возвращает пустое значение и не ломает форму входа.

## Сохранённые guards

- refresh fan-in;
- Web Locks и no-Web-Locks paths;
- replacement-session detection;
- same-user/different-user sign-in races;
- logout during pending refresh;
- transient network recovery;
- post-refresh 401/403 loop prevention.

## Build rollout

Ветка обновляет одним будущим squash merge:

- `assets/js/nav-v2/supabase-v2.js`;
- `assets/js/nav-v2/auth-storage-guard-v2.js`;
- `config/nav-v2-build.json`;
- 35 shared importmap pages;
- diagnostics cache-bust;
- contracts, source checkers и workflows;
- fixed regression tests.

Промежуточные commit’ы ветки не являются rollout. До merge и отдельного live verification:

- `runtime_rollout_completed=false`;
- `live_browser_storage_failure_verified=false`;
- `authenticated_role_e2e_completed=false`.

## Offline validation boundary

Используются:

- in-memory storage;
- synthetic `QuotaExceededError` и `SecurityError`;
- mocked fetch и Web Locks;
- `example.test` fixtures.

Не используются:

- production Supabase API;
- реальные пользователи, email, токены и business rows;
- raw Auth logs;
- Supabase preview branch;
- cost confirmation;
- SQL, migration или Edge deployment.

## Supabase impact

Изменения Supabase не требуются.

Production Auth, RLS, grants, schema, data, indexes и Edge остаются без изменений. `leader_*` не затрагивается.

## Решение

`auth_storage_write_failures_fixed_in_source_build_rollout_prepared_not_live_verified`

Это source-level hardening и подготовленный frontend build rollout, но не authenticated role E2E и не live verification реальных browser storage failures.
