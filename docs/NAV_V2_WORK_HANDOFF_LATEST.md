# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 2026-07-16.
- Репозиторий: `deputat36/vktg`.
- Production `main` перед текущим hardening PR: `6fa1e59c991739178c1dc7948ff4758ac40676bd`.
- Supabase project: `ofewxuqfjhamgerwzull`.
- Последняя production migration: `20260716063401_nav_v2_correct_mortgage_broker_scope`.
- Consultation preview, lifecycle prototype и hardening не применялись к production Supabase.
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
- отвечает на запрос уточнения;
- не принимает юридическое или ипотечное решение самостоятельно.

### Юрист

- принимает юридические решения;
- отвечает, запрашивает уточнение или рекомендует полную подготовку;
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
- видит consultation-запросы своей команды;
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
- `docs/NAV_V2_CONSULTATION_LIFECYCLE_PROTOTYPE_2026-07-16.md` — lightweight server lifecycle и hardening overlay.

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

В `main` добавлены repository-only:

- `nav_consultations_v2`;
- `nav_consultation_messages_v2`;
- create/list/detail/decision/clarification/close RPC;
- privacy guard;
- role matrix;
- conversion draft без сделки/backlog;
- fixtures, CI, docs и rollback.

Production Supabase не менялся.

## Текущая волна — consultation lifecycle hardening

Hardening overlay применяется после базового prototype только в будущих изолированных тестах.

### Исправления

1. `client_request_id` обязателен; create становится идемпотентным.
2. Unknown payload keys отклоняются explicit allowlist.
3. СПН получает role-scoped список только собственных активных консультаций.
4. Неназначенный юрист видит только открытые `new/need_info`, а не исторические `answered/closed/cancelled` карточки по UUID.
5. `convert_to_preparation` требует явный `conversion_mode=deposit|deal`.
6. Conversion draft не угадывает режим и не возвращает `unknown`.
7. Server privacy guard дополнительно блокирует возможные ФИО и расширенный unit-level pattern.
8. Effective ACL после base + overlay отзывает EXECUTE у authenticated; доступ остаётся только service_role для будущего isolated harness.
9. Production grants откладываются до отдельной deploy migration.

### Сохраняемые гарантии

- брокер не получает юридическую очередь;
- маткапитал/сертификат без ипотеки не включают broker route;
- document URL не хранится до решения владельца;
- сделка, задачи, документы и риски не создаются;
- полный мастер запускается только явным действием пользователя.

## Принцип дальнейшей работы

Каждый создаваемый системой пункт обязан иметь полный lifecycle:

`триггер → владелец → срок → действие → evidence → предложение исхода → подтверждение → влияние на gate`

Автоматический backlog нельзя расширять без completion contract.

## Следующий безопасный slice после hardening

P0/P1 — executable PostgreSQL 17 harness в GitHub Actions без Supabase branch.

### Harness должен

- запустить ephemeral PostgreSQL 17;
- создать stub `auth.uid()`, JWT role и минимальные `auth.users`;
- создать synthetic `nav_user_profiles` и тип `nav_v2_user_role`;
- применить base SQL, затем hardening overlay;
- проверить DDL, constraints, indexes, RLS и итоговые ACL;
- проверить create/idempotency и unknown-key rejection;
- проверить список СПН, менеджера, юриста и owner/admin;
- проверить broker/viewer denial;
- проверить прямой UUID-доступ неназначенного юриста к исторической карточке;
- проверить `need_info → clarification → new`;
- проверить answer и convert с обязательным `deposit/deal`;
- проверить отсутствие insert в deals/tasks/documents/risks;
- проверить privacy rejections;
- проверить broker routing по funding;
- уничтожить service container после CI.

### После harness

1. исправить реальные SQL/ACL ошибки;
2. подготовить repository-only frontend RPC adapter;
3. authenticated application E2E после approval среды;
4. отдельный deploy PR с объединённой migration и минимальными grants;
5. после deployment добавить официальный menu;
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
- production cleanup без решения владельца.

## Команда следующего запуска

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после consultation lifecycle hardening. Сначала создай executable PostgreSQL 17 CI harness, который применяет base SQL и hardening overlay по порядку и выполняет synthetic Auth/roles/ACL/lifecycle tests. Не применяй SQL к production и не создавай платную Supabase branch.`
