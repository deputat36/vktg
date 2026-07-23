# Navigator v2 — Auth storage write gap v1

Дата: 23 июля 2026 года.

## Цель

Зафиксировать browser storage write failures до изменения общего Auth runtime.

Срез repository-only. Runtime, Supabase, Auth settings, RLS, grants, Edge, schema и data не меняются.

## Подтверждённые gaps

### 1. Remembered email блокирует invalid-session cleanup

Текущий порядок:

`invalid refresh → rememberEmail() → writeSession(null)`

Если запись `nav_last_email_v2` выбрасывает `QuotaExceededError`, удаление stale session и очистка profile cache не выполняются.

Severity: high.

### 2. Session remove failure блокирует logout cleanup

Если `localStorage.removeItem('nav_session_v2')` выбрасывает `SecurityError`, `clearProfileCache()` не вызывается. Logout endpoint уже мог ответить успешно, но локально остаются session и profile cache.

Severity: high.

### 3. Profile cache write ломает успешный RPC

`saveCachedProfile()` использует прямой `sessionStorage.setItem`. Ошибка optional cache write превращает успешный `nav_v2_get_my_profile` в application failure.

Severity: medium.

### 4. Remembered email ломает успешный password reset

После успешного `/auth/v1/recover` ошибка записи convenience email передаётся caller как будто reset request не выполнен.

Severity: medium.

### 5. Session persist failure не нормализован

Успешная password authentication остаётся fail-closed, если session невозможно записать, но UI получает raw browser storage error.

Severity: medium.

## Planned runtime contract

Следующий отдельный PR должен обеспечить:

- in-memory session tombstone до попытки очистки storage;
- best-effort `removeItem`, затем fallback overwrite значением `null`;
- unconditional profile-cache cleanup;
- remembered email и profile cache как optional best-effort writes;
- нормализованную ошибку невозможности сохранить новую session;
- отсутствие stale-session reuse в текущей вкладке;
- отсутствие RPC retry, если refreshed session не удалось сохранить;
- сохранение действующих cross-tab и sign-in race guards.

## Build rollout

Текущий build: `20260711-01`.

Предлагаемый build runtime hardening: `20260723-01`.

Изменения должны попасть одним атомарным commit:

1. `assets/js/nav-v2/supabase-v2.js`;
2. `config/nav-v2-build.json`;
3. все root `*-v2.html`, импортирующие `./supabase-v2.js`;
4. cache-bust модуля diagnostics в `nav-system-check-v2.html`;
5. новый regression test и contract;
6. все существующие Auth suites;
7. `scripts/check_nav_v2_build_version.py`.

Build bump не требует Supabase migration, Edge deployment или Auth settings change.

## Offline evidence boundary

Используются только:

- in-memory storage;
- synthetic `QuotaExceededError` и `SecurityError`;
- mocked fetch и Web Locks;
- `example.test` fixtures.

Не используются:

- production API;
- реальные пользователи, токены или email;
- raw logs;
- Supabase branch, cost confirmation, SQL или deployment.

## Решение

`auth_storage_write_failures_confirmed_repository_only_runtime_hardening_planned`

Это не исправление, не runtime rollout, не browser E2E и не разрешение на cloud/production изменения.
