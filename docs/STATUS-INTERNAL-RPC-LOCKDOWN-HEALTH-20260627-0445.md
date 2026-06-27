# Internal RPC lockdown health check

Дата: 27 июня 2026.

## Причина

После восстановления EXECUTE grants для клиентских RPC нужно отдельно контролировать обратный риск: внутренние helper-функции Навигатора не должны становиться доступными из браузера.

## Что добавлено

Добавлена owner/admin-only функция:

`public.nav_v2_get_internal_rpc_lockdown_health()`

Она проверяет 11 внутренних `nav_v2_*` функций:

- функция существует в базе;
- `authenticated` не имеет EXECUTE;
- `anon` не имеет EXECUTE;
- `PUBLIC` не имеет EXECUTE.

Функция не меняет данные и возвращает JSON-отчет.

## Интерфейс

Добавлен модуль:

`assets/js/nav-v2/nav-system-check-internal-rpc-v2.js`

Он подключен на странице:

`nav-system-check-v2.html`

После запуска системной диагностики модуль добавляет в результаты пункт `Внутренние RPC`.

Для owner/admin пункт показывает фактический результат lockdown. Для остальных ролей ожидаемый отказ owner/admin-only считается корректным состоянием.

## Доступ

- `authenticated`: может вызвать функцию, но тело допускает только активные роли `owner` и `admin`;
- `anon`: EXECUTE закрыт;
- `PUBLIC`: EXECUTE закрыт.

## Проверка

Проверено в Supabase:

- owner `deputat36@gmail.com`: `ok=true`, `missing_count=0`, `open_count=0`, `items_count=11`;
- СПН Овчинников: ожидаемый отказ `Проверка внутренних RPC доступна только owner/admin`;
- grants самой диагностической функции: `authenticated=true`, `anon=false`, `public=false`;
- `nav_v2_get_deals_list(20)` для owner работает, возвращает 20 сделок.

Проверено в GitHub:

- миграция сохранена в `supabase/migrations/20260627044500_nav_v2_internal_rpc_lockdown_health.sql`;
- модуль диагностики сохранен в `assets/js/nav-v2/nav-system-check-internal-rpc-v2.js`;
- `nav-system-check-v2.html` подключает модуль с версией `20260627-0445`.

## CRM «Лидер»

CRM «Лидер» не затрагивалась.
