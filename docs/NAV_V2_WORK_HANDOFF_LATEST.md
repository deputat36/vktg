# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 2026-07-16.
- Репозиторий: `deputat36/vktg`.
- Production `main` перед PR #357: `c218eec001f91f96b00f7d604b9adf4ccd31142f` — squash merge PR #354.
- Текущий PR: #357 — repository-only lightweight consultation lifecycle.
- Supabase project: `ofewxuqfjhamgerwzull`.
- Project status: `ACTIVE_HEALTHY`.
- PostgreSQL: 17.6.
- Последняя подтверждённая production migration: `20260716063401_nav_v2_correct_mortgage_broker_scope`.
- Production Supabase в PR #350–#357 не менялся, кроме ограниченной correction migration PR #349.
- Edge Functions, Auth и production RLS/grants в PR #350–#357 не менялись.

Counts могут меняться от реальной работы пользователей. Не откатывать данные только из-за изменения counts.

## Цель продукта

Navigator — единая заявка на подготовку и диспетчер взаимодействия СПН, юриста, ипотечного брокера и менеджера:

`вопрос/потребность → короткий сбор фактов → маршрутизация → план документов и условий → решение профильной роли → выполнение → подтверждение готовности → задаток/сделка → закрытие`

Navigator не является CRM, файловым архивом или автоматическим юристом.

Критерий пользы: меньше ручных действий, чем бумажная карточка, устные консультации и разрозненная переписка вместе.

## Границы ролей

### СПН

- фиксирует факты, условия и договорённости;
- создаёт юридический вопрос без обязательного полного мастера;
- собирает документы и evidence после подтверждения маршрута;
- выполняет ближайшее действие;
- предлагает исключительный исход документа или риска;
- не подтверждает юридический или ипотечный gate самостоятельно.

### Юрист

- отвечает на lightweight-консультации;
- запрашивает уточнение или рекомендует полную подготовку;
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

Маткапитал, сертификаты, правовая и расчётная схема, подготовка и оформление ипотечной сделки относятся к СПН и юристу.

При сочетании ипотеки с маткапиталом или сертификатом брокер ведёт только ипотечную консультацию, программу и одобрение.

### Менеджер

- помогает новичкам;
- видит юридические запросы своей команды;
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
- `docs/NAV_V2_MORTGAGE_BROKER_SCOPE_2026-07-16.md` — зона ответственности брокера.
- `docs/NAV_V2_DEALS_LIST_DTO_PROTOTYPE_2026-07-16.md` — минимальный DTO списка.
- `docs/NAV_V2_WORK_ITEM_OUTCOME_CONTRACT_2026-07-16.md` — исходы документов и рисков.
- `docs/NAV_V2_OUTCOME_READINESS_PROTOTYPE_2026-07-16.md` — outcome-aware readiness.
- `docs/NAV_V2_OUTCOME_READINESS_SCENARIOS_2026-07-16.md` — scenario matrix.
- `docs/NAV_V2_CONSULTATION_LIFECYCLE_PROTOTYPE_2026-07-16.md` — lightweight consultation lifecycle.

## Live baseline 16 июля 2026 года

Read-only срез до PR #357:

- 5 активных профилей: owner, lawyer, 3 SPN;
- активного manager и broker нет;
- 23 сделки;
- 98 задач, большинство открыты и просрочены, `task_type` не заполнен;
- 198 документов: 182 `needed`, 12 `received`, 4 `checked`;
- 53 риска: после PR #349 — 49 открыты и 4 закрыты;
- отдельной таблицы или RPC юридических консультаций в production нет.

Не использовать сырые показатели для оценки сотрудников: присутствуют тестовые, учебные и исторические записи.

## Завершённые волны

### PR #347 — evidence-only duplicates

- frontend не объединяет сделки по адресу, ФИО, телефону, тексту или сумме;
- duplicate grouping требует server evidence `exact_duplicate_group_id`.

### PR #348 — фактический процесс офиса

- зафиксирована граница Navigator;
- определён продуктовый roadmap и decision gates.

### PR #349 — зона ипотечного брокера

- `broker_needed` только для ипотеки и военной ипотеки;
- маткапитал и сертификаты без ипотеки не направляются брокеру;
- ограниченно исправлены четыре автоматически ошибочно направленные карточки.

### PR #350 — deals-list DTO prototype

- explicit allowlist;
- исключены клиентские ФИО/телефоны, raw `next_action`, `deal_summary`, `wizard_snapshot` и unit-level address;
- production не менялся.

### PR #351–#352 — outcome lifecycle и frontend preview

- СПН предлагает исключительный исход;
- профильная роль подтверждает;
- ожидание и отсрочка остаются активными;
- preview не вызывает новые mutation RPC.

### PR #353–#354 — outcome-aware readiness и scenarios

- `checked` — штатное завершение документа;
- proposed outcomes не снимают gate;
- готовность к задатку и сделке считается раздельно;
- 15 readiness-сценариев, 14 role cases и 7 funding routes проверяются автоматически.

## PR #357 — lightweight consultation lifecycle prototype

Проектируется отдельный контур:

`new → need_info / answered / convert_to_preparation → closed`

Также доступна отмена незавершённого запроса в `cancelled`.

### Таблицы prototype

- `nav_consultations_v2`;
- `nav_consultation_messages_v2`.

### RPC prototype

- `nav_v2_create_consultation`;
- `nav_v2_get_consultation_queue`;
- `nav_v2_get_consultation`;
- `nav_v2_decide_consultation`;
- `nav_v2_add_consultation_clarification`;
- `nav_v2_close_consultation`.

### Главные ограничения

- не создаётся `nav_deals_v2`;
- не создаются задачи, документы или риски;
- очередь не возвращает текст вопроса;
- client identifiers запрещены;
- URL внешних документов пока не хранится;
- `convert_to_preparation` возвращает только безопасный draft;
- SQL находится только в `supabase/prototypes`;
- production migration не создавалась.

## Принцип дальнейшей работы

Каждый создаваемый системой пункт обязан иметь полный lifecycle:

`триггер → владелец → срок → действие → evidence → предложение исхода → подтверждение → влияние на gate`

Автоматический backlog нельзя расширять без completion contract.

## Следующий безопасный slice после PR #357

P0/P1 — repository-only frontend preview и consumer contract для консультаций.

### Требования

- один экран для СПН;
- novice/expert режим без дублирования данных;
- создать локальный synthetic request и показать готовую передачу;
- отдельный preview очереди юриста на fixtures;
- `answer`, `need_info`, `convert_to_preparation` с понятной роль-зависимой копией;
- вопрос и сообщения загружаются только в detail view, не в queue DTO;
- никакого вызова новых production RPC, пока SQL не развёрнут;
- broker/viewer не получают юридический экран;
- маткапитал/сертификат без ипотеки не показывают broker route;
- mobile-first, keyboard focus и sensitive-text regression;
- перенос в полный мастер только через явное действие пользователя;
- не менять production role menu до готовой серверной очереди и authenticated E2E.

После frontend preview:

1. отдельный блок корпоративных документов;
2. bounded task taxonomy и SLA;
3. controlled pilot;
4. authenticated mutation E2E после approval среды;
5. production rollout consultation/outcomes/readiness;
6. security hardening.

## Ручные ограничения

- Issue #273: duplicate cleanup запрещён без решения владельца.
- Не менять назначения сотрудников без evidence и подтверждения владельца.
- Не очищать исторические строки автоматически.
- Не применять repository-only prototypes к production.
- Не создавать платную Supabase branch без согласования стоимости issue #282.
- Не считать skipped authenticated job доказательством ролей.
- Не менять production grants, RLS, Auth или Edge Functions без отдельного review/deploy slice.
- Не хранить сканы документов в Navigator.
- Не хранить document URL до утверждения доменов и retention rules.
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
- сбор клиентских ФИО/телефонов;
- frontend read-layer masking;
- evidence-only duplicate handling;
- broker scope correction;
- deal-card-lite/deals-list DTO prototypes;
- outcome contract и non-mutating outcome preview;
- outcome readiness prototype и scenario matrix;
- production cleanup без решения владельца.

## Команда следующего запуска

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #357. Сначала подготовь repository-only frontend preview и consumer contract для lightweight consultations. Не применяй SQL к production, не добавляй новые production RPC в интерфейс, не меняй role menu/grants/RLS/Auth и не сохраняй client identifiers или document URL.`
