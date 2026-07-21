# Navigator v2 — многовкладочное восстановление Auth session v2

Дата: 21 июля 2026 года.

## Наблюдение

Browser-side fix из PR #442 корректно очищает недействительную локальную сессию после `refresh_token_not_found` и останавливает повторный network loop.

Оставался отдельный race-сценарий:

1. две вкладки используют один refresh token;
2. обе получают `401` по RPC;
3. обе пытаются обновить сессию;
4. одна вкладка сохраняет новую пару access/refresh token;
5. вторая получает `refresh_token_already_used` для старого token;
6. без дополнительной проверки вторая вкладка могла удалить уже новую сессию первой вкладки.

Также старый refresh response не должен восстанавливать сессию, если пользователь успел выйти в другой вкладке.

## Новое поведение

- В браузерах с Web Locks API refresh выполняется под общим exclusive lock `navigator-v2-auth-refresh`.
- После получения lock вкладка повторно читает `nav_session_v2`.
- Если access token уже изменился, token endpoint не вызывается: RPC повторяется с новой сессией.
- Перед записью успешного refresh response проверяется, что сохранённая session всё ещё совпадает с attempted session.
- Более новая session другой вкладки не перезаписывается старым refresh response.
- Ошибка `refresh_token_already_used` для старого token не очищает более новую session.
- Если session удалена во время refresh, успешный старый response не восстанавливает её.
- В среде без Web Locks остаются compare-before-write и compare-before-invalidate guards, поэтому более новая session не уничтожается старым ответом.

## Автоматические сценарии

`tests/unit/nav-v2-auth-session-recovery.test.mjs` проверяет:

1. invalid refresh token очищает только текущую attempted session;
2. обычный valid refresh выполняет ровно один повтор RPC;
3. отсутствие refresh token не вызывает token endpoint;
4. другая вкладка обновила session до получения refresh lock;
5. другая вкладка обновила session, пока старый token endpoint вернул `already_used`;
6. выход в другой вкладке во время успешного refresh не приводит к восстановлению session;
7. Web Lock имеет единое имя и exclusive mode;
8. profile cache очищается вместе с действительно недействительной session;
9. email сохраняется для чистого повторного входа.

## Границы

- Реальные Auth users, passwords, refresh tokens и production accounts не использовались.
- Supabase Auth settings не менялись.
- Database, migrations, RLS, grants и Edge Functions не менялись.
- Production `leader_*` не затрагивался.
- Это repository/browser hardening, а не authenticated role matrix.
- Issues #16, #159 и #282 остаются gated до отдельного disposable preview environment и явного cost/Auth approval.
