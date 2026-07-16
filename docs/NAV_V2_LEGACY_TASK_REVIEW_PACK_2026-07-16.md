# Navigator v2 — controlled legacy task review pack

Дата: 16 июля 2026 года.

Статус: repository-only review pack. Production Supabase не изменяется.

## Задача

В production остаются 98 legacy-задач без `task_type` и `sla_days`. Их нельзя массово backfill-ить или автоматически пересоздавать.

Review pack даёт owner/admin/manager нейтральный read-only список для ручного решения по конкретной строке.

## DTO

В item входят:

- нейтральные ссылки задачи и сделки;
- status и priority;
- системный source;
- assigned role, assignee и due date;
- возраст и просрочка;
- high-confidence suggestion;
- catalog SLA, owner roles, criterion, evidence и gate;
- recommended и allowed review decisions.

Title, description, адреса, ФИО клиентов, телефоны, email, паспортные данные и document URL не возвращаются.

## Source mapping

Высокоуверенные mappings:

- `auto_quality_*` → `card_correction`;
- `auto_settlements` / `auto_expenses` → `term_approval`;
- `auto_lawyer` / `auto_children` / `auto_share_lawyer` → `legal_decision`;
- `auto_broker` → `financial_decision` только при роли broker.

Маткапитал, сертификаты и субсидии не относятся к ипотечному брокеру автоматически. `auto_matcap`, `auto_certificate`, `auto_subsidy` и неизвестные source всегда получают `manual_review`.

## Решения

- `leave_legacy` — оставить историческую строку без изменения;
- `candidate_for_recreate` — кандидат на явное пересоздание после ручной проверки;
- `manual_review` — источник или роль не дают безопасной классификации;
- `retire_after_evidence` — возможен только после отдельного evidence и governed mutation.

`retire_after_evidence` никогда не рекомендуется автоматически.

Done/cancelled строки получают `leave_legacy`, даже если source mapping высокоуверенный.

## Роли

Массовый review-list доступен только owner, admin и manager. Manager видит только сделки своей команды.

СПН, lawyer, broker и viewer не получают этот список. Это не ограничивает их обычную работу с конкретными назначенными задачами.

## Не используется для оценки сотрудников

Возраст, просрочка и количество строк нужны только для управления процессом миграции. Review pack не используется для оценки сотрудников, рейтинга, штрафов или сравнения эффективности.

## Separation

RPC:

- не обновляет legacy rows;
- не создаёт bounded tasks;
- не завершает и не отменяет задачи;
- не выполняет backfill;
- не меняет readiness, risk gates или deal status;
- не создаёт документы и риски.

В repository prototype EXECUTE доступен только service role. Внутри RPC дополнительно проверяется role scope.

## Production aggregate 16 июля 2026 года

Read-only агрегат показал 98 задач. Основные активные source:

- `auto_quality_seller_name` — 23;
- `auto_quality_buyer_name` — 17;
- `auto_expenses` — 13;
- `auto_settlements` — 13;
- `auto_lawyer` — 10;
- другие quality/legal sources — меньшие группы.

`auto_broker` содержит 5 строк: 4 cancelled и 1 open. Cancelled строки не должны становиться кандидатами на пересоздание.

Demo rows исключаются.

## PostgreSQL 17

Harness использует synthetic production-like task schema, применяет bounded task catalog и review RPC, затем проверяет:

- service-role-only ACL;
- owner/admin/manager scope;
- denial для СПН/lawyer/broker/viewer;
- high-confidence mapping;
- отрицательные сценарии маткапитала и сертификата;
- cancelled broker row → `leave_legacy`;
- neutral DTO;
- no-write/no-backfill guarantees;
- rollback без изменения catalog и legacy rows.

## Production gate

До deployment нужны:

1. решение владельца о controlled sample 10–15 задач;
2. repository-only UI preview выборочного review;
3. consumer matrix старых task RPC;
4. authenticated application E2E;
5. Security Advisor review;
6. отдельный deploy PR с минимальным grant;
7. запрет использования review pack для employee evaluation.

## Rollback

До deployment rollback удаляет только review RPC, fixtures, tests, workflow и документацию. Task rows и bounded catalog не изменяются.
