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
- В существующих 141 документах проставлена роль ответственного; у 125 открытых документов появился базовый срок.
- В карточке сделки вкладка документов теперь показывает ответственного, срок, отметки `до задатка` / `до сделки`, заметку по проблеме и кнопку `Проблема` с обязательным пояснением.
- Решения юриста переведены в структурированный слой: добавлен RPC `nav_v2_add_deal_review(...)`, а юридические шаблонные комментарии из существующих кнопок автоматически создают записи в `nav_deal_reviews_v2`.
- Карточка сделки теперь показывает отдельную вкладку `Решения`, KPI по блокирующим решениям и выводит последнее юридическое решение в профиле юриста.
- Юридические быстрые действия в карточке сделки теперь напрямую вызывают `nav_v2_add_deal_review(...)`, затем обновляют статус сделки и переводят пользователя во вкладку `Решения`.
- Добавлен RPC `nav_v2_get_lawyer_review_summary()`, который возвращает summary по решениям для видимых пользователю сделок.
- Кабинет юриста `queue-v2.js` теперь подмешивает review-summary в очередь: показывает последнее решение, количество решений, блокирующие решения, KPI `Блокирующие решения` и ссылку `Решения` в карточке очереди.
- `nav_v2_add_comment(...)` остается совместимым, но теперь для юридических действий возвращает также `review_id` и `review_decision`.
- Положительные статусы сделки серверно блокируются, если есть проблемные, просроченные или обязательные незакрытые документы.
- Закрыт публичный `anon`-доступ к рабочим RPC:
  - `nav_v2_get_lawyer_queue(integer)`;
  - `nav_v2_return_spn_rework(uuid, text)`;
  - `nav_v2_submit_spn_rework(uuid, text)`.
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
  - `supabase/migrations/20260622170500_navigator_lawyer_review_summary_rpc.sql`.

## Проверено

- У перечисленных рабочих RPC `anon_can_execute = false`.
- У `authenticated` и `service_role` доступ к рабочим наружным RPC сохранен.
- Внутренние демо-реализации `_unchecked_20260622` недоступны `anon` и `authenticated`.
- Helper-RPC доступа содержат self/admin/service guard.
- `nav_v2_update_document_workflow(...)` и совместимый `nav_v2_update_document_status(uuid, text)` закрыты от `anon` и доступны authenticated.
- В `nav_deal_documents_v2` появились новые workflow-поля; 141/141 документов имеют `responsible_role`, 125 открытых документов имеют `due_date`.
- `nav_v2_add_deal_review(...)` закрыт от `anon` и доступен authenticated; `nav_v2_add_comment(...)` пишет review-записи для юридических шаблонных действий.
- `nav_v2_get_lawyer_review_summary()` закрыт от `anon`, доступен authenticated/service_role и видит 3 сделки с решениями, 2 из них блокирующие.
- В `nav_deal_reviews_v2` сейчас 3 структурированных решения: 1 `approved`, 1 `need_info`, 1 `blocked`; 2 решения блокируют задаток или сделку.
- `nav_v2_get_deal_card(uuid)` уже возвращает `reviews`, а `deal-card-v2.js` выводит их во вкладке `Решения`.
- `queue-v2.js` читает `nav_v2_get_lawyer_review_summary()` и показывает review-summary в кабинете юриста.
- `nav_v2_list_users()`, `nav_v2_get_access_audit()`, `nav_v2_link_user_by_email(...)` и `nav_v2_update_user_profile(...)` уже содержат серверную проверку owner/admin.
- Повторный security advisor больше не показывает предупреждение про публичный `anon`-вызов ранее открытых функций.
- Синтаксическая проверка JS через raw GitHub и GitHub API из терминала не выполнена из-за 403, но файлы прочитаны через GitHub-коннектор и обновленные участки проверены.

## Оставшиеся риски и технический долг

- Supabase advisor продолжает показывать много предупреждений по `SECURITY DEFINER` для authenticated. Часть из них ожидаема, но нужен отдельный аудит каждой функции.
- В advisor есть предупреждение по `leader_public_lead_audit`; это зона CRM «Лидер», не Навигатора.
- В Supabase Auth выключена leaked password protection. Желательно включить в настройках Auth.
- `README.md` и документация обновлены под Навигатор, но нужно дальше поддерживать их после крупных изменений.
- Фронтенд v2 местами построен слоями дополнительных JS-модулей. Работает, но следующая стабилизация должна упростить карточку сделки и убрать лишние перезагрузки.
- Следующий шаг по документам: добавить назначение конкретного ответственного и изменение срока прямо из интерфейса.
- Следующий шаг по решениям юриста: учитывать блокирующие решения в серверном приоритете `nav_v2_get_lawyer_queue`, а не только в UI summary.

## Следующий приоритет

1. Продолжить аудит всех `nav_v2_*` RPC, доступных authenticated.
2. Учитывать `nav_deal_reviews_v2` в серверном приоритете очереди юриста.
3. Убрать технический шум из интерфейса обычных пользователей.
4. Развить документы до полного kanban/worklist: ответственный, срок, статус, напоминание, решение.
5. Усилить режим обучения СПН на основе существующих сценариев `spn-v2-checklist.html`.
