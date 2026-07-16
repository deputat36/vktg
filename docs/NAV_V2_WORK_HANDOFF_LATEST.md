# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 2026-07-16.
- Репозиторий: `deputat36/vktg`.
- Production `main` перед текущим harness PR: `8c9e6d1a8ef359fb0ee0f51edaccc596562ea480` — squash merge PR #360.
- Supabase project: `ofewxuqfjhamgerwzull`.
- Последняя production migration: `20260716063401_nav_v2_correct_mortgage_broker_scope`.
- Consultation preview, lifecycle prototype, hardening и PostgreSQL harness не применялись к production Supabase.
- Edge Functions, Auth, production RLS, status guards и назначения сотрудников не менялись.

Counts могут меняться от реальной работы пользователей. Не откатывать данные только из-за изменения counts.

## Цель продукта

Navigator — единая заявка на подготовку и диспетчер взаимодействия СПН, юриста, ипотечного брокера и менеджера:

`вопрос/потребность → короткий сбор фактов → маршрутизация → план документов и условий → решение профильной роли → выполнение → подтверждение готовности → задаток/сделка → закрытие`

Navigator не является CRM, файловым архивом или автоматическим юристом. Инструмент должен требовать меньше ручных действий, чем бумажная карточка, устные консультации и разрозненная переписка вместе.

## Границы ролей

### СПН

- фиксирует факты, условия и договорённости;
- создаёт короткий юридический запрос;
- видит свои консультации;
- отвечает на уточнение юриста;
- явно запускает полный мастер после решения `convert_to_preparation`;
- не принимает юридическое или ипотечное решение самостоятельно.

### Юрист

- принимает юридические решения;
- отвечает, запрашивает уточнение или рекомендует полную подготовку;
- выбирает режим полной подготовки: `deposit` или `deal`;
- определяет stop-факторы;
- готовит договорные документы и подтверждает готовность к задатку/сделке.

### Ипотечный брокер

- консультирует клиента и СПН по ипотеке;
- подбирает ипотечную программу;
- помогает получить одобрение банка;
- обучает СПН ипотечным сценариям.

Маткапитал, сертификаты, правовая и расчётная схема, подготовка и оформление ипотечной сделки относятся к СПН и юристу. При сочетании ипотеки с маткапиталом или сертификатом брокер ведёт только ипотечную часть.

### Менеджер

- помогает новичкам;
- видит консультации своей команды;
- контролирует зависшие процессы;
- не заменяет юриста или брокера.

### Owner/admin

- видит весь контур;
- принимает исключительные решения с аудитом;
- утверждает deployment, document-source policy и pilot.

## Канонические документы

- `docs/NAV_V2_FULL_AUDIT_2026-07-15.md` — технический и compliance-аудит.
- `docs/NAV_V2_AUTONOMOUS_EXECUTION_PLAN_2026-07-15.md` — автономные волны и gates.
- `docs/NAV_V2_OFFICE_PROCESS_AUDIT_2026-07-16.md` — фактический процесс офиса.
- `docs/NAV_V2_MORTGAGE_BROKER_SCOPE_2026-07-16.md` — зона ответственности ипотечного брокера.
- `docs/NAV_V2_WORK_ITEM_OUTCOME_CONTRACT_2026-07-16.md` — исходы документов и рисков.
- `docs/NAV_V2_OUTCOME_READINESS_PROTOTYPE_2026-07-16.md` — outcome-aware readiness.
- `docs/NAV_V2_OUTCOME_READINESS_SCENARIOS_2026-07-16.md` — synthetic matrix readiness.
- `docs/NAV_V2_FAST_CONSULTATION_INTAKE_2026-07-16.md` — быстрый frontend preview.
- `docs/NAV_V2_CONSULTATION_LIFECYCLE_PROTOTYPE_2026-07-16.md` — server lifecycle и hardening overlay.
- `docs/NAV_V2_CONSULTATION_SERVER_ADAPTER_2026-07-16.md` — transport-free frontend adapter.
- `docs/NAV_V2_CONSULTATION_POSTGRES_HARNESS_2026-07-16.md` — executable PostgreSQL 17 harness.

## Live baseline 16 июля 2026 года

- 5 активных профилей: owner, lawyer, 3 СПН;
- активного manager и broker нет;
- 23 сделки;
- 98 задач, большинство открыты и просрочены, `task_type` не заполнен;
- 198 документов: 182 `needed`, 12 `received`, 4 `checked`;
- 53 риска: после PR #349 — 49 открыты и 4 закрыты.

Не использовать сырые показатели для оценки сотрудников: в данных могут быть тестовые, учебные и исторические записи.

## Завершённые волны

### PR #349 — правильная роль брокера

- broker route только для ипотеки/военной ипотеки;
- маткапитал и сертификаты не направляются брокеру без ипотеки;
- ошибочные автоматические маршруты исправлены ограниченной production migration.

### PR #350–#354 — privacy, outcomes и readiness

- минимальные DTO;
- evidence-only duplicate handling;
- двухэтапные исходы документов/рисков;
- outcome-aware readiness;
- role, funding и readiness fixtures;
- production не менялся.

### PR #355 — закрыт без merge

Ранняя consultation-версия преждевременно меняла production role menu.

### PR #356 — safe fast consultation preview

- один экран минимальных фактов;
- структурированная передача юристу;
- privacy guard;
- безопасный локальный draft полного мастера;
- broker только при ипотеке;
- официальный menu и Supabase не менялись;
- merge commit `c8427ef3fa1cd50e8700dcd25cda314686a0793b`.

### Commit `6fa1e59…` — lightweight consultation lifecycle prototype

Repository-only добавлены:

- `nav_consultations_v2`;
- `nav_consultation_messages_v2`;
- create/list/detail/decision/clarification/close RPC;
- role matrix;
- conversion draft без сделки/backlog;
- fixtures, CI, docs и rollback.

### Commit `a32d03f…` — consultation server adapter

- transport-free payload preview;
- queue/detail DTO minimization;
- decision and conversion presentation models;
- frontend показывает готовность payload, но не вызывает undeployed RPC;
- production Supabase не менялся.

### PR #360 — consultation lifecycle hardening

- create стал идемпотентным через обязательный `client_request_id`;
- unknown payload keys отклоняются;
- СПН получает только собственный список;
- неназначенный юрист видит только открытые `new/need_info`;
- `convert_to_preparation` требует `conversion_mode=deposit|deal`;
- server privacy дополнительно блокирует возможные ФИО и расширенный unit-level pattern;
- authenticated EXECUTE отложен до отдельной deploy migration;
- effective prototype доступен только service_role для isolated harness;
- merge commit `8c9e6d1a8ef359fb0ee0f51edaccc596562ea480`.

## Текущая волна — executable PostgreSQL 17 harness

Harness запускает одноразовую PostgreSQL 17 базу в GitHub Actions.

### Порядок

`synthetic setup → base SQL → hardening overlay → assertions → rollback rehearsal`

### Synthetic окружение

- роли `anon`, `authenticated`, `service_role`;
- stub `auth.uid()`;
- enum `nav_v2_user_role`;
- synthetic owner/admin, два менеджера, два СПН, два юриста, broker и viewer;
- пустые marker tables deals/tasks/documents/risks;
- production данные не копируются.

### Проверяемые гарантии

- DDL, columns, constraints, indexes и RLS реально выполняются;
- старая трёхаргументная decide-функция удалена;
- authenticated не имеет table access или RPC EXECUTE;
- service_role может выполнять isolated harness;
- create и повторный create работают идемпотентно;
- unknown payload и client identifiers отклоняются;
- СПН видит только собственные консультации;
- менеджер видит только свою команду;
- юрист видит открытую очередь и назначенные ему карточки;
- broker/viewer не получают юридический доступ;
- `need_info → clarification → new` работает;
- `answer` работает;
- convert требует явный `deposit/deal`;
- conversion draft не создаёт deal/backlog;
- deals/tasks/documents/risks остаются пустыми;
- rollback удаляет consultation tables/functions и не затрагивает marker tables.

## Принцип дальнейшей работы

Каждый создаваемый системой пункт обязан иметь полный lifecycle:

`триггер → владелец → срок → действие → evidence → предложение исхода → подтверждение → влияние на gate`

Автоматический backlog нельзя расширять без completion contract.

## Следующий безопасный slice после harness

Если harness выявит реальные ошибки — сначала исправить base/hardening и повторить тесты.

После зелёного harness:

1. синхронизировать frontend adapter с обязательным `client_request_id`;
2. добавить presentation/validation для четырёхаргументного decide RPC и `conversion_mode`;
3. подготовить transport layer, но оставить RPC-вызовы выключенными до deployment;
4. провести authenticated application E2E после approval среды;
5. подготовить объединённую production migration с минимальными grants;
6. выполнить Supabase Advisor review и rollback rehearsal;
7. только после deployment добавить официальный пункт меню;
8. отдельный блок корпоративных документов;
9. bounded task taxonomy и SLA;
10. controlled pilot.

## Ручные ограничения

- Issue #273: duplicate cleanup запрещён без решения владельца.
- Не менять назначения сотрудников без evidence и подтверждения владельца.
- Не очищать исторические строки автоматически.
- Не применять repository-only prototypes к production.
- Не создавать платную Supabase branch без согласования стоимости issue #282.
- Не считать skipped authenticated job доказательством ролей.
- Не менять production grants, RLS, Auth или Edge Functions без отдельного deploy slice.
- Не хранить сканы документов в Navigator.
- Не выдавать автоматическую маршрутизацию за юридическое заключение.
- Не использовать сырые pilot metrics для оценки сотрудников.
- Не менять production status guards до authenticated tests.

## Decision gates владельца

Отложить до момента, когда они блокируют соответствующую волну:

1. кто является manager controlled pilot;
2. какие 10–15 кейсов и сотрудники входят в пилот;
3. применяется ли отдельный ПОД/ФТ-контур и кто его владелец;
4. утверждённые document source domains и retention rules;
5. approval стоимости Supabase preview branch для authenticated application E2E.

## Не повторять без новой причины

- общий технический аудит;
- аудит фактического процесса;
- broker scope correction;
- DTO/privacy masking;
- outcome/readiness prototypes;
- early PR #355;
- fast consultation preview;
- lightweight consultation lifecycle base;
- consultation lifecycle hardening;
- production cleanup без решения владельца.

## Команда следующего запуска

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PostgreSQL consultation harness. Сначала исправь все фактические ошибки harness. После зелёного CI синхронизируй transport-free frontend adapter с client_request_id и четырёхаргументным decide RPC, не включая production transport и не применяя SQL к Supabase.`
