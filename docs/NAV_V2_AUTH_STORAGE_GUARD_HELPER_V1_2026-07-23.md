# Navigator v2 — Auth storage guard helper v1

Дата: 23 июля 2026 года.

## Цель

Подготовить безопасный reusable helper для browser storage failures до интеграции в общий `supabase-v2.js`.

Helper остаётся detached repository-only source. Он не импортируется действующим runtime и не меняет текущий build.

## Возможности helper

- fail-closed чтение session;
- нормализованная ошибка `NAV_AUTH_STORAGE_UNAVAILABLE`;
- in-memory session tombstone;
- best-effort удаление session;
- fallback overwrite значением `null`;
- обязательная попытка очистки profile cache;
- продолжение profile cleanup после ошибки одного ключа;
- remembered email как optional convenience write;
- profile cache как optional write;
- блокировка stale-session reads после session persistence failure;
- восстановление чтения после последующей успешной записи session.

## Подтверждённые offline сценарии

1. malformed session JSON → `null`;
2. storage read denial → `null`;
3. remembered email write failure → `false`, без исключения;
4. profile cache write failure → `false`, без исключения;
5. session remove failure → fallback `null`, profiles очищаются;
6. remove и fallback overwrite одновременно недоступны → current-page tombstone блокирует stale session;
7. один profile key не удаляется → остальные продолжают очищаться;
8. session persistence failure → нормализованная ошибка и blocked reads;
9. последующая успешная запись session снимает block.

## Что ещё не выполнено

- helper не импортирован `assets/js/nav-v2/supabase-v2.js`;
- прямые storage writes действующего runtime ещё не заменены;
- gap-evidence test продолжает фиксировать текущее проблемное поведение;
- build остаётся `20260711-01`;
- importmaps и diagnostics cache-bust не менялись;
- live browser E2E не выполнялся.

## Следующая интеграция

Отдельный atomic PR должен:

1. импортировать helper в `supabase-v2.js`;
2. заменить direct session/email/profile storage paths;
3. сохранить refresh/sign-in/logout race guards;
4. превратить gap-evidence assertions в fixed regression;
5. поднять build до `20260723-01`;
6. обновить все scoped importmaps и diagnostics cache-bust;
7. прогнать все Auth suites и static build checker.

Supabase migration, Edge deployment и Auth settings change для этой интеграции не требуются.

## Решение

`auth_storage_write_hardening_helper_prepared_offline_not_integrated`

Это не runtime fix, не rollout и не разрешение на cloud/production изменения.
