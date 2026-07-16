# Navigator v2 — consultation server adapter

Дата: 16 июля 2026 года.

Статус: repository-only consumer contract. Production RPC не вызываются, consultation SQL не применён к production Supabase.

## Задача

Fast consultation preview и серверный consultation lifecycle проектировались раздельно. Adapter связывает их без включения сетевого transport:

`форма СПН → проверенный idempotent create payload → preview nav_v2_create_consultation`

`queue response → минимизированная очередь сотрудника`

`detail response → карточка консультации и сообщения`

`решение юриста → preview nav_v2_decide_consultation(uuid, text, text, text)`

`convert_to_preparation → безопасный draft полного мастера`

Adapter не вызывает RPC, не обращается к таблицам и не меняет production role menu.

## Идемпотентный create

Hardening SQL требует `client_request_id` типа UUID. Это защищает от повторного создания консультации при двойном клике, повторной отправке или сетевом retry.

Страница:

- создаёт UUID через `crypto.randomUUID()`;
- хранит его только в `sessionStorage` текущей вкладки;
- повторно использует тот же UUID для одного заполненного запроса;
- меняет UUID после явного нажатия «Очистить»;
- не отправляет UUID или другие данные в сеть.

`consultationClientRequestId` принимает только UUID и приводит буквенные символы к нижнему регистру.

`consultationServerPayloadPreview` возвращает:

- `payload` с обязательным `client_request_id`;
- `rpc_preview.name = nav_v2_create_consultation`;
- точные аргументы `{ p_payload: payload }`;
- `server_ready=false`, если UUID отсутствует или повреждён;
- `idempotency_key_present=true` для корректного запроса.

Это только описание будущего вызова. Реального RPC-вызова нет.

## Create payload

Allowlist payload:

- `client_request_id`;
- `question`;
- `request_type`;
- `representation_model`;
- `object_type`;
- `safe_reference`;
- `stage`;
- `funding_sources`;
- `circumstances`;
- `planned_event_date`;
- `has_external_documents`.

Adapter повторно использует frontend privacy validation, нормализует сторону, стадию и источник средств, включает известные факты и точные формулировки обстоятельств в текст вопроса.

URL не входит в server payload. Даже при локальной ссылке для передачи в eChat сохраняется только `has_external_documents`.

ФИО, телефоны, email, паспортные данные, кадастровые номера, точный адрес, номер помещения и произвольные snapshot-поля не передаются.

## Известные факты и обстоятельства

Server prototype не имеет отдельного поля `known_facts`, поэтому adapter формирует один безопасный текст:

- конкретный вопрос;
- известные факты;
- точные особые обстоятельства;
- исходная стадия.

Общий лимит — 4000 символов. Текст не обрезается автоматически.

Для фильтрации используются укрупнённые категории:

- детские сценарии → `children`;
- супруг или супруга → `other`.

Точная формулировка остаётся в вопросе, поэтому юридически важный факт не теряется.

## Queue DTO

`minimizeConsultationQueueResponse` использует explicit allowlist server contract.

Разрешены нейтральная ссылка, статус, тип запроса, стадия, сторона, объект, источники средств, количество обстоятельств, плановая дата, наличие внешних документов, сотрудники, счётчики, возраст, приоритет и ближайшее действие.

Не разрешены вопрос, сообщения, safe reference, URL, клиентские идентификаторы, snapshot и произвольные серверные поля.

СПН после hardening получает только собственные консультации. Менеджер — только команду. Юрист — открытую очередь и назначенные ему карточки. Broker и viewer не получают юридическую очередь.

## Detail DTO

`minimizeConsultationDetailResponse` отдельно разрешает:

- профиль текущего сотрудника;
- метаданные консультации;
- role-aware permissions;
- сообщения;
- conversion draft;
- `conversion_mode`.

Conversion draft дополнительно содержит только серверные гарантии `creates_deal` и `creates_backlog`. Клиентские идентификаторы отбрасываются.

## Решение юриста

Hardening заменяет старую трёхаргументную функцию на:

`nav_v2_decide_consultation(p_consultation_id, p_decision, p_body, p_conversion_mode)`

`consultationDecisionRpcPreview` проверяет точные будущие аргументы:

- `consultation_id` — UUID;
- `decision` — `answer`, `need_info` или `convert_to_preparation`;
- текст — от 10 до 4000 символов;
- `p_conversion_mode` обязателен только для `convert_to_preparation`;
- допустимые режимы — `deposit` или `deal`;
- для обычного ответа и запроса уточнения `p_conversion_mode` должен быть `null`.

Результат содержит только RPC preview и `transport_enabled=false`.

## Преобразование в полный мастер

`consultationConversionToWizardDraft` принимает draft только когда:

- `preparation_mode` равен `deposit` или `deal`;
- `creates_deal=false`;
- `creates_backlog=false`.

Если серверный ответ утверждает автоматическое создание сделки или backlog, adapter возвращает `null`.

В мастер переносятся только режим, сторона, тип объекта, источники средств, допустимые флаги, safe reference, плановая дата, признак внешних документов и ID консультации.

ФИО, телефоны и URL документов не добавляются.

## Frontend preview

Страница показывает:

- готовность будущего payload;
- наличие стабильного локального ключа повтора;
- что URL не сохранится;
- что сделка, задачи, документы и риски не создаются;
- что данные никуда не отправляются.

Кнопка «Очистить» создаёт новый idempotency key. Обычное редактирование и повторное формирование сохраняют прежний ключ.

## Synthetic scenarios

Schema version 2 проверяет:

- 6 create payload cases;
- корректный, uppercase, отсутствующий и повреждённый UUID;
- повторный preview с тем же UUID;
- queue/detail allowlist;
- 4 допустимых решения юриста;
- отсутствие conversion mode;
- conversion mode у обычного ответа;
- неверный consultation UUID;
- слишком короткий текст;
- безопасный conversion draft;
- запрет draft с `creates_deal=true`;
- запрет draft с `creates_backlog=true`;
- запрет неизвестного режима.

## Production gate

До подключения transport обязательны:

1. PostgreSQL 17 harness base → hardening должен оставаться зелёным;
2. отдельная deploy migration, объединяющая итоговый SQL;
3. минимальные grants только проверенным ролям;
4. authenticated role/mutation E2E;
5. negative privacy tests через реальный Supabase client;
6. подтверждение queue/detail DTO реальными ответами;
7. решение владельца по document URL и retention rules;
8. Security Advisor review;
9. отдельный deploy PR;
10. только затем официальный menu и transport.

## Rollback

До production deploy rollback состоит из удаления:

- hardening-функций adapter;
- локального `client_request_id` из preview;
- schema v2 fixtures и regression;
- cache-bust страницы;
- обновлённого checker и документации.

Rollback не затрагивает сделки, существующий локальный eChat handoff или production Supabase.
