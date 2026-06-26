# Инцидент: Овчинников не открывает карточку сделки

Дата: 25 июня 2026.

## Пользователь

- Email: `a.k.ovchinnikov@borisoglebsk.etagi.com`
- Auth UID: `98ee4523-dacb-47c3-b458-97e524f92444`
- Роль: `spn`

## Сделка

- ID: `03029d49-6e43-47b6-856e-4886f0ac320a`
- URL: `https://deputat36.github.io/vktg/deal-card-v2.html?id=03029d49-6e43-47b6-856e-4886f0ac320a`

## Симптом

При открытии карточки пользователь видел ошибку:

`Supabase не ответил за 20 сек. Проверьте соединение и повторите действие.`

## Проверка Supabase

Проверено под JWT Овчинникова:

- `nav_v2_can_view_deal(...) = true`
- карточка доступна;
- документов: `11`;
- задач: `2`;
- статус сделки: `need_info`.

Вывод: проблема не в правах и не в данных сделки.

## Что было сделано

1. Увеличен общий RPC timeout в `assets/js/nav-v2/supabase-v2.js` с 20 до 45 секунд.

2. В `assets/js/nav-v2/supabase-v2.js` добавлена дедупликация параллельных read-RPC. Одинаковые одновременные запросы к карточке объединяются в один запрос.

3. В `deal-card-v2.html` добавлен короткий актуальный importmap, чтобы дочерний импорт `./supabase-v2.js` из основного `deal-card-v2.js` резолвился в свежую версию:

`./assets/js/nav-v2/supabase-v2.js?v=20260625-1230`

4. Старый importmap на `supabase-v2.js?v=20260625-1115` удалён. Он мог принудительно возвращать карточке устаревшую RPC-обёртку.

5. Подключён и усилен recovery-модуль:

`assets/js/nav-v2/deal-card-timeout-recovery-v2.js`

6. Recovery-модуль срабатывает в двух случаях:

- появилась ошибка таймаута Supabase;
- карточка зависла на тексте `Загружаю карточку сделки...` дольше 25 секунд.

7. Recovery-модуль показывает:

- аварийную мини-карточку;
- документы;
- задачи;
- ссылку на безопасный вход;
- ссылку на диагностику карточки;
- ссылку на чистый вход.

8. Добавлен прямой безопасный вход:

`deal-card-safe-v2.html?id=03029d49-6e43-47b6-856e-4886f0ac320a`

9. Добавлена облегчённая серверная RPC:

`nav_v2_get_deal_card_lite(uuid)`

Она возвращает только базовые данные для безопасной карточки:

- сделку;
- документы;
- задачи;
- риски;
- комментарии.

Без тяжёлой истории, расходов и дополнительных блоков полного интерфейса.

10. Безопасная карточка сначала вызывает lite-RPC, а полную RPC использует только как fallback.

11. Диагностическая страница отдельно проверяет:

- профиль;
- lite-карточку;
- полную карточку.

12. Исправлен service_role bypass в связанных RPC:

- `nav_v2_get_deal_card_lite(uuid)`;
- `nav_v2_get_handoff_scores(jsonb)`;
- `nav_v2_get_deal_responsibility_snapshot(uuid)`.

Теперь служебная роль не отправляется в `nav_v2_can_view_deal(..., null)`.

13. Проведён Performance Advisor аудит Навигатора v2:

- `docs/PERFORMANCE-ADVISOR-NAV-V2-20260625.md`

Advisor не показал причины, напрямую объясняющей таймаут карточки. Релевантный долг по Навигатору v2 — несколько permissive RLS-политик на одних и тех же SELECT-действиях. Это вынесено в отдельную плановую оптимизацию, не в рамках инцидента.

14. Зафиксировано соответствие применённых Supabase-миграций и SQL-файлов GitHub:

- `docs/MIGRATION-SYNC-NAV-V2-20260626.md`

15. Проведён smoke-тест Supabase-пути Овчинникова:

- `docs/SMOKE-TEST-OVCHINNIKOV-DEAL-CARD-20260626.md`

Под пользователем Овчинникова успешно прошли профиль, список сделок, lite-карточка, полная карточка и handoff scores.

16. Добавлена минимальная диагностическая страница:

- `deal-card-diag-v2.html`

Она подключает свежий диагностический модуль `deal-card-check-v2.js?v=20260626-1135` и показывает браузерный контекст пользователя.

17. Убраны лишние стартовые вызовы `nav_v2_get_deal_card` из вспомогательных модулей карточки:

- `task-action-guard-v2.js`;
- `document-action-guard-v2.js`;
- `deal-card-doc-workflow-v2.js`.

18. Модули, которые могут обращаться к карточке при открытии нужной вкладки или alert-блока, переведены на общий timeout и свежий Supabase-клиент:

- `deal-card-task-due-date-v2.js`;
- `deal-card-recheck-alert-v2.js`.

## Текущий HTML карточки

В `deal-card-v2.html` подключено:

- `deal-card-v2.js?v=20260625-1310`
- `deal-card-timeout-recovery-v2.js?v=20260625-1140`
- importmap на `supabase-v2.js?v=20260625-1230`
- `document-action-guard-v2.js?v=20260625-1300`
- `task-action-guard-v2.js?v=20260625-1300`
- `deal-card-task-due-date-v2.js?v=20260625-1300`
- `deal-card-doc-workflow-v2.js?v=20260625-1300`
- `deal-card-recheck-alert-v2.js?v=20260625-1300`

## Текущий безопасный вход

В `deal-card-safe-v2.html` подключено:

- `deal-card-safe-v2.js?v=20260625-1310`

Сам модуль импортирует:

- `supabase-v2.js?v=20260625-1230`

## Текущая диагностика

Основная рекомендуемая диагностика:

- `deal-card-diag-v2.html`
- `deal-card-check-v2.js?v=20260626-1135`

Старая диагностическая страница остаётся доступной:

- `deal-card-check-v2.html`
- `deal-card-check-v2.js?v=20260625-1230`

## Что проверять пользователю

Основная карточка:

`https://deputat36.github.io/vktg/deal-card-v2.html?id=03029d49-6e43-47b6-856e-4886f0ac320a&cache=20260626-smoke`

Безопасная карточка:

`https://deputat36.github.io/vktg/deal-card-safe-v2.html?id=03029d49-6e43-47b6-856e-4886f0ac320a&cache=20260626-smoke`

Рекомендуемая диагностика:

`https://deputat36.github.io/vktg/deal-card-diag-v2.html?id=03029d49-6e43-47b6-856e-4886f0ac320a&cache=20260626-smoke`

Старая диагностика:

`https://deputat36.github.io/vktg/deal-card-check-v2.html?id=03029d49-6e43-47b6-856e-4886f0ac320a&cache=20260626-smoke`

## CRM «Лидер»

CRM «Лидер» не затрагивалась.
