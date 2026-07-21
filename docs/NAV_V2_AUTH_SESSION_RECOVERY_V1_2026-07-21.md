# Navigator v2 — восстановление после недействительного refresh token

Дата: 21 июля 2026 года.

## Наблюдение

Read-only Supabase Auth logs за последние 24 часа показали несколько ответов `400 refresh_token_not_found` с GitHub Pages origin. Позже на основном маршруте `/vktg` обновление токена прошло успешно.

Логи не доказывают ошибку пароля или блокировку пользователя. Они показывают, что в браузере оставалась локальная сессия с уже отозванным либо отсутствующим refresh token.

## Прежнее поведение

1. RPC получал `401` или `403`.
2. Клиент отправлял refresh token.
3. Supabase возвращал `refresh_token_not_found`.
4. Ошибка пробрасывалась на страницу.
5. `nav_session_v2` оставалась в `localStorage`.
6. Следующая загрузка повторяла тот же неуспешный refresh.

Это создавало впечатление, что Навигатор завис или вход сломан, хотя требовался новый чистый вход.

## Новое поведение

- Ответ Auth сохраняет структурированные `status`, `code` и payload для классификации.
- Ошибки `refresh_token_not_found`, invalid/already-used refresh token распознаются отдельно.
- Недействительная локальная сессия удаляется однократно.
- Кэш профиля очищается вместе с сессией.
- Последний email сохраняется для формы входа.
- Пользователь получает понятное сообщение о завершении сессии.
- Повторный RPC без нового входа останавливается до сети и не создаёт refresh-loop.
- Обычный истёкший access token с действующим refresh token по-прежнему обновляется и повторяет RPC ровно один раз.

## Автоматические проверки

`tests/unit/nav-v2-auth-session-recovery.test.mjs` проверяет:

1. классификацию вариантов invalid refresh token;
2. очистку session/profile cache;
3. сохранение email;
4. отсутствие второго RPC после неуспешного refresh;
5. отсутствие token request при отсутствующем refresh token;
6. успешный refresh и один повтор RPC при действующей сессии.

Dedicated workflow:

`.github/workflows/nav-v2-auth-session-recovery-v1.yml`

## Границы

- Supabase Auth settings не менялись.
- Пользователи, пароли и токены не создавались.
- Production database, RLS, grants, migrations и Edge Functions не менялись.
- `leader_*` не затрагивался.
- Это browser-side recovery fix, а не замена authenticated E2E.
- Issue #16 и issue #159 остаются открытыми до preview-only ручной/автоматической проверки полного invite, recovery и role flow.
