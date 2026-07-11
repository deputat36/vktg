# Navigator v2 — актуальный handoff

## 1. Дата

- 2026-07-11.

## 2. Текущий main и code baseline

- Runtime code baseline: `819fc58ef1587068347a7b1daa282679e684f71f` — merge PR #214.
- Этот документ публикуется отдельным docs-only PR; его merge SHA будет новее runtime baseline, но не изменит frontend, Supabase или результаты smoke.

## 3. Последняя live Supabase migration

- `20260710184255_nav_v2_private_helper_lockdown_health`.
- В текущем frontend-only запуске новых migrations, DDL и grants нет.
- Production-данные, Auth users и профили не создавались и не изменялись.

## 4. Edge Functions

- `nav-invite-user`: v10, ACTIVE, `verify_jwt=true`.
- `nav-v2-deal-api`: v4, ACTIVE, `verify_jwt=true`.
- Edge Functions в текущем запуске не деплоились.
- Свежие Edge logs содержат ожидаемые HTTP 401 для запросов без JWT; новых Navigator 5xx не обнаружено.

## 5. Смерженные PR

Текущий запуск:

- #212 — `Move document workflow into deal-card lifecycle`.
- #213 — `Move task due dates into deal-card lifecycle`.
- #214 — `Move expense labels into deal-card lifecycle`.

Предыдущий frontend consolidation цикл:

- #208 — BAZA hints lifecycle.
- #209 — SPN handoff lifecycle.
- #210 — responsibility lifecycle.
- #211 — docs-only handoff.

До этого смержены #203–#207.

## 6. Открытые PR

- Нет после merge #214.

## 7. Основные открытые issues

- #16 — invite/recovery/password E2E.
- #159 — authenticated mobile/desktop visual smoke.
- #161 — Security Advisor и leaked-password protection.
- #164 — release checklist; automated checks усилены, browser QA остаётся.
- #179 — frontend consolidation и role tests.
- #199 — отдельный legacy decommission; не изменялся.

## 8. Role smoke matrix

| Роль | Проверено | Результат | Ограничение |
|---|---|---|---|
| owner | Profile/dashboard/deals/card/admin API на DB/API уровне | PASS DB/API; browser BLOCKED | Нет безопасных browser credentials. |
| admin | Route/menu contract и admin guards | Static PASS; authenticated BLOCKED | Активного тестового профиля нет. |
| manager | Route/menu contract | Static PASS; authenticated BLOCKED | Активного тестового профиля нет. |
| spn | Profile/dashboard/deals/своя карточка/запрет чужой/admin API | PASS DB/API; browser BLOCKED | Нет безопасных browser credentials. |
| lawyer | Profile/dashboard/deals/card/admin API | PASS DB/API; browser BLOCKED | Нет безопасных browser credentials. |
| broker | Route/menu contract | Static PASS; authenticated BLOCKED | Активного тестового профиля нет. |
| viewer | Route/menu contract | Static PASS; authenticated BLOCKED | Активного тестового профиля нет. |

## 9. Auth invite/recovery

- Static invite/recovery validator: PASS.
- Live `nav-invite-user` v10 и source sync: PASS.
- POST без JWT возвращает ожидаемый HTTP 401.
- Реальные access link, invite email, установка пароля, invalid/expired/reused link, recovery и повторный вход: BLOCKED.
- Причина: нет безопасного owner JWT, disposable mailbox и authenticated browser session.
- Leaked-password protection до завершения E2E не включалась.

## 10. Security Advisor

- Основные private access helpers больше не публикуются как public RPC.
- Ожидаемо остаются предупреждения для browser/admin `nav_v2_*` SECURITY DEFINER RPC, нескольких legacy `nav_*` helpers и выключенной leaked-password protection.
- Массовый revoke не выполнялся: рабочие frontend RPC требуют authenticated execute и внутренних role checks.
- Текущий запуск не менял функции, grants или RLS.

## 11. Подтверждённые health-инварианты

- Последний `nav_v2_get_rpc_grant_health`: `ok=true`, 44 items, 0 problems.
- Frontend RPC coverage: `ok=true`, 38 items, 0 problems.
- Private helper health: `ok=true`, 6 items, 0 missing, 0 problems.
- Текущие frontend изменения не добавляли новых RPC.

## 12. Что исправлено в PR #212

- `deal-card-doc-workflow-v2.js` получает исходную карточку из общего explicit lifecycle.
- Удалены начальный повторный `nav_v2_get_deal_card`, `MutationObserver`, `requestAnimationFrame`, bootstrap и отдельный HTML entry.
- `nav_v2_update_document_assignment` не менялся.
- Единственный повторный `nav_v2_get_deal_card` сохранён только после успешной mutation для получения server-normalized роли, срока и ответственного.
- После сохранения отправляется `nav-v2:document-workflow-updated` для responsibility snapshot.
- Module budget `deal-card-v2.html`: 26 → 25.

## 13. Что исправлено в PR #213

- `deal-card-task-due-date-v2.js` получает задачи из supplied card data.
- Удалены повторный read RPC, `ensureCardData`, loading/hashchange bootstrap и отдельный HTML entry.
- Сохранён единственный write RPC `nav_v2_update_task_due_date`.
- Сохранена полная перезагрузка страницы после успешного изменения срока.
- Добавлены безопасные проверки `event.target instanceof Element`.
- Module budget: 25 → 24.

## 14. Что исправлено в PR #214

- `expense-labels-v2.js` стал чистым DOM-renderer общего lifecycle.
- Удалены `MutationObserver`, animation queue, `hashchange`, самостоятельный bootstrap и отдельный HTML entry.
- Логика русских подписей категорий, сторон и плательщиков сохранена.
- RPC и данные не затрагивались.
- Module budget: 24 → 23.

## 15. Совокупный результат consolidation

С начала explicit-hook серии:

- entry-module budget карточки снижен 30 → 23;
- устранены повторные card/profile/responsibility RPC;
- несколько самостоятельных `MutationObserver`, `hashchange`, animation queues и bootstrap-процедур удалены;
- BAZA, SPN handoff, responsibility, document workflow, task due dates и expense labels работают через общий lifecycle;
- CI проверяет supplied card data, количество допустимых RPC, отсутствие standalone entry и текущий module budget.

## 16. CI

Для PR #212, #213 и #214 успешно завершились:

- Navigator v2 static checks;
- Navigator v2 JavaScript syntax;
- Navigator v2 BAZA checks.

Browser smoke эти проверки не заменяют.

## 17. Что не удалось проверить

- Браузерный вход и console errors под реальными ролями.
- Mobile/desktop authenticated visual smoke.
- Полный invite/recovery/password flow и email delivery.
- Роли admin, manager, broker, viewer на live/test профилях.
- Leaked-password protection после включения.
- Прямой post-merge GitHub Pages fetch из текущей среды.
- Визуальное расположение объединённых enhancement-блоков и document/task controls в authenticated карточке.

## 18. Ручные действия владельца проекта

1. Выделить безопасные тестовые аккаунты; не публиковать пароли и JWT в GitHub.
2. Проверить owner, СПН и lawyer на desktop/mobile: overview и все вкладки карточки.
3. Проверить назначение ответственного и срока документа; responsibility snapshot должен обновиться после сохранения.
4. Проверить изменение срока задачи и перезагрузку карточки после успеха.
5. Пройти disposable invite/recovery/password E2E.
6. После успешного E2E включить leaked-password protection и повторить auth smoke.

## 19. Следующие задачи по приоритету

1. Authenticated browser smoke owner/spn/lawyer.
2. Disposable invite/recovery/password E2E и решение по leaked-password protection.
3. Следующий безопасный #179 slice при отсутствии credentials: перевести `readable-card-values-v2.js` на общий lifecycle. Сейчас он только нормализует подписи, но использует `MutationObserver`, `requestAnimationFrame`, `hashchange` и отдельный HTML entry; RPC и write-path отсутствуют.

## 20. Рекомендуемая команда для следующего запуска

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md: сначала попробуй authenticated browser smoke owner/spn/lawyer и disposable invite/recovery; если credentials всё ещё недоступны, переведи readable-card-values-v2.js на supplied explicit lifecycle, удали observer/hashchange/standalone entry, снизь module budget и обнови CI.`
