# Navigator v2 — актуальный handoff

## 1. Дата и время

- 2026-07-11 10:33 CEST / 08:33 UTC.

## 2. Текущий main SHA

- Рабочий code baseline: `8f02088c7bb0cf78d50773b92903baf41df067ac` — squash merge PR #201.
- Документ публикуется отдельным docs-only PR #202; его merge SHA новее baseline, но не меняет код, Supabase или результаты smoke.

## 3. Последняя live Supabase migration

- `20260710184255_nav_v2_private_helper_lockdown_health`.
- Новых migrations в этом запуске нет.
- Последняя серия критичных Navigator v2 migrations присутствует и в репозитории, и live. Полная историческая migration history не является точной копией репозитория: в live есть старые и относящиеся к другим контурам migrations, а у части старых Navigator migrations отличаются исторические имена.

## 4. Версии Edge Functions

- `nav-invite-user`: v10, ACTIVE, `verify_jwt=true`; live source совпадает с репозиторием.
- `nav-v2-deal-api`: v4, ACTIVE, `verify_jwt=true`; live source совпадает с репозиторием, кроме завершающего перевода строки.

## 5. Смерженные PR этого запуска

- #201 — `Add live Navigator RPC auth smoke`.
- #202 — docs-only актуализация этого handoff.

## 6. Открытые PR

- Нет после merge #202.

## 7. Закрытые issues

- В этом запуске issues не закрывались: критерии полного authenticated browser и invite/recovery QA ещё не выполнены.

## 8. Открытые issues

- #16 — invite/recovery/password E2E.
- #159 — mobile/desktop authenticated visual smoke.
- #161 — Security Advisor и leaked-password protection.
- #164 — release checklist; автоматизированная часть усилена, authenticated browser остаётся.
- #179 — frontend consolidation и role tests.
- #199 — отдельное legacy decommission; не изменялась.

## 9. Role smoke matrix

| Роль | Фактически проверено | Результат | Доказательство / ограничение |
|---|---|---|---|
| owner | `get_my_profile`, dashboard, 21 доступная сделка, разрешённая карточка, list users, access audit | PASS на DB/API уровне; browser BLOCKED | Выполнено под `SET LOCAL ROLE authenticated` и JWT claims активного owner. Authenticated browser запрещён доступным browser workflow и нет тестовых credentials. |
| admin | Точный route/menu contract и admin page guards | Static PASS; authenticated BLOCKED | Активного live-профиля admin нет. |
| manager | Точный route/menu contract | Static PASS; authenticated BLOCKED | Активного live-профиля manager нет. |
| spn | `get_my_profile`, dashboard, список из 4 доступных сделок, разрешённая карточка, запрет чужой карточки, запрет admin API | PASS на DB/API уровне; browser BLOCKED | Использован активный СПН с максимальным числом доступных сделок; персональные данные не выводились. |
| lawyer | `get_my_profile`, dashboard, 15 доступных сделок, разрешённая карточка, запрет чужой карточки, запрет admin API | PASS на DB/API уровне; browser BLOCKED | Выполнено под `authenticated`; персональные данные не выводились. |
| broker | Точный route/menu contract | Static PASS; authenticated BLOCKED | Активного live-профиля broker нет. |
| viewer | Точный route/menu contract | Static PASS; authenticated BLOCKED | Активного live-профиля viewer нет. |

Дополнительно: role-route contract проверяет 6 меню-групп (owner/admin объединены), safe fallback, 3 admin guards и отсутствие admin routes у обычных ролей.

## 10. Auth invite/recovery result

- Static invite/recovery validator: PASS.
- Live `nav-invite-user` v10 и source sync: PASS.
- POST без JWT: PASS, HTTP 401.
- Реальные `dry_run`, access link, invite email, установка пароля, повторное использование/invalid link, recovery, повторный вход: BLOCKED — нет безопасного owner JWT, тестового почтового ящика и браузерной authenticated-сессии.
- Тестовые Auth users и production profiles в этом запуске не создавались.

## 11. Security Advisor result

- 48 WARN всего.
- 42 предупреждения относятся к рабочим browser/admin `nav_v2_*` SECURITY DEFINER RPC и остаются ожидаемыми до пофункционального authenticated E2E.
- 5 предупреждений относятся к legacy `nav_*`.
- 1 предупреждение: leaked password protection выключена.
- Основные private access helpers больше не показываются как public RPC.
- Leaked password protection не включалась до завершения invite/recovery/password E2E.
- Официальная настройка: Supabase Dashboard → Auth settings → Email provider → Prevent use of leaked passwords; функция доступна на Pro и выше.

## 12. Performance Advisor result

- 168 notices: 29 WARN и 139 INFO.
- По Navigator v2 найдено 14 INFO об unused indexes; новых v2 WARN и новых multiple permissive policies нет.
- Legacy, `leader_*` и `parket_*` notices не изменялись.

## 13. Browser RPC health

- `nav_v2_get_rpc_grant_health`: `ok=true`, 44 items, 0 problems.
- Новый live regression smoke: 9 browser-callable RPC без JWT возвращают HTTP 401 / `42501`.
- Frontend RPC coverage: `ok=true`, 38 items, 0 problems, 0 anon/public-open, 0 missing authenticated grants.

## 14. Private helper health

- `ok=true`, 6 private items, 0 missing, 0 problems.
- `nav_v2_private` недоступна `anon`; доступ `authenticated`/`service_role` соответствует health contract.
- Новый live regression smoke: 6 private access/trigger helpers отсутствуют в public PostgREST schema и возвращают HTTP 404 / `PGRST202`.

## 15. Найденные ошибки

- Постоянного live CI для anonymous PostgREST/RPC surface не было.
- Полный authenticated browser smoke невозможно выполнить без тестовых credentials; активные live-профили есть только у owner, lawyer и spn.
- Историческая migration history live шире и местами отличается именами от репозитория; критичная последняя серия Navigator v2 синхронизирована.
- Post-merge локальный Pages smoke заблокирован allowlist среды; PR workflow проверил live Pages до merge и завершился success.

## 16. Что исправлено

- Добавлен `scripts/check_nav_v2_rpc_auth.py`.
- В permanent workflow добавлены anonymous RPC и private-helper surface checks.
- Release integrity теперь требует новый smoke и его ключевые инварианты.
- `docs/STATUS.md` обновлён.

## 17. Что не удалось проверить

- Браузерный вход, console errors, refresh session и redirect loops под реальными ролями.
- Authenticated страницы на mobile/desktop viewport.
- Полный invite/recovery/password flow и email delivery.
- Роли admin, manager, broker, viewer на live данных — активных профилей нет.
- Leaked-password protection после включения — настройка не включалась.

## 18. Ручные действия владельца проекта

1. Создать или выделить безопасные тестовые аккаунты для owner/admin/manager/spn/lawyer/broker/viewer; не передавать пароли или токены в issues/репозиторий.
2. Пройти `docs/NAV_V2_MANUAL_QA.md` в чистых браузерных профилях минимум для owner, СПН и юриста.
3. Owner: выполнить `dry_run`, затем invite/access-link/recovery для одноразового тестового СПН с назначенным менеджером; после теста отключить профиль.
4. Только после успешного E2E включить leaked password protection в Auth settings и повторить invite/recovery/password smoke.

## 19. Три следующие задачи по приоритету

1. Реальный authenticated browser smoke для owner, СПН и lawyer; затем для четырёх отсутствующих ролей на тестовых профилях.
2. Полный disposable invite/recovery/password E2E и последующее включение leaked password protection.
3. Один вертикальный frontend consolidation slice по #179: единый build/version marker либо замена одного deal-card monkey patch явным hook с regression test.

## 20. Точная рекомендуемая команда для следующего запуска

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md: сначала authenticated browser smoke owner/spn/lawyer и invite/recovery на одноразовом тестовом СПН; не отмечай PASS без браузерной проверки, затем включай leaked-password protection только после успешного E2E.`
