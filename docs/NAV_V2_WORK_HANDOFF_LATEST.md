# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 2026-07-16.
- Репозиторий: `deputat36/vktg`.
- Production `main` перед текущим PR: `c218eec001f91f96b00f7d604b9adf4ccd31142f` — squash merge PR #354.
- Supabase project: `ofewxuqfjhamgerwzull`.
- Последняя production migration: `20260716063401_nav_v2_correct_mortgage_broker_scope`.
- Production Supabase в PR #350–#354 и текущем consultation-preview не менялся.
- Edge Functions, Auth, RLS и grants в этих волнах не менялись.

Counts могут меняться от реальной работы пользователей. Не откатывать данные только из-за изменения counts.

## Цель продукта

Navigator — единая заявка на подготовку и диспетчер взаимодействия СПН, юриста, ипотечного брокера и менеджера:

`вопрос/потребность → короткий сбор фактов → маршрутизация → план документов и условий → решение профильной роли → выполнение → подтверждение готовности → задаток/сделка → закрытие`

Navigator не является CRM, файловым архивом или автоматическим юристом. Инструмент должен требовать меньше ручных действий, чем бумажная карточка, устные консультации и разрозненная переписка вместе.

## Границы ролей

### СПН

- фиксирует факты, условия и договорённости;
- собирает документы и evidence;
- выполняет ближайшее действие;
- предлагает исключительный исход документа или риска;
- не подтверждает юридический или ипотечный gate самостоятельно.

### Юрист

- принимает юридические решения;
- определяет stop-факторы;
- подтверждает юридические документы и риски;
- готовит договорные документы;
- подтверждает готовность к задатку и сделке.

### Ипотечный брокер

- консультирует клиента и СПН по ипотеке;
- подбирает ипотечную программу;
- помогает получить одобрение банка;
- обучает СПН ипотечным сценариям.

Маткапитал, сертификаты, правовая и расчётная схема, подготовка и оформление ипотечной сделки относятся к СПН и юристу. При сочетании ипотеки с маткапиталом или сертификатом брокер ведёт только ипотечную часть.

### Менеджер

- помогает новичкам;
- контролирует зависшие сделки и нарушения процесса;
- подтверждает процессные, СПН- и корпоративные пункты;
- не заменяет юриста или брокера.

### Owner/admin

- видит системные задержки, принятие продукта и нагрузку;
- может принимать исключительные решения с обязательным аудитом.

## Канонические документы

- `docs/NAV_V2_FULL_AUDIT_2026-07-15.md` — технический и compliance-аудит.
- `docs/NAV_V2_AUTONOMOUS_EXECUTION_PLAN_2026-07-15.md` — автономные волны и gates.
- `docs/NAV_V2_OFFICE_PROCESS_AUDIT_2026-07-16.md` — фактический процесс офиса.
- `docs/NAV_V2_MORTGAGE_BROKER_SCOPE_2026-07-16.md` — зона ответственности ипотечного брокера.
- `docs/NAV_V2_DEALS_LIST_DTO_PROTOTYPE_2026-07-16.md` — минимальный DTO списка.
- `docs/NAV_V2_WORK_ITEM_OUTCOME_CONTRACT_2026-07-16.md` — исходы документов и рисков.
- `docs/NAV_V2_OUTCOME_READINESS_PROTOTYPE_2026-07-16.md` — outcome-aware readiness.
- `docs/NAV_V2_OUTCOME_READINESS_SCENARIOS_2026-07-16.md` — синтетическая scenario matrix.
- `docs/NAV_V2_FAST_CONSULTATION_INTAKE_2026-07-16.md` — быстрый consultation intake preview.

## Live baseline 16 июля 2026 года

- 5 активных профилей: owner, lawyer, 3 SPN;
- активного manager и broker нет;
- 23 сделки;
- 98 задач, большинство открыты и просрочены, `task_type` не заполнен;
- 198 документов: 182 `needed`, 12 `received`, 4 `checked`;
- 53 риска: после PR #349 — 49 открыты и 4 закрыты;
- командный цикл начал использоваться, но lifecycle ещё не замкнут.

Не использовать сырые показатели для оценки сотрудников: в данных могут быть тестовые, учебные и исторические записи.

## Завершённые волны

### PR #349 — корректная роль ипотечного брокера

- `broker_needed` создаётся только для ипотеки/военной ипотеки;
- маткапитал и сертификаты не направляют карточку брокеру;
- 4 автоматически ошибочно направленные карточки исправлены ограниченной production migration;
- ручные назначения и ипотечные сделки не менялись.

### PR #350 — DTO списка сделок

- explicit allowlist для `nav_v2_get_deals_list`;
- клиентские ФИО/телефоны, raw `next_action`, `deal_summary`, `wizard_snapshot` и unit-level address исключены из prototype contract;
- save recovery и handoff подготовлены к минимальному DTO;
- production не менялся.

### PR #351 — outcome-контракт

- документы: `not_applicable`, `replaced`, `cancelled`, `external_wait`, `deferred`;
- риски: `mitigated`, `not_applicable`, `superseded`, `accepted_by_specialist`, `cancelled`;
- состояния `proposed`, `confirmed`, `rejected`;
- СПН предлагает, профильная роль подтверждает;
- SQL только в `supabase/prototypes`.

### PR #352 — frontend preview outcomes

- role-aware preview встроен в существующий lifecycle карточки;
- СПН видит «предложить исход/решение», а не «закрыть»;
- нет новых mutation RPC, повторных read RPC или отдельного HTML entry module;
- production не менялся.

### PR #353 — outcome-aware readiness prototype

- `checked` — штатное завершение документа;
- только confirmed `not_applicable/replaced/cancelled` закрывают документ как исключение;
- `received`, proposed outcomes, `external_wait` и `deferred` остаются активными;
- proposed/rejected risk resolution не снимает блокировку;
- готовность к задатку и сделке считается раздельно;
- RPC read-only, без grants и клиентских идентификаторов.

### PR #354 — synthetic outcome/readiness scenario matrix

- 15 сценариев готовности документов, рисков и review;
- 14 positive/negative role cases;
- 7 funding route cases;
- маткапитал и сертификаты без ипотеки не относятся к брокеру;
- fixtures не вставляются в Supabase.

### PR #355 — закрыт без merge

- ранняя версия consultation preview преждевременно меняла официальный role menu;
- закрыта как superseded;
- не считать её частью `main`.

## Текущий consultation preview

Текущая ветка добавляет repository-only экран `consultation-v2.html`:

- один экран минимальных фактов;
- готовый структурированный текст для eChat;
- предварительная маршрутизация без выдачи за юридическое заключение;
- ипотечный брокер подключается только при ипотеке/военной ипотеке;
- маткапитал и сертификаты без ипотеки остаются у СПН и юриста;
- privacy guard блокирует клиентские контакты, паспортные данные, кадастровые номера и номера помещений;
- безопасные факты можно явно перенести в локальный draft полного мастера;
- консультация не сохраняется в Supabase;
- официальный role menu не меняется;
- сделка, документы, риски и задачи не создаются.

## Принцип дальнейшей работы

Каждый создаваемый системой пункт обязан иметь полный lifecycle:

`триггер → владелец → срок → действие → evidence → предложение исхода → подтверждение → влияние на gate`

Автоматический backlog нельзя расширять без completion contract.

## Следующий безопасный slice после consultation preview

P0/P1 — repository-only серверная модель консультации и очередь юриста.

### Consultation entity

Минимальные поля:

- `id`;
- `created_by`;
- `created_at`, `updated_at`;
- `status`: `new`, `need_info`, `answered`, `converted`, `closed`;
- безопасный structured intake без клиентских идентификаторов;
- `lawyer_id` или состояние ожидания назначения;
- `priority`;
- `planned_date`;
- безопасная ссылка на утверждённый внешний источник;
- `answer_text` или отдельная response entity;
- `converted_deal_id` после явного преобразования.

### RPC prototype

- create consultation;
- get visible consultation list;
- get consultation card;
- lawyer decision: `answer`, `need_info`, `convert_to_preparation`;
- SPN response to `need_info`;
- explicit conversion to deposit/deal preparation;
- audit events;
- никакого полного document/task backlog до conversion.

### Access model

- СПН видит созданные им консультации;
- менеджер видит консультации своей команды;
- юрист видит очередь и назначенные консультации;
- owner/admin видят весь контур;
- broker не получает юридическую очередь;
- при ипотеке broker scope отражается отдельным фактом, но не даёт ему доступа к юридическому ответу автоматически;
- viewer не получает доступ.

### Production gates

- SQL только в `supabase/prototypes`;
- explicit DTO allowlist;
- synthetic lifecycle fixtures;
- role/access matrix;
- authenticated role/mutation E2E;
- rollback;
- отдельный deploy PR;
- только после этого официальный пункт меню.

После consultation entity:

1. отдельный блок корпоративных документов;
2. bounded task taxonomy и SLA;
3. controlled pilot;
4. authenticated mutation E2E после approval среды;
5. production rollout outcomes/readiness;
6. security hardening.

## Ручные ограничения

- Issue #273: duplicate cleanup запрещён без решения владельца.
- Не менять назначения сотрудников без evidence и подтверждения владельца.
- Не очищать исторические строки автоматически.
- Не применять repository-only prototypes к production.
- Не создавать платную Supabase branch без согласования стоимости issue #282.
- Не считать skipped authenticated job доказательством ролей.
- Не менять grants, RLS, Auth или Edge Functions без отдельного review/deploy slice.
- Не хранить сканы документов в Navigator.
- Не выдавать автоматическую маршрутизацию за юридическое заключение.
- Не использовать сырые pilot metrics для оценки сотрудников.
- Не закрывать существующие документы и риски массово или по предположению.
- Не менять production status guards до authenticated tests.

## Decision gates владельца

Отложить до момента, когда они блокируют соответствующую волну:

1. кто является manager controlled pilot;
2. какие 10–15 кейсов и сотрудники входят в пилот;
3. применяется ли отдельный ПОД/ФТ-контур и кто его владелец;
4. Яндекс Диск или другой утверждённый источник документов и retention rules;
5. approval стоимости preview branch для authenticated E2E.

## Не повторять без новой причины

- общий технический аудит;
- аудит фактического процесса офиса;
- retirement viewer;
- сбор клиентских ФИО/телефонов в мастере;
- frontend read-layer masking;
- evidence-only duplicate handling;
- broker scope correction;
- deal-card-lite/deals-list DTO prototypes;
- outcome contract;
- non-mutating outcome preview;
- outcome readiness prototype;
- outcome/readiness scenario matrix;
- раннюю PR #355;
- production cleanup без решения владельца.

## Команда следующего запуска

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после consultation preview. Сначала подготовь repository-only SQL/DTO/RPC prototype consultation entity и очереди юриста. Не применяй SQL к production, не меняй status guards/roles/grants/RLS/Auth и не создавай полный document/task backlog до явного convert_to_preparation.`
