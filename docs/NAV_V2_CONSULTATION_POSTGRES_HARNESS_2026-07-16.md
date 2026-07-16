# Navigator v2 — consultation PostgreSQL harness

Дата: 16 июля 2026 года.

## Статус

Repository-only executable test harness.

Harness запускает PostgreSQL 17 в одноразовой базе GitHub Actions. Production Supabase и платная Supabase branch не используются.

## Зачем он нужен

Статические проверки подтверждают наличие нужных SQL-маркеров, но не доказывают, что:

- DDL действительно выполняется;
- base SQL совместим с Hardening overlay;
- сигнатуры функций корректны;
- constraints, indexes, RLS и ACL работают;
- реальные RPC-переходы соответствуют ролевой модели;
- rollback можно выполнить без остаточных объектов.

Harness впервые выполняет prototype в настоящем PostgreSQL.

## Порядок применения

Строго:

`setup synthetic environment → base → hardening → assertions → Rollback rehearsal`

Файлы:

1. `tests/sql/nav_v2_consultation_harness_setup.sql`;
2. `supabase/prototypes/nav_v2_consultation_lifecycle.sql`;
3. `supabase/prototypes/nav_v2_consultation_lifecycle_hardening.sql`;
4. `tests/sql/nav_v2_consultation_harness_assertions.sql`;
5. `tests/sql/nav_v2_consultation_harness_rollback.sql`.

## Synthetic environment

Создаются только тестовые:

- роли `anon`, `authenticated`, `service_role`;
- schema `auth`;
- stub `auth.uid()`;
- enum `nav_v2_user_role`;
- `auth.users`;
- `nav_user_profiles`;
- два менеджера;
- два СПН;
- два юриста;
- broker;
- viewer;
- owner/admin;
- пустые marker tables deals/tasks/documents/risks.

Данные не копируются из production.

## DDL и ACL

Harness проверяет:

- наличие `client_request_id`;
- наличие `conversion_mode`;
- unique index идемпотентности;
- удаление старой трёхаргументной decide-функции;
- наличие четырёхаргументной decide-функции;
- RLS на обеих таблицах;
- отсутствие прямого table access у authenticated;
- отсутствие EXECUTE consultation RPC у authenticated;
- наличие временного EXECUTE у service_role только для isolated harness.

## Lifecycle

Реальными SQL-вызовами проверяются:

- create от СПН;
- повторный create с тем же `client_request_id`;
- отсутствие второго consultation row и второго question message;
- unknown payload rejection;
- privacy rejection для возможных ФИО и номера квартиры;
- собственный список СПН;
- список команды менеджера;
- общая открытая очередь юриста;
- запрет очереди для broker/viewer;
- `new → need_info`;
- уточнение СПН `need_info → new`;
- `new → answered`;
- запрет другому юристу читать назначенную историческую карточку;
- обязательный `conversion_mode=deposit|deal`;
- запрет conversion mode для обычного ответа;
- conversion draft с `creates_deal=false` и `creates_backlog=false`;
- доступ назначенного юриста;
- полный active list для owner.

## Роль ипотечного брокера

Маткапитал без ипотеки не включает broker route.

Сертификат без ипотеки также должен оставаться у СПН и юриста.

Ипотека и военная ипотека включают только параллельный broker scope:

- консультация;
- подбор программы;
- одобрение банка.

При ипотеке вместе с маткапиталом правовая и расчётная часть остаётся у СПН и юриста.

Broker не получает юридическую очередь или юридический ответ.

## No-backlog proof

До и после consultation lifecycle marker tables остаются пустыми:

- `nav_deals_v2`;
- `nav_deal_tasks_v2`;
- `nav_deal_documents_v2`;
- `nav_deal_risks_v2`.

Это подтверждает, что consultation prototype не создаёт сделку, задачу, документ или риск.

## Rollback rehearsal

После успешных assertions harness:

- отзывает RPC execute;
- удаляет старую и новую decide-сигнатуры;
- удаляет публичные RPC;
- удаляет private helpers;
- удаляет consultation messages;
- удаляет consultations;
- проверяет отсутствие таблиц и функций;
- повторно подтверждает нулевые marker tables.

После job PostgreSQL service container уничтожается автоматически.

## Что harness пока не доказывает

- поведение Supabase Auth gateway;
- PostgREST exposure после будущих grants;
- application session refresh;
- browser UI с реальными RPC;
- Security Advisor после production DDL;
- корректность approved document-source policy.

Для этого остаются отдельные authenticated application E2E и deploy review.

## Production gate

Harness должен быть зелёным до создания deployment migration.

Дополнительно нужны:

1. frontend adapter alignment с идемпотентным payload и четырёхаргументным decide RPC;
2. authenticated role/mutation E2E;
3. advisor review;
4. rollback production migration;
5. минимальные reviewed grants;
6. owner decision по document-source domains/retention;
7. отдельный deploy PR.

До выполнения этих условий SQL не применяется к project `ofewxuqfjhamgerwzull`.
