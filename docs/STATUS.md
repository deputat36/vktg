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
  - `supabase/migrations/20260622164000_navigator_structured_legal_reviews.sql`.

## Проверено

- У перечисленных рабочих RPC `anon_can_execute = false`.
- У `authenticated` и `service_role` доступ к рабочим наружным RPC сохранен.
- Внутренние демо-реализации `_unchecked_20260622` недоступны `anon` и `authenticated`.
- Helper-RPC доступа содержат self/admin/service guard.
- `nav_v2_update_document_workflow(...)` и совместимый `nav_v2_update_document_status(uuid, text)` закрыты от `anon` и доступны authenticated.
- В `nav_deal_documents_v2` появились новые workflow-поля; 141/141 документов имеют `responsible_role`, 125 открытых документов имеют `due_date`.
- `nav_v2_add_deal_review(...)` закрыт от `anon` и доступен authenticated; `nav_v2_add_comment(...)` пишет review-записи для юридических шаблонных действий.
- `nav_v2_list_users()`, `nav_v2_get_access_audit()`, `nav_v2_link_user_by_email(...)` и `nav_v2_update_user_profile(...)` уже содержат серверную проверку owner/admin.
- Повторный security advisor больше не показывает предупреждение про публичный `anon`-вызов ранее открытых функций.
- Синтаксическая проверка JS через raw GitHub из терминала не выполнена из-за 403, но файл прочитан через GitHub-коннектор и обновленные участки проверены.

## Оставшиеся риски и технический долг

- Supabase advisor продолжает показывать много предупреждений по `SECURITY DEFINER` для authenticated. Часть из них ожидаема, но нужен отдельный аудит каждой функции.
- В advisor есть предупреждение по `leader_public_lead_audit`; это зона CRM «Лидер», не Навигатора.
- В Supabase Auth выключена leaked password protection. Желательно включить в настройках Auth.
- `README.md` и документация обновлены под Навигатор, но нужно дальше поддерживать их после крупных изменений.
- Фронтенд v2 местами построен слоями дополнительных JS-модулей. Работает, но следующая стабилизация должна упростить карточку сделки и убрать лишние перезагрузки.
- Следующий шаг по документам: добавить назначение конкретного ответственного и изменение срока прямо из интерфейса.
- Следующий шаг по решениям юриста: вывести `nav_deal_reviews_v2` отдельным блоком в карточке сделки и очереди юриста.

## Следующий приоритет

1. Продолжить аудит всех `nav_v2_*` RPC, доступных authenticated.
2. Убрать технический шум из интерфейса обычных пользователей.
3. Развить документы до полного kanban/worklist: ответственный, срок, статус, напоминание, решение.
4. Вывести структурированные решения юриста из `nav_deal_reviews_v2` в карточке сделки и кабинете юриста.
5. Усилить режим обучения СПН на основе существующих сценариев `spn-v2-checklist.html`.
