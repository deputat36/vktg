# Navigator v2: exact production-schema mapping rehearsal v1

Дата: 20 июля 2026 года.

## Статус

Repository-only rehearsal. Production Supabase, migrations, RLS, grants, Auth, Edge Functions и рабочие строки не изменялись.

Mapper не является production RPC, не выполняет DML и всегда возвращает `production_ready=false`.

## Цель

Проверить, можно ли преобразовать governed intake plan нового трёхэтапного мастера в действующие строки:

- `nav_deals_v2`;
- `nav_deal_participants_v2`;
- `nav_deal_documents_v2`;
- `nav_deal_risks_v2`;
- `nav_deal_tasks_v2`;
- `nav_deal_events_v2`.

Проверка ограничена 13 правилами, для которых уже есть legacy projection. Остальные 12 правил остаются fail-closed.

## Read-only production snapshot

Источник: project `ofewxuqfjhamgerwzull`, PostgreSQL 17.6, статус ACTIVE_HEALTHY.

| Таблица | Колонки | Ограничения | Индексы | columns MD5 | constraints MD5 | indexes MD5 |
|---|---:|---:|---:|---|---|---|
| `nav_deals_v2` | 39 | 9 | 8 | `806c3f7c9388c2619a382f4e642e5645` | `2cab4169f0fd7c7749eb93d5efd4710a` | `f8728a881d208d1e740898e3dad3118f` |
| `nav_deal_participants_v2` | 13 | 3 | 5 | `6d6ad3182476564dff2cc947a26d2f6d` | `7fdaa4c5f5108f1bc208b0433b682bdc` | `e1f447de772c3fc7eb32a93693ce3f94` |
| `nav_deal_documents_v2` | 23 | 4 | 7 | `7a6956ed0e07bc76fa62e6bf358a8098` | `e19a0235d6207abc9253e931d334cfe4` | `0e11693858c6a0e505227007fd80f170` |
| `nav_deal_risks_v2` | 15 | 3 | 4 | `51a30010174e8d48618f5f97e19ed3fa` | `033c2696b3b2caa48846872ee0eb1137` | `6e2a40f763c806b4d75631c03fdb891f` |
| `nav_deal_tasks_v2` | 17 | 7 | 8 | `2a7ba163034bba54209c2ffe11cda27a` | `ac0bb3db0d3220e0aa1055cc0271b7b8` | `6fb247e2c02bf0794a53c69592e809b1` |
| `nav_deal_events_v2` | 7 | 3 | 4 | `1984379277381206b76257b1f51c7e1f` | `fdbb42229623d6858614e22b7a134f29` | `f582eff6d5513a7255ea4b839bcb3fb7` |

У всех шести таблиц read-only snapshot показал 18 table-grant записей и одинаковый grant digest `f94f2b2a1b74ef9b0f1728f94c152351`.

## Поддержанные правила

1. `minor_seller`
2. `minor_buyer`
3. `child_money`
4. `power_of_attorney`
5. `shares`
6. `minor_registered`
7. `privatisation`
8. `court_basis`
9. `matcap`
10. `mortgage`
11. `military_mortgage`
12. `settlements_not_agreed`
13. `expenses_not_agreed`

## Обязательный fail-closed список

`spouse`, `seller_absent`, `encumbrance`, `inheritance`, `bankruptcy_risk`, `redevelopment`, `after_registration`, `legal_problem`, `partner_agency`, `flat_ground`, `house_land`, `certificate`.

## Exact mapping

### Документы

Governed catalog использует смысловые scope `seller`, `buyer`, `object`, `deal`.

Production enum `nav_v2_side` допускает только:

`seller`, `buyer`, `both`, `other_agency`, `external_party`, `company`.

Поэтому прямой cast невозможен. Rehearsal применяет:

- `seller` → `seller`;
- `buyer` → `buyer`;
- `object` → `both`;
- `deal` → `both`.

Исходный смысл сохраняется в `source_hint` как `intake_scope:object` или `intake_scope:deal`.

Статусы:

- `available` → `received`;
- `requested` → `requested`;
- `missing` и отсутствие статуса → `needed`;
- `problem` → `problem`.

### Риски

Production risk enum не содержит `info`. Информационные ипотечные правила отображаются как `green`; маршрут и задача брокера сохраняются отдельно.

### Задачи

Production `task_type` имеет фиксированный allowlist. Mapping:

- `lawyer` → `legal_blocker`;
- `broker` → `broker_task`;
- `spn` → `operational_task`.

Приоритет:

- блокирует задаток → `urgent`;
- блокирует сделку → `high`;
- иначе → `normal`.

Источник начинается с `intake_v1:`, а не `auto_`. Это не позволяет production-триггеру самостоятельно назначать срок, когда governed plan его не определил.

## Найденный production STOP

### Privacy guard конфликтует с quality-задачами

Production privacy trigger намеренно очищает:

- `seller_name`;
- `buyer_name`;
- телефоны сторон;
- запрещённые client identifiers в JSON.

После вставки другой production trigger проверяет пустые `seller_name` и `buyer_name` и создаёт задачи:

- `Указать продавца`;
- `Указать покупателя`.

Следовательно, любая новая privacy-compliant карточка может автоматически получить две задачи, которые невозможно корректно закрыть сохранением ФИО в Navigator. Это создаёт ложный backlog и противоречит действующей privacy-модели.

Rehearsal обязан воспроизвести этот эффект и оставить `privacy_quality_task_collision` в `production_blockers`.

До отдельного решения этот mapper нельзя подключать к production save path.

## PostgreSQL 17 evidence

Синтетический harness воспроизводит:

- production enum для статусов, ролей, сторон, рисков и задач;
- 39-колоночный deal write surface;
- FK на Auth и `nav_user_profiles`;
- readiness checks;
- task type и SLA checks;
- privacy trigger;
- quality-task trigger;
- auto due-date trigger.

Проверки:

1. 13 поддержанных правил проходят structural mapping.
2. `object` и `deal` не приводят к invalid enum cast.
3. Исходный document scope не теряется.
4. `info` не ломает production risk enum.
5. Task owner преобразуется только в разрешённый `task_type`.
6. `intake_v1:` не запускает auto due-date semantics.
7. Exact replay не создаёт второй deal или вторую governed task.
8. Неверный owner UUID упирается в production-подобный FK и откатывает всю транзакцию.
9. Неподдержанное правило отклоняется до строки сделки.
10. Privacy/quality collision воспроизводится как две лишние quality-задачи.
11. Полный harness и prototype удаляются rollback-скриптом.

## Что этот PR не доказывает

- authenticated RLS/grants matrix;
- безопасную production grant policy;
- готовность всех 25 правил;
- production migration;
- Edge identity chain;
- отсутствие конфликтов на реальных исторических данных;
- право автоматически исправлять quality trigger.

## Следующий безопасный шаг

Repository-only contract для устранения privacy/quality collision:

- quality checks должны использовать структурированные признаки стороны и completeness gate, а не запрещённые ФИО;
- seller-only карточка не должна получать buyer-name task;
- buyer-only карточка не должна получать seller-name task;
- отсутствие имени не должно считаться дефектом, пока privacy-модель запрещает его хранение;
- изменение production trigger возможно только отдельным migration/deployment PR после owner approval и authenticated tests.
