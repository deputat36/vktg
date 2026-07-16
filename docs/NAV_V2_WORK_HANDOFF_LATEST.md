# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 2026-07-16.
- Репозиторий: `deputat36/vktg`.
- Текущий production `main` перед documentation PR: `bf64bf4e8e2b8e434e95b0710a1d8c5e6e5c23e8` — squash merge PR #347.
- Supabase project: `ofewxuqfjhamgerwzull`.
- Последняя подтверждённая production migration: `20260715203158_nav_v2_minimize_client_identifiers`.
- Канонический source: `20260715224500_nav_v2_minimize_client_identifiers.sql`.
- Edge Functions после privacy-волн не менялись.
- Production Supabase в PR #347 не изменялся.

Counts могут меняться от реальной работы пользователей. Не откатывать данные только из-за изменения counts.

## Канонические продуктовые документы

- `docs/NAV_V2_FULL_AUDIT_2026-07-15.md` — технический, продуктовый и compliance-аудит.
- `docs/NAV_V2_AUTONOMOUS_EXECUTION_PLAN_2026-07-15.md` — автономные волны и ручные gates.
- `docs/NAV_V2_OFFICE_PROCESS_AUDIT_2026-07-16.md` — фактический процесс офиса, целевая роль продукта и уточнённый roadmap.

## Уточнённая цель продукта

Navigator — единая заявка на подготовку и диспетчер взаимодействия СПН, юриста, брокера и менеджера:

`вопрос/потребность → короткий сбор фактов → маршрутизация → план документов и условий → решение профильной роли → выполнение → подтверждение готовности → задаток/сделка → закрытие`

Navigator не является CRM, файловым архивом или автоматическим юристом.

Ключевой критерий пользы: инструмент должен требовать меньше ручных действий, чем бумажная карточка, устные консультации и разрозненная переписка вместе.

## Live read-only baseline 2026-07-16

- 5 активных профилей: owner, lawyer, 3 SPN.
- Активного manager и broker нет.
- 23 сделки:
  - 15 `draft`;
  - 3 `need_info`;
  - 2 `need_lawyer`;
  - по одной `need_documents`, `need_broker`, `ready_for_deposit`.
- 98 задач:
  - 92 `open`;
  - 6 `cancelled`;
  - 0 `in_progress`;
  - 0 `done`;
  - 90 открытых просрочены;
  - все 98 имеют `task_type = NULL`.
- 198 документов:
  - 182 `needed`;
  - 12 `received`;
  - 4 `checked`;
  - 125 `needed` просрочены.
- 53 риска:
  - 14 red;
  - 39 yellow;
  - разрешённых нет.
- 5 комментариев и 3 review-записи: team cycle начал использоваться, но не замкнут.
- 18 сделок без manager.
- 16 lawyer-needed без lawyer.
- 5 broker-needed без broker.
- 57 документов без назначенного пользователя или роли.
- За последние 14 дней: 2 события по 2 сделкам.

Вывод: не расширять юридический каталог, пока не доказано ежедневное закрытие пунктов.

## Завершённые последние волны

### PR #333–#334 — автономный план и task feedback

- зафиксированы продуктовые волны и ручные gates;
- закрыт первый клик permission/action flow задач;
- добавлены busy/success/error и desktop/mobile regression.

### PR #336–#337 — retirement viewer

- новое назначение роли `viewer` заблокировано;
- активных viewer-профилей нет;
- legacy enum/workspace сохранены только для совместимости.

### PR #338–#340 — минимизация новых данных

- мастер больше не собирает ФИО и телефоны клиентов;
- browser draft и save payload очищаются;
- public save wrapper и table guard защищают новые записи;
- свободный ввод блокирует явные чувствительные форматы;
- исторические строки физически не очищались.

### PR #341–#342 — frontend read-layer

- RPC-ответы минимизируются до кэширования, поиска и рендера;
- клиентские structured identifiers удалены;
- заголовки заменены нейтральной ссылкой;
- unit-level address скрывается;
- исторический рабочий текст маскируется при чтении.

### PR #343–#346 — release baseline и DTO inventory

- baseline синхронизирован с live migration history;
- проинвентаризированы ключевые read RPC;
- подготовлен repository-only explicit DTO prototype для `nav_v2_get_deal_card_lite`;
- handoff обновлён после prototype wave;
- Supabase не менялся.

### PR #347 — evidence-only duplicate handling

- frontend больше не строит duplicate key из адреса, заголовка, ФИО, телефонов, свободного текста и суммы;
- группировка возможна только при явном `exact_duplicate_group_id`;
- при отсутствии server evidence каждая карточка остаётся самостоятельной;
- demo filtering и closed-status filtering остаются отдельными;
- обновлены dashboard/work-mode regressions;
- добавлена отдельная evidence-only regression и CI;
- все обязательные проверки зелёные;
- review threads отсутствовали;
- Supabase и production-строки не менялись.

## Принцип следующих работ

Каждый создаваемый системой пункт обязан иметь полный lifecycle:

`триггер → владелец → срок → действие → evidence → исход → влияние на gate`

Автоматический backlog нельзя расширять без completion contract.

## Следующий безопасный slice

P0/P1 — repository-only explicit DTO prototype для `nav_v2_get_deals_list`.

### DTO должен сохранить

- профиль текущего сотрудника;
- идентификатор и нейтральную ссылку на сделку;
- безопасный display label без client PII и unit-level address;
- статус, risk level и object type;
- readiness для задатка и сделки;
- counts рисков, задач и документов;
- deadlines и last activity;
- признаки lawyer/broker need;
- ФИО и роли сотрудников;
- безопасный факт наличия следующего действия без исходного свободного текста;
- явный server duplicate evidence, если он будет формально определён.

### DTO не должен возвращать

- клиентские ФИО и телефоны;
- исходный legacy title;
- полный свободный текст следующего действия;
- `wizard_snapshot`;
- `deal_summary` целиком;
- full-row serialization;
- unit-level address;
- комментарии, reviews и документы целиком.

### Порядок

1. Найти все frontend consumers `nav_v2_get_deals_list`.
2. Составить consumer matrix.
3. Зафиксировать JSON contract и allowlist.
4. Подготовить SQL в `supabase/prototypes`, не в migrations.
5. Сохранить public signature и текущую ролевую семантику.
6. Добавить checker, fixtures и rollback notes.
7. Не применять prototype к production.
8. После prototype вернуться к process closure: terminal document/risk states и task taxonomy.

## Ближайшие продуктовые волны после DTO

1. Быстрый consultation intake без полного мастера.
2. Terminal/exception states документов и рисков.
3. Отдельный блок корпоративных документов клиента.
4. Структурированный цикл решения юриста и повторной передачи СПН.
5. Bounded task taxonomy, SLA, evidence и deduplication.
6. Controlled pilot на 10–15 реальных кейсах.
7. Authenticated role/mutation E2E на платной preview branch после approval.
8. Security hardening после E2E.
9. Versioned legal rule registry и отдельный ПОД/ФТ-контур при применимости.

## Ручные ограничения

- Issue #273: duplicate cleanup запрещён без решения владельца.
- Не менять `seller_spn_id`, `buyer_spn_id`, `manager_id`, `lawyer_id`, `broker_id` без evidence и подтверждения владельца.
- Исторические значения физически не очищать автоматически.
- Operational pilot mutation запрещена без evidence-пакета и состава пилота.
- Платную Supabase branch не создавать без явного согласования стоимости issue #282.
- Не считать skipped authenticated job доказательством ролей.
- Не применять repository-only prototypes к production.
- Не менять grants, RLS, Auth или Edge Functions без отдельного review/deploy slice.
- Не хранить сканы документов в Navigator.
- Не выдавать автоматическую маршрутизацию за юридическое заключение.
- Не использовать сырые pilot metrics для оценки сотрудников.

## Decision gates владельца

Отложить до момента, когда они блокируют соответствующую волну:

1. кто является manager в controlled pilot;
2. какие 10–15 кейсов и сотрудники входят в пилот;
3. применяется ли отдельный ПОД/ФТ-контур и кто его владелец;
4. подтверждение Яндекс Диска или другого источника документов и retention rules;
5. approval стоимости preview branch для authenticated E2E.

## Не повторять без новой причины

- общий технический аудит;
- общий аудит фактического процесса офиса;
- task feedback;
- retirement viewer;
- сбор ФИО/телефонов в мастере;
- input guard;
- frontend read-layer masking;
- historical text masking;
- RPC privacy inventory;
- deal-card-lite DTO prototype;
- evidence-only frontend duplicate handling;
- production cleanup без решения владельца.

## Команда следующего запуска

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #347. Сначала подготовь repository-only explicit DTO prototype для nav_v2_get_deals_list с consumer matrix, contract, checker и rollback notes. Не применяй prototype к production, не меняй роли и не очищай production-строки.`
