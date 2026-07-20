# Navigator v2 — legacy quality cleanup decision v1

Дата: 20 июля 2026 года.

Статус: repository-only decision package. Production Supabase не изменён. Вариант cleanup не выбран.

## Задача

После privacy-аудита и PR #408 в production остаются 46 открытых задач старого quality-контракта:

- 23 `auto_quality_seller_name`;
- 17 `auto_quality_buyer_name`;
- 4 `auto_quality_address`;
- 2 `auto_quality_responsible_spn`.

Нельзя закрывать их одним механическим запросом:

- 40 name-задач противоречат действующей privacy-модели и не имеют допустимого способа выполнения;
- 4 address-задачи должны быть заменены на bounded `object_context` requirement;
- 2 responsible-SPN задачи относятся к сделкам с неизвестной моделью сопровождения, поэтому сначала требуется `representation`, а не случайное назначение специалиста.

## Read-only production classification

Без чтения ФИО, телефонов и содержимого документов получена классификация:

| Класс | Строк | Сделок | Безопасное значение |
|---|---:|---:|---|
| `obsolete_privacy_conflict` | 40 | 23 | закрывать только после deployment replacement и owner approval; replacement не создаётся |
| `replace_object_context` | 4 | 4 | закрыть legacy source и создать bounded `auto_quality_object_context` |
| `replace_representation` | 2 | 2 | закрыть generic responsible-SPN и создать `auto_quality_representation` |

Возраст:

- 2 строки — до 7 дней;
- 44 строки — от 8 до 30 дней.

Возраст используется только для операционного планирования. Он не является оценкой сотрудника, качества работы или основанием для санкций.

## Deterministic planner

`nav_v2_private.nav_v2_plan_legacy_quality_cleanup_v1()`:

- читает только четыре legacy source;
- рассматривает только `open` и `in_progress`;
- не использует ФИО, телефоны, email, паспортные или банковские данные;
- не выводит исполнителей и авторов;
- не выполняет INSERT, UPDATE, DELETE или TRUNCATE;
- возвращает стабильный список `task_id/deal_id/source/classification/proposed_action/replacement_source`;
- возвращает `writes_performed=false`;
- возвращает `production_ready=false`;
- возвращает `selected_option=null`;
- доступен только `service_role` в изолированном rehearsal.

Pure classifier дополнительно покрывает будущие безопасные случаи:

- resolved address/cadastral;
- seller-SPN gap;
- buyer-SPN gap;
- both-side gap;
- one-SPN consistency gap;
- unknown source → `manual_review`.

## Варианты решения владельца

### 1. `gradual_on_touch`

Рекомендуемый самый безопасный вариант.

После deployment нового quality-контракта устаревшие строки закрываются только при синхронизации конкретной сделки. Массовых изменений нет. Историческая карточка меняется только когда с ней действительно работают.

Плюсы:

- минимальный blast radius;
- естественная проверка актуального состояния сделки;
- не требует одномоментного изменения 46 строк.

Минус: часть старого backlog останется видимой до касания соответствующих сделок.

### 2. `one_time_name_only_after_deploy`

После deployment и authenticated-проверки одним управляемым действием закрываются только 40 privacy-conflicting name-задач.

Плюс: быстро устраняется заведомо невыполнимый backlog.

Ограничение: 6 address/responsible строк не затрагиваются и должны проходить отдельную reconciliation.

### 3. `controlled_reconciliation_after_deploy`

После deployment выполняется dry-run, затем управляемое сопоставление всех 46 строк с новым контрактом:

- obsolete name rows закрываются;
- address rows закрываются и заменяются `object_context`;
- generic responsible rows закрываются и заменяются `representation`;
- результат сверяется с ожидаемыми counts и rollback evidence.

Это самый полный, но и самый рискованный вариант. Требует отдельной migration/operation review.

## Обязательные STOP

Cleanup запрещён, пока отсутствует хотя бы одно условие:

- владелец не выбрал вариант;
- privacy-aligned replacement не deployed;
- authenticated role matrix не выполнена;
- owner cleanup approval отсутствует;
- deployment approval отсутствует;
- rollback attestation отсутствует.

Generic команда `продолжай` не является выбором варианта или разрешением на закрытие строк.

## PostgreSQL 17 evidence

Synthetic harness воспроизводит точный aggregate inventory 46 строк без production data:

- 23 seller-name;
- 17 buyer-name;
- 4 address;
- 2 responsible-SPN.

Проверки обязаны доказать:

- exact classification 40/4/2;
- одинаковый план при повторном вызове;
- отсутствие PII и employee-scoring semantics;
- отсутствие business DML;
- неизменность количества и hash всех task rows;
- fail-closed `manual_review` для неизвестного source;
- coverage seller/buyer/both/one-SPN classifications;
- service-role-only execution;
- полный rollback функций с неизменными synthetic rows.

## Решение

`selected_option = null`

До отдельного решения владельца пакет является только доказательством и планом. Production tasks не закрываются и не изменяются.
