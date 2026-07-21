# Navigator v2 — exact query-to-index mapping v1

Дата: 21 июля 2026 года.

## Exact non-PII query-to-index mapping

Цель — отделить простое упоминание индексируемого поля в функции от SQL-предиката, который действительно может использовать индекс.

Карта подготовлена по определениям PostgreSQL-функций из системного каталога в read-only transactions. Бизнес-строки, ФИО, телефоны, email пользователей, документы сделки и другие персональные данные не читались и не возвращались.

Рассматриваются два кандидата:

1. `nav_user_profiles_role_idx (role)`;
2. `nav_deal_answers_v2_deal_idx (deal_id)` при наличии unique `(deal_id, question_key)`.

## Why 24 references are not 24 index consumers

Предыдущая inventory зафиксировала 24 функции, в определениях которых одновременно встречаются:

- `nav_user_profiles`;
- `role`.

Это корректная reference inventory, но не доказательство 24 selective index consumers.

В функцию могут попадать разные SQL shapes:

- прямой фильтр строк профилей по роли;
- lookup профиля по primary key с дополнительной проверкой роли;
- JOIN профиля по `id` и последующая проекция роли;
- проверка уже загруженной переменной `v_role` при фильтрации другой таблицы;
- whole-table aggregate с `FILTER (WHERE role = ...)`;
- INSERT или UPDATE значения роли.

Только первый вариант является прямым role-first read predicate.

## Role index classification

Все 24 функции распределены по взаимоисключающим категориям.

### Direct runtime role filter — 1

`nav_v2_get_team_profile_quality_health()`

Функция содержит реальные predicates по строкам профилей:

- активный СПН без менеджера;
- наличие активного owner/admin;
- role-based health counts.

При этом часть функции выполняет whole-table aggregates, поэтому не каждое упоминание роли внутри неё является selective lookup.

### Direct demo role filter — 1

`nav_v2_seed_demo_data_unchecked_20260622()`

Функция выбирает активного owner/admin и сортирует owner раньше admin. Это прямой role predicate, но legacy demo path не является representative authenticated workload.

### Whole-table role aggregate — 1

`nav_v2_get_access_audit()`

Функция строит аудит всех профилей и role-based counts. Она использует роль в filtered aggregates и расчётах по каждому пользователю, а не как bounded selective lookup.

### Role write paths — 2

- `nav_v2_link_user_by_email(text,text,nav_v2_user_role,uuid,text)`;
- `nav_v2_update_user_profile(uuid,text,nav_v2_user_role,uuid,text,boolean)`.

Эти функции записывают или обновляют роль. Для них индекс означает write-maintenance cost, но не доказывает read benefit.

### PK lookup, ID join, projection or loaded variable — 19

Оставшиеся 19 функций:

- загружают профиль по `id` или текущему Auth user;
- присоединяют профиль по `id`;
- возвращают роль в JSON;
- используют уже загруженную переменную `v_role` для фильтрации сделок, задач или комментариев;
- выполняют role guard после primary-key lookup.

В таких SQL shapes primary access path — PK/ID relation, а не single-column role index.

Итог:

- reference consumers — 24;
- direct role filters — 2;
- non-demo direct role filters — 1.

## Answers index classification

У `nav_deal_answers_v2` обнаружено две прямые функции.

### Demo cleanup — direct deal_id delete filter

`nav_v2_clear_demo_data_unchecked_20260622()` выполняет:

`DELETE ... WHERE deal_id IN (demo deals)`

Это реальный `deal_id` filter. Его могут структурно обслуживать:

- single `(deal_id)`;
- leading prefix unique `(deal_id, question_key)`.

Однако путь относится только к legacy demo cleanup и не является representative production workload.

### Demo seed — insert-only

`nav_v2_seed_demo_data_unchecked_20260622()` вставляет строки ответов.

Он:

- не доказывает read benefit ни одного индекса;
- создаёт write-maintenance cost для обоих индексов.

### Internal foreign-key lookup

FK `nav_deal_answers_v2_deal_id_fkey` использует child lookup по `deal_id` при:

- `ON DELETE CASCADE`;
- `ON UPDATE NO ACTION`.

Это не RPC consumer. Его semantics, composite-prefix applicability, scan attribution, blocked referenced update и rollback уже покрыты каноническим synthetic FK evidence.

## Corrected decisions

### Role index

Решение остаётся:

`retain`

Причина стала точнее:

- реальный non-demo role-first consumer только один;
- role участвует в security/profile-health semantics;
- production statistics observation window неизвестен;
- representative authenticated workload отсутствует;
- production EXPLAIN не выполнен;
- production DDL не согласован.

Карта не доказывает, что role index активно используется, но и не даёт основания удалить его.

### Answers deal index

Решение остаётся:

`review_possible_redundancy_only`

Причина:

- direct RPC filter только один и относится к demo cleanup;
- второй RPC consumer — insert-only;
- composite unique structurally покрывает leading `deal_id`;
- synthetic FK evidence положителен;
- production workload, scale benchmark и write/storage benefit не доказаны.

## No production rows or PII

В рамках mapping использовались только:

- имена и сигнатуры функций;
- определения функций;
- имена таблиц, constraints и indexes;
- aggregate consumer counts.

Не читались и не сохранялись:

- строки профилей;
- ФИО;
- телефоны;
- пользовательские email;
- данные клиентов;
- тексты ответов;
- документы сделки;
- Auth tokens.

## Production DDL remains blocked

До изменения любого индекса обязательны:

- известное начало production statistics window;
- representative authenticated workload;
- production `EXPLAIN ANALYZE` на безопасных non-PII cases;
- production-scale FK parent mutation benchmark;
- write amplification и storage benefit estimate;
- authenticated regression suite;
- exact forward/rollback migration;
- отдельное owner DDL approval.

## Production remains unchanged

- production indexes не создавались и не удалялись;
- migrations не применялись;
- Supabase branch не создавалась;
- production rows не менялись;
- RLS и grants не менялись;
- Auth settings и users не менялись;
- Edge Functions не развёртывались;
- `leader_*` не затрагивался.
