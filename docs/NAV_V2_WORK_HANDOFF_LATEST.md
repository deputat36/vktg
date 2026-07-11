# Navigator v2 — актуальный handoff

## 1. Дата и время

- 2026-07-11 17:35 CEST / 15:35 UTC.

## 2. Текущий main SHA

- Рабочий code baseline: `92bce2f62cca72cad5dad4455c966383dd52a949` — merge PR #210.
- Этот документ публикуется отдельным docs-only PR; его merge SHA будет новее baseline, но не изменит runtime-код, Supabase или результаты smoke.

## 3. Последняя live Supabase migration

- `20260710184255_nav_v2_private_helper_lockdown_health`.
- Новых migrations в текущем диалоге после Work-handoff нет.
- Критичная последняя серия Navigator v2 migrations присутствует и в репозитории, и live.

## 4. Версии Edge Functions

- `nav-invite-user`: v10, ACTIVE, `verify_jwt=true`.
- `nav-v2-deal-api`: v4, ACTIVE, `verify_jwt=true`.
- В текущем frontend-only цикле Edge Functions не изменялись и не деплоились.
- Последние Edge logs продолжают показывать ожидаемый HTTP 401 без JWT и не содержат новых 5xx Navigator.

## 5. Смерженные PR текущего цикла

- #208 — `Consolidate BAZA hints into deal-card lifecycle`.
- #209 — `Move SPN handoff into deal-card lifecycle`.
- #210 — `Consolidate responsibility lifecycle`.

До этого Work смержил #203–#207.

## 6. Открытые PR

- Нет после merge #210.

## 7. Закрытые issues

- В этом цикле issues не закрывались: authenticated browser и invite/recovery критерии ещё не выполнены.

## 8. Открытые issues

- #16 — invite/recovery/password E2E.
- #159 — mobile/desktop authenticated visual smoke.
- #161 — Security Advisor и leaked-password protection.
- #164 — release checklist; автоматизированная часть усилена, authenticated browser остаётся.
- #179 — frontend consolidation и role tests.
- #199 — отдельное legacy decommission; не изменялась.

## 9. Role smoke matrix

| Роль | Фактически проверено | Результат | Ограничение |
|---|---|---|---|
| owner | Profile/dashboard/deals/card/admin API на DB/API уровне | PASS DB/API; browser BLOCKED | Нет безопасных browser credentials. |
| admin | Route/menu contract и admin guards | Static PASS; authenticated BLOCKED | Активного тестового профиля нет. |
| manager | Route/menu contract | Static PASS; authenticated BLOCKED | Активного тестового профиля нет. |
| spn | Profile/dashboard/deals/своя карточка/запрет чужой/admin API на DB/API уровне | PASS DB/API; browser BLOCKED | Нет безопасных browser credentials. |
| lawyer | Profile/dashboard/deals/карточка/admin API на DB/API уровне | PASS DB/API; browser BLOCKED | Нет безопасных browser credentials. |
| broker | Route/menu contract | Static PASS; authenticated BLOCKED | Активного тестового профиля нет. |
| viewer | Route/menu contract | Static PASS; authenticated BLOCKED | Активного тестового профиля нет. |

## 10. Auth invite/recovery result

- Static invite/recovery validator: PASS.
- `nav-invite-user` v10 и source sync: PASS.
- POST без JWT: PASS, HTTP 401.
- Реальные access link, invite email, установка пароля, invalid/expired/reused link, recovery и повторный вход: BLOCKED.
- Причина: нет безопасного owner JWT, disposable mailbox и browser authenticated session.
- Тестовые Auth users и production profiles в текущем диалоге не создавались.

## 11. Security Advisor result

- После private-helper cleanup основные access helpers отсутствуют в public RPC warnings.
- Ожидаемо остаются рабочие browser/admin `nav_v2_*` SECURITY DEFINER RPC, пять legacy `nav_*` helper и выключенная leaked-password protection.
- Leaked-password protection не включалась до завершения invite/recovery/password E2E.
- В текущем frontend-only цикле DDL и grants не менялись.

## 12. Performance Advisor result

- Новых Navigator v2 WARN после текущих frontend-изменений нет.
- Остаются INFO об unused indexes и предупреждения legacy/generic/других подсистем.
- Индексы не удалялись без накопленной статистики и EXPLAIN.

## 13. Browser RPC health

- Последний подтверждённый `nav_v2_get_rpc_grant_health`: `ok=true`, 44 items, 0 problems.
- Frontend RPC coverage: `ok=true`, 38 items, 0 problems.
- Текущий цикл не добавлял новые frontend RPC.

## 14. Private helper health

- Последний подтверждённый результат: `ok=true`, 6 private items, 0 missing, 0 problems.
- `nav_v2_private` и RLS helpers в текущем цикле не изменялись.

## 15. Найденные ошибки и архитектурный долг

- BAZA helper повторно вызывал `nav_v2_get_my_profile` и `nav_v2_get_deal_card`, наблюдал весь DOM и имел отдельный HTML entry.
- SPN handoff повторно вызывал `nav_v2_get_deal_card`, имел MutationObserver, hashchange/bootstrap и отдельный entry.
- Два responsibility renderer независимо вызывали один `nav_v2_get_deal_responsibility_snapshot` RPC и использовали собственные observers/bootstrap.
- Responsibility-модули слушали `nav-v2:document-workflow-updated`, но document assignment workflow не отправлял это событие.
- `deal-card-doc-workflow-v2.js` всё ещё имеет собственный card RPC и MutationObserver; это следующий самостоятельный consolidation candidate.
- Полный authenticated browser smoke остаётся невозможен без безопасных credentials.

## 16. Что исправлено

### PR #208

- BAZA hints получают card/profile из основного lifecycle.
- Удалены повторные profile/card RPC, MutationObserver и самостоятельный bootstrap.
- Static JSON загружается один раз через cached promise.
- Удалён отдельный HTML entry.
- Module budget карточки снижен 29 → 28.

### PR #209

- `deal-card-spn-handoff-v2.js` получает supplied cardData.
- Удалены повторный card RPC, MutationObserver, hashchange и самостоятельный bootstrap.
- Удалён отдельный HTML entry.
- Module budget снижен 28 → 27.

### PR #210

- Два responsibility renderer объединены вокруг одного snapshot RPC.
- `deal-card-spn-responsibility-v2.js` стал чистым renderer без RPC/observer/bootstrap.
- Основной snapshot helper подключён к общему explicit lifecycle.
- Document workflow отправляет явное событие refresh после изменения назначения/срока.
- Удалён отдельный responsibility HTML entry.
- Module budget снижен 27 → 26.

Итог цикла:

- budget `deal-card-v2.html` снижен 29 → 26;
- устранены два повторных `nav_v2_get_deal_card` RPC;
- устранён повторный `nav_v2_get_my_profile` RPC;
- устранён повторный responsibility snapshot RPC;
- удалены несколько MutationObserver и самостоятельных bootstrap-процедур;
- CI-контракт требует общий lifecycle, единственный snapshot RPC и refresh event.

## 17. CI и production checks

Для PR #208, #209 и #210 успешно завершились:

- Navigator v2 static checks;
- Navigator v2 JavaScript syntax;
- Navigator v2 BAZA checks.

Supabase production runtime не изменялся. Edge smoke продолжает фиксировать 401 без JWT для обеих Navigator функций.

## 18. Что не удалось проверить

- Браузерный вход и console errors под реальными ролями.
- Mobile/desktop authenticated visual smoke.
- Полный invite/recovery/password flow и email delivery.
- Роли admin, manager, broker, viewer на live/test данных.
- Leaked-password protection после включения.
- Прямой post-merge Pages fetch из текущей среды.
- Визуальное расположение трёх объединённых enhancement-блоков в authenticated карточке — CI проверяет lifecycle и синтаксис, но не заменяет browser smoke.

## 19. Ручные действия владельца проекта

1. Выделить безопасные тестовые аккаунты для role/browser smoke; не публиковать пароли и JWT в GitHub.
2. Пройти карточку сделки под owner, СПН и lawyer: overview, переключение вкладок, BAZA hints, текст передачи СПН, responsibility-блоки.
3. Проверить изменение назначения документа: после сохранения responsibility snapshot должен обновиться без reload.
4. Пройти disposable invite/recovery/password E2E.
5. Только после успешного E2E включить leaked-password protection и повторить auth smoke.

## 20. Три следующие задачи по приоритету

1. Authenticated browser smoke owner/spn/lawyer, включая визуальную проверку объединённого deal-card lifecycle.
2. Disposable invite/recovery/password E2E; затем решение по leaked-password protection.
3. Следующий #179 slice: перевести `deal-card-doc-workflow-v2.js` на supplied cardData/explicit hook и убрать его повторный card RPC/MutationObserver, не меняя write RPC.

## 21. Точная рекомендуемая команда для следующего запуска

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md: сначала попробуй authenticated browser smoke owner/spn/lawyer и disposable invite/recovery; если безопасные credentials всё ещё недоступны, переведи deal-card-doc-workflow-v2.js на supplied cardData через общий explicit lifecycle, сохрани write RPC и refresh event, снизь module budget и обнови CI.`
