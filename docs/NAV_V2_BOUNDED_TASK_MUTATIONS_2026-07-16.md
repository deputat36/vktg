# Navigator v2 — governed bounded-task mutations

Дата: 16 июля 2026 года.

Статус: repository-only prototype. Production Supabase не изменяется.

## Цель

Добавить управляемый lifecycle для contract-v2 задач:

`явное создание → владелец → SLA → evidence → завершение или контролируемый исход → аудит`

## Явное создание

`nav_v2_create_bounded_tasks` принимает от 1 до 5 выбранных задач. Тип, допустимые роли, criterion, default/max SLA, evidence kinds и gate scope берутся из catalog.

Payload использует только bounded allowlist: тип, роль, конкретного исполнителя, SLA, evidence kind, приоритет и UUID предмета. Название генерируется catalog. Свободные title/description и произвольные поля не принимаются.

Контракт не выполняет массовый backfill существующих 98 задач.

## Назначение

Создание доступно СПН, manager, owner и admin при edit-доступе к сделке. Исполнитель должен иметь активный профиль и совпадать с назначенной ролью сделки. Lawyer и broker выполняют только назначенные им задачи. Viewer не участвует в mutation lifecycle.

## client_request_id

Каждая операция требует UUID `client_request_id`. Повтор той же операции возвращает сохранённый результат. Использование UUID для другого действия отклоняется. Audit table хранит actor, role, before/after state и result payload.

## Выполнение

Start поддерживает `open → in_progress` и возобновление активной задачи.

Complete требует `evidence_reference_id`, подтверждает evidence и устанавливает:

- `status=done`;
- `outcome_code=completed`;
- `outcome_state=confirmed`;
- completed/evidence timestamps.

## waiting_external и deferred

Оба исхода остаются активными. Обязателен bounded reason code и review date через 1–90 дней. Review date становится новой due date.

## Двухэтапные terminal outcomes

`not_applicable`, `replaced` и `cancelled` проходят:

`proposal → manager/owner/admin decision`

Для `replaced` нужна другая активная bounded-задача той же сделки. Прямой переход contract-v2 задачи в cancelled через старый status RPC запрещён.

## Legacy RPC guards

Generic `nav_v2_add_task` блокируется, чтобы не создавать неструктурированный backlog. `nav_v2_update_task_status` сохраняет baseline для legacy rows, но отклоняет contract-v2 rows.

Старый несовместимый task-type constraint удаляется только в prototype. Existing legacy rows остаются без изменений.

## Separation

Mutation-контур:

- не меняет readiness;
- не меняет risk gates и deal status;
- не создаёт документы и риски;
- не создаёт дополнительные задачи;
- не конвертирует preview автоматически;
- не выполняет массовый backfill.

RPC остаются service-role-only до отдельного deploy PR.

## PostgreSQL 17

GitHub Actions применяет synthetic setup, base contract, mutation overlay, три части assertions и rollback. Проверяются роли, assignment, SLA, evidence, idempotency, active/terminal outcomes, legacy guards и отсутствие cross-surface изменений.

## Production gate

До deployment нужны authenticated application E2E, controlled consumer migration, Security Advisor review, единая migration, минимальные grants, отдельный deploy PR и controlled pilot. Skipped authenticated job не считается доказательством.

## Rollback

Изолированный rollback удаляет только synthetic contract-v2 rows и mutation surface, восстанавливает baseline constraint и legacy RPC, сохраняя catalog и legacy task. Production rollback не должен удалять реальные bounded rows без отдельного решения.
