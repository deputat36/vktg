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

## Доступ

- `authenticated`: может вызвать функцию, но тело допускает только активные роли `owner` и `admin`;
- `anon`: EXECUTE закрыт;
- `PUBLIC`: EXECUTE закрыт.

## Проверка

Проверено в Supabase:

- owner `deputat36@gmail.com`: `ok=true`, `missing_count=0`, `open_count=0`, `items_count=11`;
- СПН Овчинников: ожидаемый отказ `Проверка внутренних RPC доступна только owner/admin`;
- grants самой диагностической функции: `authenticated=true`, `anon=false`, `public=false`.

## CRM «Лидер»

CRM «Лидер» не затрагивалась.
