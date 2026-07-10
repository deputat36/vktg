# Navigator v2 — findings аудита

Дата: 2026-07-10

## Данные

- сделок: 21;
- документов: 168;
- задач: 92;
- рисков: 49;
- событий: 116;
- активных профилей: 5;
- активных СПН: 3;
- СПН без менеджера: 1.

Открытых задач 86, все просрочены. Срочных 13, высокого приоритета 35, завершённых 0, отменённых 6. Открытых `auto_quality_*` — 44.

## Архитектура

Один Supabase-проект содержит несколько подсистем:

| Подсистема | Таблиц | Оценка строк |
|---|---:|---:|
| Navigator v2 | 11 | ~424 |
| Navigator legacy | 7 | ~3 |
| Leader | 43 | ~140 |
| Generic legacy | 9 | ~3 |
| Parket | 2 | 0 |
| Broker | 1 | 0 |

Все таблицы используют RLS. Общая схема всё равно увеличивает радиус ошибки migrations и grants.

## Безопасность

Положительно:

- в браузере только publishable key;
- секреты в репозитории не обнаружены;
- `nav_v2_*` SECURITY DEFINER недоступны `anon`;
- Navigator Edge Functions используют `verify_jwt=true`;
- admin/diagnostic RPC имеют role gate;
- BAZA подключена только на чтение;
- новый активный СПН без менеджера блокируется UI, Edge и БД.

Риски:

- 56 `nav_v2_*` SECURITY DEFINER функций;
- 47 доступны `authenticated`;
- leaked password protection выключена;
- access/refresh token хранятся в localStorage;
- defaults роли `supabase_admin` всё ещё требуют отдельного административного исправления.

Массовый revoke запрещён: часть функций является рабочим API и RLS helper. Нужна классификация frontend API / admin diagnostics / internal helper / legacy.

## RLS и производительность

Для Navigator v2 найдено 11 таблиц с политиками и 23 политики с прямым `auth.uid()`. Их нужно оптимизировать на `(select auth.uid())` только после role tests.

Performance Advisor в основном указывает на generic/legacy таблицы и старый Navigator. Не удалять unused indexes и не менять чужие политики без отдельного владельца и EXPLAIN.

## Frontend

Количество модулей примерно:

- deals: 9;
- admin: 6;
- SPN wizard: 17;
- deal card: около 30.

Основные риски: повторные RPC, гонки MutationObserver, зависимость от DOM-селекторов, ручной cache-bust и сложный поиск источника ошибки.

## CI/CD

Есть static, invite и BAZA checks. Нет Playwright role smoke, migration drift check, автоматического Edge deploy, live hash verification и единого release health report.

Во время аудита найден deploy drift: код `nav-invite-user` был в `main`, а live оставался на предыдущей версии. Drift устранён, live version — 10.

## Операционный процесс

Все 86 открытых задач просрочены и завершённых нет. Нужно разделить рабочие задачи сделки, quality warnings, системные рекомендации и блокирующие стоп-факторы. Сначала разобрать 13 urgent, затем вводить SLA и новые автогенераторы.
