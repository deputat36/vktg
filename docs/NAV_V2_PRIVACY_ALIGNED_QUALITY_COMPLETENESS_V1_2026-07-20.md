# Navigator v2 — privacy-aligned quality completeness v1

Дата: 20 июля 2026 года.

Статус: repository-only rehearsal. Production Supabase не изменён.

## Причина изменения

Действующий privacy guard намеренно очищает ФИО и телефоны сторон из `nav_deals_v2` и вложенного JSON. Одновременно production-функция `nav_v2_sync_deal_quality_tasks(uuid)` требует заполнить `seller_name` и `buyer_name`.

Результат конфликта:

- 23 открытые задачи `auto_quality_seller_name`;
- 17 открытых задач `auto_quality_buyer_name`;
- новая privacy-compliant карточка получает две заведомо незакрываемые задачи;
- seller-only карточка получает требование покупателя, buyer-only — требование продавца.

ФИО и телефоны не являются quality requirement Navigator. Они остаются во внешних системах и не должны возвращаться в quality-trigger.

## Новый контракт качества

Quality completeness проверяет только данные, которые необходимы для маршрутизации и подготовки сделки:

1. Определена сопровождаемая сторона.
2. Назначен СПН каждой сопровождаемой стороны.
3. Для `one_spn_both` один и тот же СПН указан с обеих сторон.
4. Для задатка, сделки, проверки документов или доработки указан адрес либо кадастровый номер.
5. Для консультации без объекта указана явная причина, почему объект не выбран.
6. Зафиксирован следующий шаг.
7. Для versioned intake v1 указан срок либо `dateUnknown=true`.
8. Для intake v1 перед юристом указан тип запроса и конкретное требуемое решение.
9. Для intake v1 перед брокером существует bounded-задача только по ипотечной части с action и expected result.

Проверки срока и профильного вопроса не применяются к историческим legacy-карточкам: они не содержали соответствующих обязательных полей при создании.

## Representation-aware правила

| Модель | Проверка |
|---|---|
| `seller` | требуется только `seller_spn_id` |
| `buyer` | требуется только `buyer_spn_id` |
| `both` | отдельно требуются seller и buyer СПН |
| `one_spn_both` | оба назначения обязательны и должны совпадать |
| `partner_agency` | сначала требуется явный `partnerSide`; сторона не угадывается |
| `unknown` | создаётся только задача уточнить модель сопровождения |

## Bounded task sources

Новый контракт управляет источниками:

- `auto_quality_representation`;
- `auto_quality_seller_spn`;
- `auto_quality_buyer_spn`;
- `auto_quality_one_spn_consistency`;
- `auto_quality_object_context`;
- `auto_quality_next_action`;
- `auto_quality_target_date`;
- `auto_quality_lawyer_question`;
- `auto_quality_broker_question`.

Каждая задача получает:

- конкретный title и action-oriented description;
- `assigned_to` и `assigned_role`;
- отдельный `created_by`, равный создателю сделки;
- разрешённый `task_type`;
- `sla_days`;
- priority и вычисленный auto due date;
- уникальность одной открытой задачи по `deal_id + source`;
- автоматическое закрытие после устранения причины.

## Работа с legacy quality tasks

Следующие источники объявлены устаревшими:

- `auto_quality_seller_name`;
- `auto_quality_buyer_name`;
- `auto_quality_address`;
- `auto_quality_responsible_spn`.

Prototype не запускает общий backfill и не изменяет все старые строки при применении.

При синхронизации конкретной затронутой сделки её устаревшие задачи закрываются, после чего создаются только актуальные bounded requirements. Нет массового cleanup, оценки сотрудников или скрытого изменения исторических карточек.

## Read-only production impact preview

Проверка выполнена на Supabase project `ofewxuqfjhamgerwzull` без записи.

Текущий baseline:

- 23 сделки;
- 98 задач;
- 23 открытые seller-name задачи;
- 17 открытых buyer-name задач;
- 4 открытые address задачи;
- 2 открытые responsible-SPN задачи.

Если применить только новую логику к текущей структуре карточек, потенциальные новые требования составят:

- уточнить representation — 2 сделки;
- назначить seller СПН — 0;
- назначить buyer СПН — 1;
- исправить `one_spn_both` — 0;
- уточнить объект — 4;
- указать следующий шаг — 0;
- указать срок intake v1 — 0;
- сформулировать вопрос юристу intake v1 — 0;
- сформулировать ипотечную задачу брокеру intake v1 — 0.

Это preview, а не backfill-план. Четыре object requirements соответствуют текущему address inventory, а две unknown representation карточки требуют отдельного уточнения вместо автоматического назначения стороны.

## PostgreSQL 17 evidence

Ephemeral harness обязан доказать:

- seller-only не получает buyer requirement;
- buyer-only не получает seller requirement;
- unknown/partner не угадывают сторону;
- `one_spn_both` проверяет совпадение специалистов;
- объект или явная причина отсутствия объекта проходят корректно;
- deadline/question checks включаются только для intake v1;
- повторный sync не создаёт дубликат;
- решённая причина автоматически закрывает задачу;
- новые задачи не зависят от ФИО или телефонов;
- `created_by` не подменяется исполнителем;
- применение prototype не выполняет массовый cleanup;
- одна затронутая legacy-сделка постепенно закрывает obsolete tasks;
- незатронутый legacy inventory остаётся неизменным;
- rollback возвращает exact исходные функции и trigger definition по сохранённым MD5.

## Security boundary

- публичная сигнатура внутренней sync-функции сохраняется;
- `anon`, `authenticated` и `PUBLIC` не получают EXECUTE;
- helper размещён в `nav_v2_private`;
- `service_role` получает только необходимый internal execute;
- prototype не создаёт public RPC для браузера;
- в `supabase/migrations` файла нет;
- production Edge/frontend transport не меняется.

## Rollback

Rehearsal сохраняет через `pg_get_functiondef` и `pg_get_triggerdef`:

1. действующую `nav_v2_sync_deal_quality_tasks(uuid)`;
2. действующую `nav_v2_deal_quality_tasks_trigger()`;
3. trigger `nav_deals_v2_quality_tasks_aiu`.

Rollback удаляет новый private helper, восстанавливает исходные определения и повторно сравнивает MD5.

## Обязательные STOP

Даже при зелёном PostgreSQL rehearsal production deployment запрещён без:

- authenticated role matrix;
- owner/deployment approval;
- отдельной migration review;
- решения по 46 открытым legacy quality tasks;
- подтверждения, нужен постепенный cleanup при касании или отдельный управляемый cleanup.

Generic команда `продолжай` не является согласием на migration, cleanup, technical accounts, Supabase branch или production deploy.
