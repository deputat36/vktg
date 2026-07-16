# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 2026-07-16.
- Репозиторий: `deputat36/vktg`.
- Production `main` перед PR #353: `fa47b33a4db53625596b9210451db1cb12ea311a` — squash merge PR #352.
- Supabase project: `ofewxuqfjhamgerwzull`.
- Последняя production migration: `20260716063401_nav_v2_correct_mortgage_broker_scope`.
- Production Supabase в PR #350–#353 не менялся.
- Edge Functions, Auth, RLS и grants в этих волнах не менялись.

Counts могут меняться от реальной работы пользователей. Не откатывать данные только из-за изменения counts.

## Цель продукта

Navigator — единая заявка на подготовку и диспетчер взаимодействия СПН, юриста, ипотечного брокера и менеджера:

`вопрос/потребность → короткий сбор фактов → маршрутизация → план документов и условий → решение профильной роли → выполнение → подтверждение готовности → задаток/сделка → закрытие`

Navigator не является CRM, файловым архивом или автоматическим юристом.

Критерий пользы: инструмент должен требовать меньше ручных действий, чем бумажная карточка, устные консультации и разрозненная переписка вместе.

## Роли

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

Маткапитал, сертификаты, правовая и расчётная схема, подготовка и оформление ипотечной сделки относятся к СПН и юристу. При сочетании ипотеки с маткапиталом брокер ведёт только ипотечную часть.

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
- `docs/NAV_V2_MORTGAGE_BROKER_SCOPE_2026-07-16.md` — правильная зона ответственности ипотечного брокера.
- `docs/NAV_V2_DEALS_LIST_DTO_PROTOTYPE_2026-07-16.md` — consumer matrix и минимальный DTO списка.
- `docs/NAV_V2_WORK_ITEM_OUTCOME_CONTRACT_2026-07-16.md` — исходы документов и рисков.
- `docs/NAV_V2_OUTCOME_READINESS_PROTOTYPE_2026-07-16.md` — целевая готовность после подтверждаемых outcomes.

## Live baseline

Read-only срез 16 июля 2026 года:

- 5 активных профилей: owner, lawyer, 3 SPN;
- активного manager и broker нет;
- 23 сделки;
- 98 задач, большинство открыты и просрочены, `task_type` не заполнен;
- 198 документов: 182 `needed`, 12 `received`, 4 `checked`;
- 53 риска: после correction PR #349 — 49 открыты и 4 закрыты;
- team cycle начал использоваться через комментарии и review, но lifecycle ещё не замкнут.

Не использовать эти сырые показатели для оценки сотрудников: в данных могут быть тестовые, учебные и исторические записи.

## Последние завершённые волны

### PR #347 — evidence-only duplicate handling

- frontend не строит duplicate key из адреса, ФИО, телефона, текста или суммы;
- группировка возможна только по server evidence `exact_duplicate_group_id`;
- production данные не менялись.

### PR #348 — аудит фактического процесса офиса

- зафиксирована целевая граница Navigator;
- сформирован продуктовый roadmap;
- определены decision gates владельца.

### PR #349 — корректная роль ипотечного брокера

- `broker_needed` создаётся только для ипотеки/военной ипотеки;
- маткапитал и сертификаты не направляют карточку брокеру;
- брокерская задача относится к консультации, программе и одобрению;
- 4 автоматически ошибочно направленные карточки исправлены ограниченной production migration;
- ручные назначения и ипотечные сделки не менялись.

### PR #350 — repository-only DTO списка сделок

- подготовлен explicit allowlist для `nav_v2_get_deals_list`;
- клиентские ФИО/телефоны, raw `next_action`, `deal_summary`, `wizard_snapshot` и unit-level address исключены из prototype contract;
- title заменён нейтральной ссылкой;
- save recovery подготовлен к поиску без точного адреса;
- handoff fallback больше не зависит от клиентских идентификаторов;
- prototype к production не применялся.

### PR #351 — outcome-контракт документов и рисков

- спроектированы исходы `not_applicable`, `replaced`, `cancelled`, `external_wait`, `deferred`;
- для рисков: `mitigated`, `not_applicable`, `superseded`, `accepted_by_specialist`, `cancelled`;
- состояния `proposed`, `confirmed`, `rejected`;
- СПН предлагает терминальный исход, профильная роль подтверждает;
- ожидание и отсрочка остаются активными;
- SQL находится только в `supabase/prototypes`.

### PR #352 — frontend preview исходов

- добавлен role-aware preview документов и рисков в карточке сделки;
- СПН видит «предложить исход/решение», а не «закрыть»;
- `external_wait`, `deferred`, `replaced`, `superseded` валидируются;
- preview объясняет влияние на readiness;
- встроен в существующий explicit lifecycle и использует уже загруженные cardData/profile;
- нет повторных RPC, MutationObserver или отдельного HTML entry module;
- карточка сохранила бюджет 19 модулей;
- все CI и browser E2E зелёные;
- ничего не сохраняется, production Supabase не менялся.

### PR #353 — outcome-aware readiness prototype

- проектируется checked-only штатное завершение документа;
- подтверждённые `not_applicable/replaced/cancelled` закрывают документ как исключение;
- `received`, proposed outcomes, `external_wait` и `deferred` остаются активными;
- proposed/rejected risk resolution не снимает блокировку;
- готовность к задатку и сделке считается раздельно;
- возвращается legacy/target delta;
- RPC read-only, без клиентских идентификаторов и без grants;
- production guards и readiness-поля не меняются.

## Принцип дальнейшей работы

Каждый создаваемый системой пункт обязан иметь полный lifecycle:

`триггер → владелец → срок → действие → evidence → предложение исхода → подтверждение → влияние на gate`

Автоматический backlog нельзя расширять без completion contract.

## Следующий безопасный slice после PR #353

P0/P1 — repository-only fixtures и scenario matrix для outcomes/readiness.

### Минимальная матрица

1. документ `checked`;
2. документ `received`, но не проверен;
3. proposed `not_applicable`;
4. confirmed `not_applicable`;
5. confirmed `replaced` с replacement ID;
6. `external_wait` с внешней стороной;
7. `deferred` с датой;
8. problem document;
9. proposed legal risk resolution;
10. confirmed legal risk resolution;
11. proposed mortgage risk resolution;
12. confirmed mortgage risk resolution;
13. blocking review к задатку;
14. blocking review к сделке;
15. legacy resolved risk без кода.

### Требования

- только синтетические fixtures;
- не вставлять данные в production;
- expected counts по задатку и сделке;
- negative role cases СПН/юрист/брокер/менеджер;
- отдельная проверка, что маткапитал/сертификаты не попадают в broker scope;
- rollback для fixture schema;
- после matrix перейти к быстрому consultation intake.

Дальнейшая последовательность:

1. outcome/readiness fixtures и scenario matrix;
2. быстрый consultation intake;
3. отдельный блок корпоративных документов;
4. bounded task taxonomy и SLA;
5. controlled pilot;
6. authenticated mutation E2E после approval среды;
7. production rollout outcomes/readiness;
8. security hardening.

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
- Не менять production status guards до scenario matrix и authenticated tests.

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
- deal-card-lite DTO prototype;
- deals-list DTO prototype;
- outcome contract;
- non-mutating outcome preview;
- production cleanup без решения владельца.

## Команда следующего запуска

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #353. Сначала подготовь repository-only synthetic fixtures и scenario matrix для outcomes/readiness. Не применяй prototype SQL к production, не меняй status guards/roles/grants/RLS/Auth и не закрывай production-пункты автоматически.`
