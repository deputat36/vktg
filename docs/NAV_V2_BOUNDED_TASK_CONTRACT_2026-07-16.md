# Navigator v2 — bounded task contract v2

Дата: 16 июля 2026 года.

Статус: repository-only prototype. Production Supabase и существующие задачи не изменены.

## Проблема

В live-срезе 98 задач. Все строки имеют пустые `task_type` и `sla_days`. Большинство созданы автоматическими источниками:

- проверки ФИО и адреса;
- согласование расчётов и расходов;
- передача юристу;
- детские и долевые сценарии;
- ипотечный маршрут.

Старый preview делил их на широкие категории `operational_task`, `quality_warning`, `system_recommendation`, `legal_blocker` и `broker_task`.

Эти категории описывают происхождение или важность, но не отвечают на вопросы:

- что конкретно нужно сделать;
- кто владелец;
- когда срок;
- как понять, что готово;
- какое evidence подтверждает завершение;
- какой gate затрагивается;
- что делать при ожидании внешней стороны.

## Полный контракт задачи

Каждая v2-задача должна иметь:

`тип → владелец → SLA/срок → критерий завершения → evidence → gate scope → outcome`

Поля nullable, поэтому старые задачи остаются без изменений до явного пересмотра.

## 10 типов задач

### `document_request`

Запросить документ у клиента или внешней стороны.

- владелец: СПН или менеджер;
- SLA: 2 дня, максимум 5;
- критерий: `document_received`;
- evidence: статус документа, внешнее подтверждение или ссылка на рабочий комментарий;
- базовый scope: задаток.

### `document_check`

Проверить уже полученный документ.

- владелец зависит от контура: СПН, юрист, брокер или менеджер;
- SLA: 1 день, максимум 3;
- критерий: `document_checked`;
- evidence: статус документа или professional review.

### `term_approval`

Согласовать условие, расходы или порядок расчётов.

- владелец: СПН или менеджер;
- SLA: 2 дня, максимум 5;
- критерий: `terms_confirmed`;
- evidence: структурированный статус согласования или рабочий комментарий.

### `legal_decision`

Получить решение юриста.

- владелец: только юрист;
- SLA: 1 день, максимум 3;
- критерий: `legal_decision_recorded`;
- evidence: review decision;
- менеджер не может закрыть эту задачу вместо юриста.

### `financial_decision`

Получить ипотечное решение в зоне брокера.

- владелец: только ипотечный брокер;
- SLA: 2 дня, максимум 5;
- критерий: `financial_decision_recorded`;
- evidence: review или внешнее подтверждение банка;
- маткапитал и сертификат без ипотеки не создают такую задачу.

### `corporate_document_signing`

Получить подпись на корпоративном документе.

- владелец: СПН или менеджер;
- SLA: 3 дня, максимум 7;
- критерий: `corporate_document_signed`;
- evidence: статус отдельного корпоративного документа;
- scope: corporate.

### `card_correction`

Исправить конкретное поле карточки.

- владелец: СПН или менеджер;
- SLA: 1 день, максимум 3;
- критерий: `card_fields_corrected`;
- evidence: повторная card validation;
- заменяет широкие `quality_warning`.

### `contract_preparation`

Подготовить договор сделки.

- владелец: только юрист;
- SLA: 2 дня, максимум 5;
- критерий: `contract_draft_ready`;
- evidence: contract reference или review decision.

### `appointment_scheduling`

Назначить встречу, задаток, сделку или подписание.

- владелец: СПН или менеджер;
- SLA: 2 дня, максимум 5;
- критерий: `appointment_confirmed`;
- evidence: календарное событие или внешнее подтверждение.

### `post_deal_action`

Выполнить действие после сделки.

- владелец: СПН или менеджер;
- SLA: 3 дня, максимум 10;
- критерий: `post_deal_action_confirmed`;
- evidence: внешнее подтверждение, комментарий или корпоративный документ;
- scope: post-deal.

## Что больше не является типом задачи

- `operational_task` — слишком общий;
- `quality_warning` — это `card_correction` либо информационная подсказка;
- `system_recommendation` — рекомендация не создаёт задачу без полного контракта;
- `legal_blocker` — blocker является состоянием риска или review, а работа оформляется как `legal_decision`, `document_request` или `contract_preparation`;
- `broker_task` — заменяется конкретным `financial_decision`;
- `management_escalation` — эскалация является состоянием контроля, а не работой сама по себе.

## SLA

`due_date` остаётся явным рабочим сроком.

`sla_days` задаёт норматив и не должен автоматически переписывать согласованную дату. Значение ограничено максимальным SLA типа.

Urgent priority не разрешает удалить completion criterion или evidence.

## Evidence

Task row не хранит свободный текст доказательства, URL или клиентские данные.

Разрешены только категории evidence и UUID исходной сущности:

- document status;
- review decision;
- agreement status;
- corporate document status;
- card validation;
- contract reference;
- calendar event;
- external confirmation;
- comment reference.

Содержимое остаётся в исходной сущности с её собственными правами доступа.

## Завершение

Обычное завершение требует одновременно:

- `status=done`;
- `completed_by`;
- `completed_at`;
- evidence kind;
- `evidence_confirmed_at`;
- `outcome_code=completed`;
- `outcome_state=confirmed`.

Простого нажатия «Готово» без evidence недостаточно.

## Исключительные outcomes

### Терминальные после подтверждения

- `not_applicable`;
- `replaced` — требуется replacement task ID;
- `cancelled`.

### Активные

- `waiting_external`;
- `deferred`.

Они не закрывают задачу и требуют `outcome_review_date`, чтобы ожидание не стало бессрочным.

## Legacy suggestions

Read-only preview предлагает только очевидные соответствия:

- `auto_quality_*` → `card_correction`;
- `auto_settlements/auto_expenses` → `term_approval`;
- `auto_lawyer/auto_children/auto_share_lawyer` → `legal_decision`;
- `auto_broker` → `financial_decision`.

Даже high-confidence suggestion требует подтверждения. Неизвестные источники получают `manual_review`.

Prototype не выполняет backfill 98 существующих задач.

## Privacy-safe preview

Preview не возвращает:

- title и description задачи;
- адрес;
- ФИО или телефоны клиентов;
- свободный текст evidence;
- URL документов.

Используется нейтральная ссылка `Сделка XXXXXXXX` и машинные поля контракта.

## Что не меняется

- существующие 98 строк;
- readiness сделки;
- risk gates;
- deal status;
- назначения и due dates;
- Auth, Edge Functions и production RLS/grants.

## Следующий mutation slice

После утверждения контракта:

1. explicit create/update task contract;
2. role validation по типу;
3. SLA validation;
4. evidence attachment;
5. active waiting/deferred review date;
6. proposed terminal exception;
7. manager/professional confirmation по scope;
8. audit event;
9. никакого массового backfill.

## Production gate

До production нужны:

1. authenticated role/mutation E2E;
2. проверка каждого типа и запрещённой роли;
3. completion evidence tests;
4. outcome transition tests;
5. controlled legacy review без автоматического назначения;
6. Security Advisor review;
7. rollback validation;
8. отдельный deploy PR.

## Rollback

Пока SQL находится в `supabase/prototypes`, rollback — удалить prototype, contract, fixtures, checker, workflow и документацию.

После тестового развёртывания rollback должен удалить новые nullable columns/functions/constraints и подтвердить, что исходные задачи не изменились.
