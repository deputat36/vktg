# Статус проекта «Навигатор сделок»

## Актуально на 22 июня 2026

- Репозиторий: `deputat36/vktg`.
- Основная ветка: `main`.
- Публичный адрес: `https://deputat36.github.io/vktg/`.
- Supabase-проект: `ofewxuqfjhamgerwzull`.
- Навигатор использует отдельные таблицы и функции `nav_*` / `nav_v2_*`.
- Данные CRM «Лидер» в Навигаторе не используются.

## Текущее состояние

Рабочая v2-структура уже включает:

- мастер СПН `spn-v2.html`;
- список сделок `deals-v2.html`;
- карточку сделки `deal-card-v2.html`;
- кабинет юриста `queue-v2.html`;
- администрирование команды `admin-v2.html`;
- диагностику `nav-system-check-v2.html`;
- сценарии ручной проверки мастера `spn-v2-checklist.html`.

В Supabase активны основные сущности:

- `nav_user_profiles`;
- `nav_deals_v2`;
- `nav_deal_participants_v2`;
- `nav_deal_documents_v2`;
- `nav_deal_risks_v2`;
- `nav_deal_tasks_v2`;
- `nav_deal_comments_v2`;
- `nav_deal_events_v2`.

## Последние улучшения

- Добавлены имена и телефоны продавца/покупателя в поток сделки.
- Кабинет юриста разделяет проблемы документов, просрочку, доработки СПН, задатки и основной договор.
- Документы поддерживают статусы `needed`, `requested`, `received`, `checked`, `problem`.
- Документы расширены до рабочего процесса: `assigned_to`, `responsible_role`, `due_date`, `status_note`, `problem_note`, `last_status_changed_at`, `resolved_at`, `updated_at`.
- Добавлен RPC `nav_v2_update_document_workflow(...)`; старый `nav_v2_update_document_status(uuid, text)` сохранен как совместимая обертка.
- Добавлен RPC `nav_v2_update_document_assignment(...)` для отдельного назначения и очистки ответственного/срока без изменения статуса документа; назначить можно только участника сделки.
- В существующих 141 документах проставлена роль ответственного; у 125 открытых документов появился базовый срок.
- В карточке сделки вкладка документов теперь показывает ответственного, срок, отметки `до задатка` / `до сделки`, заметку по проблеме и кнопку `Проблема` с обязательным пояснением.
- В карточку сделки добавлены inline-контролы для роли, конкретного ответственного и срока документа; сохранение идет через `nav_v2_update_document_assignment(...)`, а варианты ответственных берутся из участников сделки.
- После сохранения ответственного/срока карточка больше не перезагружает страницу целиком: модуль заново читает `nav_v2_get_deal_card(uuid)` и обновляет только плашки и панель конкретного документа.
- Ручные add-RPC теперь валидируют обязательный текст и пишут события в историю сделки:
  - `nav_v2_add_document(...)` → `document_added`;
  - `nav_v2_add_risk(...)` → `risk_added`;
  - `nav_v2_add_task(...)` → `task_added`;
  - `nav_v2_add_expense(...)` → `expense_added`.
- `nav_v2_add_expense(...)` дополнительно блокирует отрицательную сумму расхода.
- Мастер СПН усилен на сервере: `nav_v2_save_wizard_result(jsonb)` теперь доступен только owner/admin/manager/СПН, проверяет структуру JSON, известные значения справочников, массивы `flags/payments/basis`, цену, задаток и обязательные поля для подготовки задатка/сделки.
- `nav_v2_save_wizard_result(jsonb)` блокирует задаток больше цены, отрицательные/нечисловые суммы и создание сделки без типа объекта или адреса там, где они обязательны.
- Дашборд и список сделок исправлены: `nav_v2_get_dashboard()` теперь ограничивает задачи до агрегирования, а `nav_v2_get_deals_list(integer)` не считает документы `checked` как отсутствующие.
- Карточка сделки усилена: `nav_v2_add_comment(...)` принимает только видимость `team`, `private` или `public`, а `nav_v2_get_deal_card(uuid)` скрывает `private`-комментарии от всех, кроме автора, owner/admin и service role.
- `nav_v2_get_deal_card(uuid)` теперь реально ограничивает последние комментарии и события 50 записями до JSON-агрегации.
- `nav_v2_update_task_status(...)` теперь валидирует обязательный статус, блокирует строку задачи на время изменения, обновляет `updated_at`, возвращает `old_status` и не пишет повторное событие, если статус не изменился.
- `nav_v2_add_deal_review(...)` нормализует решения проверки: `approved` не блокирует, `need_info` блокирует сделку, `blocked` блокирует задаток и сделку; для `need_info`/`blocked` обязателен комментарий.
- `nav_v2_update_deal_status(...)` теперь блокирует положительные статусы, если есть блокирующие решения проверки, валидирует пустой статус, обновляет `updated_at`, возвращает `old_status` и не пишет повторное событие без фактической смены статуса.
- Profile-helper RPC усилены: `nav_v2_my_role(uuid)`, `nav_v2_is_active_user(uuid)` и `nav_v2_is_owner_or_admin(uuid)` теперь позволяют обычному пользователю проверять только себя; проверка чужого пользователя доступна owner/admin и service role.
- Исправлен критичный сбой кабинета юриста: `nav_v2_get_lawyer_queue(integer)` больше не использует огромный `jsonb_build_object`, который падал на лимите PostgreSQL `cannot pass more than 100 arguments to a function`; очередь собирается через `to_jsonb` подготовленной строки.
- RPC доработки СПН исправлены под v2-роли: `nav_v2_return_spn_rework(...)` и `nav_v2_submit_spn_rework(...)` больше не используют legacy enum `nav_user_role`, корректно поддерживают `owner` и записывают `author_role` в комментариях.
- `nav_v2_return_spn_rework(...)` теперь требует непустую причину возврата и позволяет юристу вернуть видимую ему сделку на доработку даже без широких прав редактирования.
- Решения юриста переведены в структурированный слой: добавлен RPC `nav_v2_add_deal_review(...)`, а юридические шаблонные комментарии из существующих кнопок автоматически создают записи в `nav_deal_reviews_v2`.
- Карточка сделки теперь показывает отдельную вкладку `Решения`, KPI по блокирующим решениям и выводит последнее юридическое решение в профиле юриста.
- Юридические быстрые действия в карточке сделки теперь напрямую вызывают `nav_v2_add_deal_review(...)`, затем обновляют статус сделки и переводят пользователя во вкладку `Решения`.
- Добавлен RPC `nav_v2_get_lawyer_review_summary()`, который возвращает summary по решениям для видимых пользователю сделок.
- Кабинет юриста `queue-v2.js` теперь показывает последнее решение, количество решений, блокирующие решения, KPI `Блокирующие решения` и ссылку `Решения` в карточке очереди.
- `nav_v2_get_lawyer_queue(integer)` теперь учитывает `nav_deal_reviews_v2` на сервере: блокирующие решения переводят сделку в `urgent`, добавляют +45 к `priority_score`, попадают в `focus_reasons` и меняют `lawyer_next_action`.
- `queue-v2.js` использует серверные review-поля напрямую, а `nav_v2_get_lawyer_review_summary()` оставлен как fallback для совместимости.
- `nav_v2_add_comment(...)` остается совместимым, но теперь для юридических действий возвращает также `review_id` и `review_decision`.
- Положительные статусы сделки серверно блокируются, если есть проблемные, просроченные или обязательные незакрытые документы.
- Закрыт публичный `anon`-доступ к рабочим RPC:
  - `nav_v2_get_lawyer_queue(integer)`;
  - `nav_v2_return_spn_rework(uuid, text)`;
  - `nav_v2_submit_spn_rework(uuid, text)`;
  - `nav_v2_update_deal_parties(uuid, text, text, text, text, text)`.
- Ужесточены демо-RPC:
  - `nav_v2_seed_demo_data()`;
  - `nav_v2_clear_demo_data()`.
- Для демо-RPC добавлены наружные проверки `service_role` или авторизованный owner/admin; старые реализации переименованы во внутренние `_unchecked_20260622` и закрыты от `anon`/`authenticated`.
- Ужесточены helper-RPC доступа:
  - `nav_v2_can_view_deal(uuid, uuid)`;
  - `nav_v2_can_edit_deal(uuid, uuid)`;
  - `nav_v2_can_change_task_status(uuid, uuid)`.
- Helper-RPC теперь позволяют обычному пользователю проверять только собственный `p_uid`; проверка чужого доступа оставлена для owner/admin и `service_role`.
- Миграции синхронизированы в репозитории:
  - `supabase/migrations/20260622143000_navigator_revoke_anon_nav_v2_workflow_rpcs.sql`;
  - `supabase/migrations/20260622151500_navigator_harden_demo_data_rpcs.sql`;
  - `supabase/migrations/20260622154500_navigator_harden_access_helper_rpcs.sql`;
  - `supabase/migrations/20260622161000_navigator_document_workflow_fields.sql`;
  - `supabase/migrations/20260622164000_navigator_structured_legal_reviews.sql`;
  - `supabase/migrations/20260622170500_navigator_lawyer_review_summary_rpc.sql`;
  - `supabase/migrations/20260622173000_navigator_lawyer_queue_review_priority.sql`;
  - `supabase/migrations/20260622175500_navigator_validate_and_log_mutation_rpcs.sql`;
  - `supabase/migrations/20260622181500_navigator_fix_rework_rpc_role_type.sql`;
  - `supabase/migrations/20260622183500_navigator_harden_wizard_save_rpc.sql`;
  - `supabase/migrations/20260622185500_navigator_fix_dashboard_list_counts.sql`;
  - `supabase/migrations/20260622191000_navigator_harden_card_comments_and_tasks.sql`;
  - `supabase/migrations/20260622193000_navigator_block_positive_statuses_by_reviews.sql`;
  - `supabase/migrations/20260622194500_navigator_harden_profile_helper_rpcs.sql`;
  - `supabase/migrations/20260622195500_navigator_fix_lawyer_queue_json_build.sql`;
  - `supabase/migrations/20260622202000_navigator_document_assignment_rpc.sql`;
  - `supabase/migrations/20260622203500_navigator_revoke_anon_update_deal_parties.sql`.

## Проверено

- У перечисленных рабочих RPC `anon_can_execute = false`.
- У `authenticated` и `service_role` доступ к рабочим наружным RPC сохранен.
- Внутренние демо-реализации `_unchecked_20260622` недоступны `anon` и `authenticated`.
- Helper-RPC доступа содержат self/admin/service guard.
- Profile-helper RPC содержат self/admin/service guard: СПН видит собственную роль, не видит роль/активность чужого юриста и не может проверить owner/admin-статус owner; owner видит роль и активность юриста.
- `nav_v2_update_deal_parties(...)` закрыт от `anon`, доступен authenticated/service_role; security advisor больше не показывает `anon_security_definer_function_executable` для этой функции.
- `nav_v2_update_document_workflow(...)` и совместимый `nav_v2_update_document_status(uuid, text)` закрыты от `anon` и доступны authenticated.
- `nav_v2_update_document_assignment(...)` закрыт от `anon`, доступен authenticated/service_role, проверяет участника сделки для `assigned_to` и пишет `document_assignment_updated` только при фактическом изменении.
- Smoke-test `nav_v2_update_document_assignment(...)` внутри rollback прошел: назначение участника, смена роли, установка срока и последующая очистка ответственного/срока вернули ожидаемые значения.
- `nav_v2_update_document_workflow(...)` принимает `p_document_id`, `p_status`, `p_assigned_to`, `p_responsible_role`, `p_due_date`, `p_note`; `nav_v2_get_deal_card(uuid)` возвращает JSON карточки для UI-модуля документов.
- `deal-card-v2.html` подключает `deal-card-doc-workflow-v2.js`; модуль читает `nav_v2_get_deal_card(uuid)` и сохраняет роль, ответственного и срок через assignment-RPC.
- `deal-card-doc-workflow-v2.js` после сохранения больше не вызывает `location.reload()`, обновляет данные карточки через RPC и перерисовывает только измененный документ; при ошибке повторного чтения не показывает ложный успешный статус.
- В `nav_deal_documents_v2` появились новые workflow-поля; 141/141 документов имеют `responsible_role`, 125 открытых документов имеют `due_date`.
- `nav_v2_add_document(...)`, `nav_v2_add_risk(...)`, `nav_v2_add_task(...)`, `nav_v2_add_expense(...)` закрыты от `anon`, доступны authenticated/service_role, валидируют обязательные названия и пишут события аудита.
- `nav_v2_save_wizard_result(jsonb)` закрыт от `anon`, доступен authenticated/service_role, содержит role guard owner/admin/manager/СПН и новые проверки входного JSON.
- Smoke-test `nav_v2_save_wizard_result(jsonb)` с валидной заявкой прошел внутри rollback: функция вернула draft-сделку, `risk_level = green`, `readiness_deposit = 100`, `readiness_deal = 65`.
- Негативный smoke-test мастера прошел: заявка с задатком больше цены ожидаемо блокируется ошибкой `Задаток не может быть больше цены объекта`.
- `nav_v2_get_dashboard()` и `nav_v2_get_deals_list(integer)` закрыты от `anon`, доступны authenticated; smoke-test от имени активного СПН выполнил оба RPC без ошибок.
- `nav_v2_get_dashboard()` содержит CTE `visible_tasks` с `limit 30` до JSON-агрегации задач.
- `nav_v2_get_deals_list(integer)` и `nav_v2_get_dashboard()` считают отсутствующими только обязательные документы не в статусах `received`/`checked`.
- `nav_v2_add_comment(...)`, `nav_v2_get_deal_card(uuid)` и `nav_v2_update_task_status(...)` закрыты от `anon`, доступны authenticated/service_role и содержат новые проверки.
- Smoke-test приватного комментария внутри rollback прошел: автор видит 1 приватный комментарий, юрист видит 0, owner видит 1.
- Smoke-test задачи внутри rollback прошел: два одинаковых вызова `nav_v2_update_task_status(..., 'in_progress')` создали только одно событие `task_status_changed`.
- `nav_v2_add_deal_review(...)` и `nav_v2_update_deal_status(...)` закрыты от `anon`, доступны authenticated/service_role и содержат новые guards по решениям проверки.
- Smoke-test решения проверки внутри rollback прошел: `blocked`-решение с входными `false/false` нормализовано в `blocks_deposit=true` и `blocks_deal=true`.
- Негативный smoke-test статуса прошел: попытка поставить `ready_for_deal` при блокирующем решении остановлена ошибкой `Нельзя поставить положительный статус: есть блокирующие решения проверки`.
- `nav_v2_get_lawyer_queue(10)` от имени активного юриста возвращает объект с `items/counts`, 10 элементов, счетчик `blocking_reviews` и `lawyer_next_action` в первой карточке.
- `nav_v2_get_lawyer_queue(integer)` закрыт от `anon`, доступен authenticated/service_role и больше не содержит большого `jsonb_build_object` для элементов очереди.
- `nav_v2_return_spn_rework(...)` и `nav_v2_submit_spn_rework(...)` закрыты от `anon`, доступны authenticated/service_role, используют `nav_v2_user_role`, не используют legacy `nav_user_role` и пишут `author_role`.
- `nav_v2_return_spn_rework(...)` содержит обязательную проверку причины возврата.
- `nav_v2_add_deal_review(...)` закрыт от `anon` и доступен authenticated; `nav_v2_add_comment(...)` пишет review-записи для юридических шаблонных действий.
- `nav_v2_get_lawyer_review_summary()` закрыт от `anon`, доступен authenticated/service_role и видит 3 сделки с решениями, 2 из них блокирующие.
- `nav_v2_get_lawyer_queue(integer)` содержит `blocking_reviews_count` и `latest_review_decision`, закрыт от `anon`, доступен authenticated/service_role.
- В `nav_deal_reviews_v2` сейчас 3 структурированных решения: 1 `approved`, 1 `need_info`, 1 `blocked`; 2 решения блокируют задаток или сделку.
- Расчетная проверка показывает: 2 сделки с блокирующими решениями получают `urgent` и +45 к серверному приоритету.
- `nav_v2_get_deal_card(uuid)` уже возвращает `reviews`, а `deal-card-v2.js` выводит их во вкладке `Решения`.
- `queue-v2.js` показывает серверные review-поля в кабинете юриста и использует fallback summary только для совместимости.
- `nav_v2_list_users()`, `nav_v2_get_access_audit()`, `nav_v2_link_user_by_email(...)` и `nav_v2_update_user_profile(...)` уже содержат серверную проверку owner/admin.
- Повторный security advisor больше не показывает предупреждение про публичный `anon`-вызов ранее открытых функций.
- Синтаксическая проверка JS через raw GitHub и GitHub API из терминала не выполнена из-за 403, но файлы прочитаны через GitHub-коннектор и обновленные участки проверены.

## Оставшиеся риски и технический долг

- Supabase advisor продолжает показывать много предупреждений по `SECURITY DEFINER` для authenticated. Часть из них ожидаема, но нужен отдельный аудит каждой функции.
- В advisor есть предупреждение по `leader_public_lead_audit`; это зона CRM «Лидер», не Навигатора.
- В Supabase Auth выключена leaked password protection. Желательно включить в настройках Auth.
- `README.md` и документация обновлены под Навигатор, но нужно дальше поддерживать их после крупных изменений.
- Фронтенд v2 местами построен слоями дополнительных JS-модулей. Работает, но следующая стабилизация должна упростить карточку сделки и убрать лишние модульные накладки.
- Следующий шаг по документам: перейти к полноценному worklist/kanban с фильтрами по ответственному, сроку и статусу.
- Следующий шаг по очереди юриста: добавить фильтр/очередь только по блокирующим решениям, если команда начнет активно пользоваться review-слоем.

## Следующий приоритет

1. Продолжить аудит всех `nav_v2_*` RPC, доступных authenticated.
2. Убрать технический шум из интерфейса обычных пользователей.
3. Развить документы до полного kanban/worklist: ответственный, срок, статус, напоминание, решение.
4. Усилить режим обучения СПН на основе существующих сценариев `spn-v2-checklist.html`.
5. Упростить карточку сделки и убрать лишние модульные накладки после точечных действий.