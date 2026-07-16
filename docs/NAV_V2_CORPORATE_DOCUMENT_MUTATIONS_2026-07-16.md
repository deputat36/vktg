# Navigator v2 — mutation contract корпоративных документов

Дата: 16 июля 2026 года.

Статус: repository-only prototype. Production Supabase не изменён.

## Цель

Корпоративные документы уже отделены от документов объекта и юридической проверки. Этот slice добавляет будущий управляемый lifecycle записи:

`явный выбор документа → назначение и срок → подготовка → отправка на подпись → подтверждение подписи → завершение`

Исключительный путь:

`предложение причины → решение менеджера/owner/admin → подтверждённое завершение или возврат в работу`

Mutation prototype не меняет юридическую готовность, риск-гейты и статус сделки. Он не создаёт задачи и не добавляет строки без явного выбора пользователя.

## Явная инициализация

`nav_v2_initialize_corporate_documents` принимает:

- ID сделки;
- JSON-массив от 1 до 8 выбранных документов;
- обязательный `client_request_id` UUID.

Автоматическая инициализация запрещена. Preview из базового corporate contract остаётся только рекомендацией; пользователь должен подтвердить конкретные строки.

СПН может инициализировать документы только своей представляемой стороны. Менеджер, owner и admin могут работать в доступной им сделке. Lawyer, broker и viewer не получают mutation-доступ.

Назначение ограничено реальной ответственностью сделки:

- ответственный СПН обязан совпадать с `seller_spn_id` или `buyer_spn_id` выбранной стороны;
- ответственный менеджер обязан совпадать с `deal.manager_id`;
- owner/admin должны быть активными профилями соответствующей роли;
- назначение стороннему СПН запрещено.

## Идемпотентность

Каждая mutation требует уникальный `client_request_id`.

Audit event сохраняет итоговый result payload. Повтор того же запроса возвращает сохранённый результат с `idempotent_replay=true` и не создаёт вторую строку или событие.

Если тот же UUID пытаются использовать для mutation другого типа, сервер возвращает явную ошибку. Это защищает от случайного смешивания операций.

## Операционные статусы

Допустимые переходы:

- `planned → planned / prepared / problem`;
- `prepared → prepared / sent_for_signature / problem`;
- `sent_for_signature → sent_for_signature / signed / problem`;
- `problem → problem / planned / prepared / sent_for_signature`;
- `signed` и `cancelled` терминальные.

Прямой переход в `cancelled` запрещён. Для отмены используется подтверждённый outcome.

## Evidence

Переходы требуют конкретного подтверждения:

- `prepared` — код и версия шаблона;
- `sent_for_signature` — `paper` или `online`;
- `signed` — внешний признак подтверждения подписи;
- `problem` — конкретная problem note.

Изображения подписей, сканы и document URL не хранятся.

## Privacy

Свободные тексты mutation проходят server privacy guard. Блокируются email, телефон, паспорт, СНИЛС, кадастровый номер, номер помещения, возможное полное ФИО и длинный платёжный номер.

Payload использует explicit allowlist. Неизвестные поля отклоняются.

## Двухэтапные исключения

СПН, менеджер, owner или admin могут предложить:

- `not_applicable`;
- `replaced`;
- `cancelled`.

Причина обязательна. `replaced` требует ID другого корпоративного документа той же сделки.

Только manager, owner или admin могут принять решение:

- `confirmed` — документ завершён исключением;
- `rejected` — документ остаётся активным.

СПН не может подтвердить собственное исключение.

## Audit trail

`nav_deal_corporate_document_events_v2` хранит тип события, сделку и документ, сотрудника и роль, `client_request_id`, before/after state, безопасный result payload и время.

Прямой доступ к таблице закрыт. В repository-only состоянии mutation RPC доступны только `service_role` для isolated harness.

## Separation guarantees

Corporate mutation:

- не меняет `nav_deal_documents_v2`;
- не меняет `nav_deal_tasks_v2`;
- не меняет `nav_deal_risks_v2`;
- не меняет `nav_deals_v2.status`;
- не меняет юридическую готовность;
- не создаёт задачи;
- не создаёт полный backlog;
- не хранит данные клиента.

## PostgreSQL 17 harness

GitHub Actions поднимает одноразовую PostgreSQL 17 базу и выполняет:

1. synthetic Auth, роли, профили и сделки;
2. base corporate SQL;
3. index amendment;
4. mutation overlay;
5. реальные ACL, role, lifecycle, evidence, privacy, idempotency и separation assertions;
6. Rollback rehearsal.

Проверяются seller/buyer SPN, manager, lawyer, broker, viewer и сторонняя команда. Production данные не копируются. Платная Supabase branch не создаётся.

## Production gate

До deployment обязательны:

1. зелёный PostgreSQL 17 harness;
2. office policy по обязательности и стадиям документов;
3. утверждённый registry шаблонов и версий;
4. authenticated role/mutation E2E в изолированной среде;
5. Security Advisor review;
6. объединённая migration без base/amendment/overlay drift;
7. минимальные grants;
8. отдельный deploy PR;
9. только после deploy — UI transport и официальные routes.

## Rollback

Repository Rollback удаляет четыре mutation RPC, private mutation helpers, audit event table, harness, fixtures, checker, workflow и документацию.

Базовая corporate table, preview/readiness RPC и существующие сделки сохраняются. Production Supabase не затрагивается.
