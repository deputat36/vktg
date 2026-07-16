# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 2026-07-16.
- Репозиторий: `deputat36/vktg`.
- Production `main` перед текущим PR: `c8427ef3fa1cd50e8700dcd25cda314686a0793b` — squash merge PR #356.
- Supabase project: `ofewxuqfjhamgerwzull`.
- Последняя production migration: `20260716063401_nav_v2_correct_mortgage_broker_scope`.
- Production Supabase в PR #350–#356 и текущем consultation entity prototype не менялся.
- Edge Functions, Auth, production RLS и grants не менялись.

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
- `docs/NAV_V2_CONSULTATION_ENTITY_PROTOTYPE_2026-07-16.md` — серверная consultation entity и RPC lifecycle.

## Live baseline 16 июля 2026 года

- 5 активных профилей: owner, lawyer, 3 SPН;
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
- 4 автоматически ошибочно направленные карточки исправлены ограниченной production migration.

### PR #350–#354 — privacy, outcomes и readiness

- минимальный DTO списка сделок;
- evidence-only duplicate handling;
- двухэтапные исходы документов и рисков;
- frontend preview без mutation;
- outcome-aware readiness;
- 15 readiness, 14 role и 7 funding synthetic scenarios;
- production не менялся.

### PR #355 — закрыт без merge

Ранняя consultation-версия преждевременно меняла официальный role menu и была закрыта как superseded.

### PR #356 — быстрый consultation preview

- один экран минимальных фактов;
- структурированный текст для eChat;
- privacy guard для контактов, документов, кадастрового номера, ФИО и номера помещения;
- безопасный перенос в локальный draft полного мастера;
- брокер только для ипотеки/военной ипотеки;
- маткапитал и сертификаты без ипотеки остаются у СПН и юриста;
- официальный role menu и Supabase не менялись;
- CI и public desktop/mobile smoke зелёные;
- merge commit `c8427ef3fa1cd50e8700dcd25cda314686a0793b`.

## Текущая волна — consultation entity prototype

Repository-only SQL проектирует:

- `nav_consultations_v2`;
- append-only `nav_consultation_messages_v2`;
- append-only `nav_consultation_events_v2`;
- idempotent create;
- role-scoped list/card DTO;
- решения `answer`, `need_info`, `convert_to_preparation`;
- ответ СПН на уточнение;
- безопасный wizard draft;
- статус `converted` только после явной привязки созданной сделки;
- закрытие с причиной.

### Access model

- СПН — свои консультации;
- менеджер — консультации своей команды;
- юрист — неназначенная открытая очередь, назначенные и ранее обработанные им консультации;
- owner/admin — весь контур;
- broker — без доступа к юридической очереди;
- viewer — без доступа.

### Security model

- server-side privacy validation повторяет frontend guard;
- create принимает explicit allowlist полей;
- список не возвращает ответ, known facts и documents URL;
- карточка возвращает их только после проверки видимости;
- RLS включён, прямых policies нет: deny-by-default;
- direct table grants отсутствуют;
- все RPC и private helpers явно revoked у `PUBLIC`, `anon`, `authenticated`;
- production GRANT отсутствует.

### Conversion contract

`request_consultation_conversion` возвращает safe draft, но:

- не создаёт сделку;
- не создаёт задачи;
- не создаёт документы;
- не создаёт риски;
- не ставит `converted`.

Пользователь явно проходит существующий мастер. Bind RPC только связывает уже созданную доступную сделку.

## Принцип дальнейшей работы

Каждый создаваемый системой пункт обязан иметь полный lifecycle:

`триггер → владелец → срок → действие → evidence → предложение исхода → подтверждение → влияние на gate`

Автоматический backlog нельзя расширять без completion contract.

## Следующий безопасный slice после entity prototype

P0/P1 — executable PostgreSQL 17 harness в GitHub Actions без Supabase branch.

### Требования harness

- ephemeral PostgreSQL 17 service;
- stub `auth.uid()` и request JWT role;
- минимальные synthetic `nav_user_profiles`, `nav_deals_v2`, `nav_deal_events_v2` и private helpers;
- выполнение `supabase/prototypes/nav_v2_consultation_entity.sql`;
- проверка DDL, constraints, indexes, RLS и ACL;
- synthetic роли: owner, manager, два СПН, два юриста, broker, viewer;
- create/idempotency;
- list/card access matrix;
- `need_info → reply → new`;
- answer;
- convert request без deal/backlog;
- bind только после request и доступной сделки;
- broker/viewer denial;
- privacy rejections;
- matcap/certificate без broker scope;
- mortgage/военная ипотека с broker scope;
- transaction rollback или уничтожение service container после CI.

### После SQL harness

1. исправить все реальные SQL/ACL ошибки;
2. подготовить frontend RPC adapter repository-only;
3. authenticated application role/mutation E2E после approval среды;
4. отдельный deploy PR с минимальными grants;
5. только после deployment — официальный пункт меню;
6. отдельный блок корпоративных документов;
7. bounded task taxonomy и SLA;
8. controlled pilot;
9. security hardening.

## Ручные ограничения

- Issue #273: duplicate cleanup запрещён без решения владельца.
- Не менять назначения сотрудников без evidence и подтверждения владельца.
- Не очищать исторические строки автоматически.
- Не применять repository-only prototypes к production.
- Не создавать платную Supabase branch без согласования стоимости issue #282.
- Не считать skipped authenticated job доказательством ролей.
- Не менять production grants, RLS, Auth или Edge Functions без отдельного review/deploy slice.
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
5. approval стоимости preview branch для authenticated application E2E.

## Не повторять без новой причины

- общий технический аудит;
- аудит фактического процесса офиса;
- retirement viewer;
- сбор клиентских ФИО/телефонов в мастере;
- frontend read-layer masking;
- evidence-only duplicate handling;
- broker scope correction;
- deal-card-lite/deals-list DTO prototypes;
- outcome contract/preview/readiness/scenarios;
- раннюю PR #355;
- fast consultation preview;
- production cleanup без решения владельца.

## Команда следующего запуска

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после consultation entity prototype. Сначала создай executable PostgreSQL 17 CI harness для prototype SQL с synthetic Auth/roles/ACL/lifecycle tests. Не применяй SQL к production и не создавай платную Supabase branch.`
