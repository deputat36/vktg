# Navigator v2: server adapter новой анкеты v1

Дата: 18 июля 2026 года.

Статус: repository-only prototype. Production Supabase не изменён, миграция не создана, публичный RPC не добавлен.

## Результат

SQL-прототип `nav_v2_private.nav_v2_prepare_intake_save_v1(jsonb)` принимает versioned envelope новой анкеты и заново вычисляет на сервере:

- совпавшие правила из канонического каталога;
- маршрут к юристу и ипотечному брокеру;
- юридический паспорт v1;
- документы только сопровождаемой стороны;
- кандидаты задач без выдуманного исполнителя;
- gates черновика, карточки и handoff юристу.

Адаптер возвращает `prepared_payload`, который в будущем можно передать существующему save lifecycle после отдельного production approval. Сам прототип не вызывает legacy save, не меняет таблицы и всегда сообщает `writes_performed: false`.

## Trust boundary

Доверенным источником является `config/nav-v2-intake-contract-v1.json`: 25 правил, 31 тип документа и version `2026-07-17.1`. Генератор минимизирует JSON, считает SHA-256 и встраивает обе величины в SQL. CI сравнивает rendered SQL с каноническим файлом побайтно на уровне JSON и хэша.

Клиенту не доверяются `legal_passport`, `intake_work_plan`, маршрут специалистов, готовые задачи, названия и стороны документов. Эти поля отбрасываются или сверяются с каталогом и вычисляются заново из allowlisted `intake_draft`.

Fail-closed проверки отклоняют:

- неизвестную версию контракта или каталога;
- неизвестные поля draft, facts и documents;
- телефоны, email, ФИО, паспортные, банковские, сканированные и подписные поля на любой вложенности;
- клиентские ссылки на документы;
- значения фактов и источники вне versioned enum;
- попытку передать брокеру что-либо кроме обычной или военной ипотеки.

Функции находятся в `nav_v2_private`, работают как `security invoker`, не доступны `public`, `anon` и `authenticated`; execute оставлен только `service_role`. Это не разрешение на production deploy, а целевой ACL для будущего server-side orchestration.

## Envelope

Минимальная форма входа:

```json
{
  "deal": {
    "intake_contract_version": 1,
    "intake_catalog_version": "2026-07-17.1",
    "intake_action": "draft",
    "intake_draft": {}
  }
}
```

`intake_action` поддерживает `draft`, `self`, `lawyer` и `broker`. Результат содержит `allowed`, `routing`, `gates`, `matched_rule_ids`, `legal_passport`, `work_plan` и подготовленный `prepared_payload`. `ready_tasks` остаётся пустым, пока реальный server workflow не проверит участника сделки и не назначит конкретный owner id.

## PostgreSQL 17

Отдельный GitHub Actions harness запускается на чистом `postgres:17` и выполняет последовательность:

1. создаёт синтетические Supabase-роли и marker rows;
2. рендерит каталог и применяет только прототипные функции;
3. проверяет self-service, ипотеку, ипотеку с маткапиталом, маткапитал без ипотеки, несовершеннолетнего продавца и партнёрскую сторону;
4. проверяет подмену клиентского паспорта/плана, ручной подтверждённый запрос юристу и запрет broker action без ипотеки;
5. проверяет mismatch версий, неизвестные/персональные поля, document URL, ACL и отсутствие изменений marker rows;
6. удаляет все функции и проверяет rollback.

Harness не содержит project ref, Supabase access token, production URL, команды миграции или подключения к удалённой базе.

## Production gate

До подключения к рабочему save RPC обязательны отдельные решения:

1. проверить прототип на disposable Supabase development branch с реальной схемой и действующими private helper contracts;
2. определить server-side сопоставление owner role с участником сделки; клиентский owner id принимать нельзя;
3. встроить adapter перед legacy save и убедиться, что legacy sanitizer не удаляет новые структурированные поля;
4. добавить миграцию с explicit function grants, branch rollback и review итогового diff функций;
5. получить явное разрешение на production deployment и выполнить read-only post-deploy attestation до первого save.

## Rollback

Repository rollback — удалить генератор, SQL-прототип, harness, checker, workflow и эту документацию. Data rollback не требуется: текущий срез не создаёт миграцию и не выполняет DML.

Для будущего branch deployment rollback обязан удалить шесть private functions в обратном порядке зависимостей. Harness фиксирует этот порядок в `tests/sql/nav_v2_intake_adapter_harness_rollback.sql` и после удаления проверяет отсутствие публичного surface.
