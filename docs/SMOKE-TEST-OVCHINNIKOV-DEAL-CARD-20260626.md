# Smoke-тест карточки Овчинникова

Дата: 26 июня 2026.

## Проверяемый пользователь

- Email: `a.k.ovchinnikov@borisoglebsk.etagi.com`
- Auth UID: `98ee4523-dacb-47c3-b458-97e524f92444`
- Роль: `spn`

## Проверяемая сделка

- ID: `03029d49-6e43-47b6-856e-4886f0ac320a`

## Проверка под пользователем Овчинникова

Через `set_config` был имитирован JWT:

- `request.jwt.claim.sub = 98ee4523-dacb-47c3-b458-97e524f92444`
- `request.jwt.claim.role = authenticated`

Результат:

| Проверка | Результат |
|---|---|
| `nav_v2_get_my_profile()` | ok |
| `nav_v2_get_deals_list(5)` | ok |
| `nav_v2_get_deal_card_lite(uuid)` | ok |
| `nav_v2_get_deal_card(uuid)` | ok |
| `nav_v2_get_handoff_scores(jsonb)` | ok |

Вывод: на стороне Supabase основной путь пользователя работает.

## Серверный performance-baseline под Овчинниковым

Проведён последовательный замер внутри транзакции с временной таблицей. Это не браузерное время загрузки страницы, а ориентировочное время выполнения RPC на стороне PostgreSQL/Supabase.

| RPC | Результат | Время |
|---|---:|---:|
| `nav_v2_get_my_profile()` | ok | 0.002 сек |
| `nav_v2_get_deals_list(5)` | ok | 0.013 сек |
| `nav_v2_get_deal_card_lite(uuid)` | ok | 0.003 сек |
| `nav_v2_get_deal_card(uuid)` | ok | 0.133 сек |
| `nav_v2_get_handoff_scores(jsonb)` | ok | 0.003 сек |

Вывод: серверная часть не показывает признаков 20–45-секундного ожидания. Даже полная карточка на стороне RPC выполнилась примерно за 0.133 сек.

## Проверка под service_role

Через `set_config` был имитирован служебный запуск:

- `request.jwt.claim.sub = ''`
- `request.jwt.claim.role = service_role`

Результат:

| Проверка | Результат |
|---|---|
| `nav_v2_get_deal_card_lite(uuid)` | ok |
| `nav_v2_get_handoff_scores(jsonb)` | ok |

Проверка `nav_v2_get_deal_responsibility_snapshot(uuid)` прямым вызовом была заблокирована инструментом безопасности OpenAI. До этого была выполнена структурная проверка тела функции: в функции есть `v_is_service` и service-aware guard `not v_is_service and not public.nav_v2_can_view_deal(...)`.

## Практический вывод

Если пользователь всё ещё видит таймаут в браузере, причина с высокой вероятностью находится не в доступе Supabase и не в RPC, а в одном из клиентских факторов:

- кэш ES-модулей браузера;
- старый `supabase-v2.js` в цепочке импортов;
- нестабильная сеть/долгий ответ PostgREST на стороне клиента;
- конфликт тяжёлых фронтенд-модулей полной карточки.

Для обхода уже есть:

- усиленный importmap в `deal-card-v2.html`;
- recovery-модуль;
- `deal-card-safe-v2.html` с lite-RPC;
- `deal-card-check-v2.html` с отдельной диагностикой lite/full.

## URL для проверки

Основная карточка:

`https://deputat36.github.io/vktg/deal-card-v2.html?id=03029d49-6e43-47b6-856e-4886f0ac320a&cache=20260626-smoke`

Безопасная карточка:

`https://deputat36.github.io/vktg/deal-card-safe-v2.html?id=03029d49-6e43-47b6-856e-4886f0ac320a&cache=20260626-smoke`

Диагностика:

`https://deputat36.github.io/vktg/deal-card-check-v2.html?id=03029d49-6e43-47b6-856e-4886f0ac320a&cache=20260626-smoke`

## CRM «Лидер»

CRM «Лидер» не затрагивалась.
