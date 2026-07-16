# Navigator v2 — outcome-aware readiness prototype

Дата: 16 июля 2026 года  
Статус: repository-only prototype  
Production Supabase: без изменений

## Зачем нужен отдельный расчёт

Текущие production guards считают обязательный документ закрытым, если его статус `received` или `checked`. Это было приемлемо для ранней версии, но не соответствует целевому процессу:

- документ может быть получен, но ещё не проверен;
- СПН может предложить «не применимо» или «заменено», но предложение не должно сразу снимать gate;
- `external_wait` и `deferred` объясняют задержку, но не являются выполнением;
- риск может иметь предложенный исход, который ещё должен подтвердить профильный специалист;
- старые `is_resolved=true` не содержат структурированного кода решения.

Нельзя сразу менять production status guards: сначала требуется увидеть разницу между legacy и целевым расчётом на синтетических данных.

## Целевая семантика документа

### Завершает пункт

- `status = checked`;
- `outcome_state = confirmed` и `outcome_code` равен:
  - `not_applicable`;
  - `replaced`;
  - `cancelled`.

### Не завершает пункт

- `received` без проверки;
- `proposed not_applicable/replaced/cancelled`;
- `external_wait`;
- `deferred`;
- `needed`;
- `requested`;
- `problem`.

Это означает: объяснённое ожидание остаётся видимым, но не превращается в просрочку без контекста. Для него позже должны использоваться отдельные SLA и контрольные даты.

## Целевая семантика риска

- `confirmed` с `resolution_code` закрывает только конкретный риск;
- `proposed` и `rejected` оставляют риск активным;
- исходный `blocks_deposit`/`blocks_deal` продолжает действовать до подтверждения;
- legacy `is_resolved=true` без кода временно считается закрытым для совместимости, но попадает в счётчик backfill review;
- автоматического заполнения старых кодов не выполняется.

## Раздельная готовность

### К задатку

Учитываются:

- документы с `required_for_deposit=true`;
- активные риски с `blocks_deposit=true`;
- блокирующие review для задатка.

### К сделке

Учитываются:

- документы с `required_for_deal=true`;
- активные риски с `blocks_deal=true`;
- блокирующие review для сделки.

Готовность к задатку и к основной сделке рассчитывается независимо.

## SQL prototype

Файл:

`supabase/prototypes/nav_v2_outcome_readiness_preview.sql`

Он проектирует:

- `nav_v2_document_outcome_is_terminal_complete`;
- `nav_v2_risk_outcome_is_active`;
- read-only RPC `nav_v2_get_outcome_readiness_preview`.

RPC возвращает только техническую готовность и безопасную ссылку на карточку. Клиентские ФИО, телефоны, адрес, title, `wizard_snapshot` и `deal_summary` не возвращаются.

## Что показывает preview

Для каждой доступной сделки:

- готовность к задатку;
- готовность к сделке;
- количество блокирующих документов;
- количество блокирующих рисков;
- количество блокирующих review;
- полученные, но не проверенные документы;
- подтверждённые и предложенные терминальные исходы;
- `external_wait` и `deferred`;
- proposed/confirmed risk resolutions;
- legacy resolved risks без кода;
- разницу между legacy и целевым подсчётом документов;
- основную причину неготовности.

## Почему `received` больше не считается завершением

Получение документа — действие СПН. Проверка содержания — отдельное действие профильной роли. Если считать `received` завершением, сделка может выглядеть готовой до фактической юридической проверки.

При rollout интерфейс должен различать:

- документ получен;
- документ проверен;
- документ имеет проблему;
- предложен альтернативный исход;
- альтернативный исход подтверждён.

## Роль ипотечного брокера

Outcome-aware readiness не расширяет ответственность брокера.

Брокер работает только с ипотекой и военной ипотекой:

- консультация;
- подбор программы;
- требования банка;
- помощь в одобрении;
- обучение СПН.

Маткапитал, сертификаты, правовая схема, расчёты и оформление сделки остаются у СПН и юриста.

## Legacy comparison

Preview специально возвращает:

- legacy unresolved documents;
- target unresolved documents;
- delta по задатку;
- delta по сделке.

Ожидаемо target count может быть выше, потому что `received` без `checked` остаётся активным. Это не ошибка, а сигнал, что перед rollout нужно внедрить удобный цикл проверки и не создавать лишнюю нагрузку на юриста.

## Запрещённые изменения

Эта волна не должна:

- менять `nav_v2_update_deal_status`;
- менять production `nav_v2_get_operational_readiness_preview`;
- обновлять `readiness_deposit` или `readiness_deal`;
- подтверждать outcomes;
- закрывать риски;
- менять документы;
- добавлять grants;
- применять SQL к production;
- возвращать клиентские идентификаторы.

## Production gate

Перед изменением production guards необходимы:

1. outcome schema на изолированных синтетических данных;
2. authenticated role/mutation tests;
3. fixtures по всем исходам;
4. сравнение legacy и target counts;
5. проверка сценариев задатка и сделки отдельно;
6. проверка производительности;
7. desktop/mobile тест карточки;
8. rollback SQL;
9. controlled pilot.

Если для authenticated tests нужна платная Supabase preview branch, её нельзя создавать без решения владельца.

## Rollback

Поскольку это repository-only prototype, rollback состоит в удалении:

- preview RPC;
- двух private helper functions;
- contract/checker/docs этой волны.

Outcome-колонки, production status guards, readiness-поля и реальные строки preview не изменяет и не владеет ими.

## Следующий безопасный этап

После принятия расчёта:

1. fixtures для document/risk outcomes;
2. scenario matrix по задатку и сделке;
3. быстрый consultation intake;
4. отдельный блок корпоративных документов;
5. task taxonomy и SLA;
6. только после authenticated E2E — production migration outcomes и readiness guards.
