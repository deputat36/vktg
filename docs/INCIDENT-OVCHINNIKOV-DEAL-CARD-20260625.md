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
2. В `deal-card-v2.html` добавлен и усилен importmap, чтобы дочерний импорт `./supabase-v2.js` принудительно резолвился в свежую версию:

`./assets/js/nav-v2/supabase-v2.js?v=20260625-1115`

Importmap дополнительно покрывает варианты:

- `./assets/js/nav-v2/supabase-v2.js`
- `/vktg/assets/js/nav-v2/supabase-v2.js`
- `https://deputat36.github.io/vktg/assets/js/nav-v2/supabase-v2.js`

3. Подключён и усилен recovery-модуль:

`assets/js/nav-v2/deal-card-timeout-recovery-v2.js`

4. Recovery-модуль теперь срабатывает в двух случаях:

- появилась ошибка таймаута Supabase;
- карточка зависла на тексте `Загружаю карточку сделки...` дольше 25 секунд.

5. Recovery-модуль показывает:

- аварийную мини-карточку;
- документы;
- задачи;
- ссылку на безопасный вход;
- ссылку на диагностику карточки;
- ссылку на чистый вход.

6. Добавлен прямой безопасный вход:

`deal-card-safe-v2.html?id=03029d49-6e43-47b6-856e-4886f0ac320a`

7. Добавлена облегчённая серверная RPC:

`nav_v2_get_deal_card_lite(uuid)`

Она возвращает только базовые данные для безопасной карточки:

- сделку;
- документы;
- задачи;
- риски;
- комментарии.

Без тяжёлой истории, расходов и дополнительных блоков полного интерфейса.

8. Безопасная карточка теперь сначала вызывает lite-RPC, а полную RPC использует только как fallback.

9. Диагностическая страница теперь отдельно проверяет:

- профиль;
- lite-карточку;
- полную карточку.

10. Исправлен service_role bypass в связанных RPC:

- `nav_v2_get_deal_card_lite(uuid)`;
- `nav_v2_get_handoff_scores(jsonb)`;
- `nav_v2_get_deal_responsibility_snapshot(uuid)`.

Теперь служебная роль не отправляется в `nav_v2_can_view_deal(..., null)`.

11. Проведён Performance Advisor аудит Навигатора v2:

- `docs/PERFORMANCE-ADVISOR-NAV-V2-20260625.md`

Advisor не показал причины, напрямую объясняющей таймаут карточки. Релевантный долг по Навигатору v2 — несколько permissive RLS-политик на одних и тех же SELECT-действиях. Это вынесено в отдельную плановую оптимизацию, не в рамках инцидента.

12. Зафиксировано соответствие применённых Supabase-миграций и SQL-файлов GitHub:

- `docs/MIGRATION-SYNC-NAV-V2-20260626.md`

## Текущий HTML карточки

В `deal-card-v2.html` подключено:

- `deal-card-v2.js?v=20260625-1230`
- `deal-card-timeout-recovery-v2.js?v=20260625-1140`
- importmap на `supabase-v2.js?v=20260625-1115`

## Текущий безопасный вход

В `deal-card-safe-v2.html` подключено:

- `deal-card-safe-v2.js?v=20260625-1150`

## Текущая диагностика

В `deal-card-check-v2.html` подключено:

- `deal-card-check-v2.js?v=20260625-1155`

## Что проверять пользователю

Основная карточка:

`https://deputat36.github.io/vktg/deal-card-v2.html?id=03029d49-6e43-47b6-856e-4886f0ac320a&cache=20260625-1215`

Безопасная карточка:

`https://deputat36.github.io/vktg/deal-card-safe-v2.html?id=03029d49-6e43-47b6-856e-4886f0ac320a&cache=20260625-1215`

Диагностика:

`https://deputat36.github.io/vktg/deal-card-check-v2.html?id=03029d49-6e43-47b6-856e-4886f0ac320a&cache=20260625-1215`

## CRM «Лидер»

CRM «Лидер» не затрагивалась.
