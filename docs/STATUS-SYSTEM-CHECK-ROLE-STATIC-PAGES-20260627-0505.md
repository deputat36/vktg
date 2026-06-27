# System check: role-aware static pages

Дата: 27 июня 2026.

## Причина

Системная диагностика проверяла один общий набор HTML-страниц. Для owner/admin, юриста и брокера этого недостаточно: у ролей есть дополнительные рабочие экраны, которые должны проверяться явно.

## Что изменено

В `assets/js/nav-v2/nav-system-check-v2.js` версия поднята до `20260627-0505`.

Добавлена функция `staticPagesForRole()`.

Теперь пункт `Страницы GitHub Pages` проверяет:

- общий набор страниц для всех ролей;
- для `owner/admin`: `admin-v2.html`, `nav-access-audit-v2.html`, `deal-card-diag-v2.html`;
- для `lawyer`: `queue-v2.html` и `deals-v2.html?filter=lawyer`;
- для `broker`: `deals-v2.html?filter=broker`.

`nav-system-check-v2.html` подключает сценарий с cache-bust версией `20260627-0505`.

## Эффект

Диагностика стала ближе к реальному рабочему маршруту конкретной роли. Это снижает риск ситуации, когда базовые страницы доступны, но важный для роли экран не проверен.

## Проверка

Проверено через GitHub connector:

- `admin-v2.html` существует;
- `queue-v2.html` существует;
- `nav-system-check-v2.html` подключает `nav-system-check-v2.js?v=20260627-0505`.

Проверено через Supabase connector:

- owner `deputat36@gmail.com`: профиль, список сделок, RPC grants и internal RPC lockdown работают;
- СПН Овчинников: профиль и список сделок работают.

## CRM «Лидер»

CRM «Лидер» не затрагивалась.
