# Статус проекта «Навигатор сделок»

## Актуально на 11 июля 2026 — owner/admin dry_run

- Диагностика `nav-system-check-v2` передаёт обязательный `manager_id` при безопасном `dry_run` тестового СПН.
- В качестве менеджера используется текущий активный owner/admin; пользователь, профиль, письмо и access link при `dry_run` не создаются.
- Invite regression check контролирует payload и cache-bust диагностического модуля.

## Актуально на 11 июля 2026

- Добавлен live smoke для PostgREST/RPC без пользовательского JWT.
- Проверка охватывает 9 browser-callable RPC: они обязаны отвечать HTTP 401 / PostgreSQL `42501`.
- Проверка охватывает 6 access/trigger helpers, перенесённых в `nav_v2_private`: публичная RPC-схема обязана отвечать HTTP 404 / `PGRST202`.
- Smoke запускается в постоянном workflow `Navigator v2 live production smoke` вместе с проверкой GitHub Pages и JWT Edge Functions.
- Проверка не использует пароли, access/refresh tokens или service-role key; применяется только публичный publishable key.

## Актуально на 23 июня 2026

- Репозиторий: `deputat36/vktg`.
- Основная ветка: `main`.
- Публичный адрес: `https://deputat36.github.io/vktg/`.
- Supabase-проект: `ofewxuqfjhamgerwzull`.
- Навигатор использует отдельные таблицы и функции `nav_*` / `nav_v2_*`.
- Данные CRM «Лидер» в Навигаторе не используются и не изменяются в рамках этих работ.

## Цели улучшений

- Удобство для каждого участника процесса: СПН, юрист, брокер, менеджер, owner/admin.
- Ускорение подготовки к задатку и сделке.
- Обучение новичков через сценарии, подсказки и контролируемый workflow.
- Снижение рисков, ошибок и несанкционированного доступа.

## Рабочие экраны v2

- `spn-v2.html` — мастер СПН.
- `deals-v2.html` — список сделок.
- `deal-card-v2.html` — карточка сделки.
- `queue-v2.html` — кабинет юриста.
- `admin-v2.html` — администрирование команды.
- `nav-system-check-v2.html` — диагностика.
- `spn-v2-checklist.html` — ручные сценарии проверки мастера.

## Основные сущности Supabase

- `nav_user_profiles`.
- `nav_deals_v2`.
- `nav_deal_participants_v2`.
- `nav_deal_documents_v2`.
- `nav_deal_risks_v2`.
- `nav_deal_tasks_v2`.
- `nav_deal_comments_v2`.
- `nav_deal_events_v2`.
- `nav_deal_reviews_v2`.

## Последние улучшения

- Документы переведены в рабочий процесс: ответственный, роль, срок, статус, заметка по проблеме, даты смены статуса и закрытия.
- Добавлен `nav_v2_update_document_workflow(...)`; старый `nav_v2_update_document_status(uuid, text)` оставлен как совместимая обертка.
- Добавлен `nav_v2_update_document_assignment(...)`: отдельное назначение роли, участника и срока без смены статуса документа.
- Карточка сделки показывает ответственного, срок, роль, отметки `до задатка` / `до сделки`, проблемные документы и inline-редактирование назначения.
- После сохранения назначения документа карточка больше не перезагружает страницу целиком: обновляется только измененный документ после повторного чтения `nav_v2_get_deal_card(uuid)`.
- Решения юриста вынесены в структурированный слой `nav_deal_reviews_v2` и RPC `nav_v2_add_deal_review(...)`.
- Юридические быстрые действия в карточке создают review-записи, обновляют статус и переводят пользователя во вкладку `Решения`.
- `nav_v2_get_lawyer_queue(integer)` учитывает блокирующие review-решения, поднимает срочность, добавляет причины фокуса и возвращает `lawyer_next_action`.
- `queue-v2.js` показывает последнее решение, количество решений и блокирующие решения; fallback summary сохранен для совместимости.
- Дашборд и список сделок исправлены: задачи ограничиваются до JSON-агрегации, документы `checked` больше не считаются отсутствующими.
- Карточка сделки усилена: приватные комментарии видят только автор, owner/admin и service role; комментарии и события ограничиваются до 50 записей до агрегации.
- `nav_v2_update_task_status(...)` валидирует статус, блокирует строку задачи, обновляет `updated_at` и не пишет повторное событие без фактической смены статуса.
- `nav_v2_update_deal_status(...)` блокирует положительные статусы при блокирующих review-решениях, проблемных/просроченных/обязательных незакрытых документах.
- Мастер СПН усилен на сервере: `nav_v2_save_wizard_result(jsonb)` проверяет роль, структуру JSON, справочники, обязательные поля, цену и задаток.
- Legacy-мастер также усилен: `nav_save_wizard_deal(jsonb)` проверяет активную роль, право создания сделки, JSON-структуру, обязательные объект/адрес, диапазон готовности, числовые цены, модель представительства и типы массивов.
- RPC доработки СПН исправлены под v2-роли: `nav_v2_return_spn_rework(...)` и `nav_v2_submit_spn_rework(...)` используют `nav_v2_user_role`, поддерживают owner и пишут `author_role`.
- Рабочие mutation-RPC валидируют обязательные поля и пишут события аудита: документы, риски, задачи, расходы.
- Публичный `anon`-доступ закрыт у рабочих RPC Навигатора, где он не нужен.
- Прямые table grants по таблицам `nav_*` сужены: у `anon` сняты все права на таблицы Навигатора, у `authenticated` оставлены только `SELECT/INSERT/UPDATE/DELETE`, без `TRUNCATE/REFERENCES/TRIGGER`.
- Legacy `nav_deal_events` больше не раскрывает всю ленту всем authenticated: `SELECT/INSERT/UPDATE` политики теперь проверяют доступ к связанной сделке через `nav_can_view_deal(...)` и ограничивают события без `deal_id` автором или админом.
- Legacy `nav_deal_comments` больше не разрешает вставку комментария в любую чужую сделку: `SELECT/INSERT` политики теперь проверяют доступ к сделке через `nav_can_view_deal(...)`.
- Legacy `nav_deal_reviews` больше не разрешает reviewer-записи без доступа к сделке: `SELECT/INSERT` политики теперь используют `nav_can_view_deal(...)`, а вставка дополнительно требует допустимую reviewer-роль.
- Legacy `nav_deal_tasks` переведена на централизованный доступ: чтение идет через `nav_can_view_deal(...)`, создание и изменение — через `nav_can_edit_deal(...)`.
- Профили защищены от self-escalation: прямые `INSERT/UPDATE` в `nav_profiles` и `nav_user_profiles` больше не позволяют обычному пользователю самому назначить себе роль admin/owner, активность, менеджера, email или invited_by.
- RLS-политика `nav_v2_profiles_select` исправлена: убрано рекурсивное чтение `nav_user_profiles`, которое могло давать `infinite recursion` при прямых операциях с профилем.
- Демо-RPC усилены: наружные функции требуют service role или owner/admin, старые реализации переименованы во внутренние `_unchecked_20260622` и закрыты от `anon`/`authenticated`.
- V2 helper-RPC доступа содержат self/admin/service guard:
  - `nav_v2_can_view_deal(uuid, uuid)`;
  - `nav_v2_can_edit_deal(uuid, uuid)`;
  - `nav_v2_can_change_task_status(uuid, uuid)`.
- Profile-helper RPC содержат self/admin/service guard:
  - `nav_v2_my_role(uuid)`;
  - `nav_v2_is_active_user(uuid)`;
  - `nav_v2_is_owner_or_admin(uuid)`.
- Legacy helper-RPC доступа также усилены self/admin/service guard, чтобы обычный пользователь не мог подставить чужой `p_uid`:
  - `nav_user_role_of(uuid)`;
  - `nav_can_create_deal(uuid)`;
  - `nav_can_view_deal(uuid, uuid)`;
  - `nav_can_edit_deal(uuid, uuid)`.
- Trigger-функции Навигатора закрыты от прямого RPC-вызова `anon`/`authenticated`, при этом связанные триггеры сохранены.

## Миграции, синхронизированные в репозитории

- `supabase/migrations/20260622143000_navigator_revoke_anon_nav_v2_workflow_rpcs.sql`.
- `supabase/migrations/20260622151500_navigator_harden_demo_data_rpcs.sql`.
- `supabase/migrations/20260622154500_navigator_harden_access_helper_rpcs.sql`.
- `supabase/migrations/20260622161000_navigator_document_workflow_fields.sql`.
- `supabase/migrations/20260622164000_navigator_structured_legal_reviews.sql`.
- `supabase/migrations/20260622170500_navigator_lawyer_review_summary_rpc.sql`.
- `supabase/migrations/20260622173000_navigator_lawyer_queue_review_priority.sql`.
- `supabase/migrations/20260622175500_navigator_validate_and_log_mutation_rpcs.sql`.
- `supabase/migrations/20260622181500_navigator_fix_rework_rpc_role_type.sql`.
- `supabase/migrations/20260622183500_navigator_harden_wizard_save_rpc.sql`.
- `supabase/migrations/20260622185500_navigator_fix_dashboard_list_counts.sql`.
- `supabase/migrations/20260622191000_navigator_harden_card_comments_and_tasks.sql`.
- `supabase/migrations/20260622193000_navigator_block_positive_statuses_by_reviews.sql`.
- `supabase/migrations/20260622194500_navigator_harden_profile_helper_rpcs.sql`.
- `supabase/migrations/20260622195500_navigator_fix_lawyer_queue_json_build.sql`.
- `supabase/migrations/20260622202000_navigator_document_assignment_rpc.sql`.
- `supabase/migrations/20260622203500_navigator_revoke_anon_update_deal_parties.sql`.
- `supabase/migrations/20260623101500_navigator_revoke_direct_execute_from_trigger_function.sql`.
- `supabase/migrations/20260623103000_navigator_revoke_direct_execute_from_v2_touch_trigger.sql`.
- `supabase/migrations/20260623104500_navigator_harden_legacy_helper_rpcs.sql`.
- `supabase/migrations/20260623110000_navigator_harden_legacy_wizard_save_rpc.sql`.
- `supabase/migrations/20260623111500_navigator_tighten_table_grants.sql`.
- `supabase/migrations/20260623113000_navigator_guard_profile_self_escalation.sql`.
- `supabase/migrations/20260623113500_navigator_fix_v2_profile_policy_recursion.sql`.
- `supabase/migrations/20260623115000_navigator_harden_legacy_event_policies.sql`.
- `supabase/migrations/20260623120500_navigator_harden_legacy_comment_policies.sql`.
- `supabase/migrations/20260623122000_navigator_harden_legacy_review_policies.sql`.
- `supabase/migrations/20260623123500_navigator_harden_legacy_task_policies.sql`.

## Проверено

- У рабочих наружных RPC Навигатора `anon_can_execute = false`, где публичный доступ не нужен.
- У `authenticated` и `service_role` доступ к нужным рабочим RPC сохранен.
- Внутренние демо-реализации `_unchecked_20260622` недоступны `anon` и `authenticated`.
- Все таблицы `nav_*` имеют включенный RLS.
- У `anon` нет прямых table privileges на таблицы `nav_*`; прямой `select` из `nav_deals_v2` под ролью `anon` отклоняется `permission denied`.
- У `authenticated` на таблицах `nav_*` остались только `DELETE/INSERT/SELECT/UPDATE`; прямой `select` из `nav_deals_v2` под активным пользователем проходит через RLS.
- Политика `nav_deal_events_select_authenticated` с `qual=true` удалена; legacy-события теперь видны только через доступ к сделке, а smoke-test подтвердил: админ видит событие своей legacy-сделки, посторонний СПН не видит.
- Политика `nav_comments_insert_authenticated` удалена; legacy-комментарии теперь читаются и создаются только через доступ к сделке, а smoke-test подтвердил: владелец видит свой комментарий, посторонний СПН не видит и не может вставить комментарий в чужую legacy-сделку.
- Legacy review-политики переведены на `nav_can_view_deal(...)`; smoke-test подтвердил: админ создает и видит review своей legacy-сделки, посторонний СПН не видит и не может вставить review в чужую сделку.
- Legacy task-политики переведены на `nav_can_view_deal(...)` / `nav_can_edit_deal(...)`; smoke-test подтвердил: админ создает, видит и обновляет задачу своей legacy-сделки, посторонний СПН не видит, не создает и не обновляет чужую задачу.
- `nav_profiles_guard_self_escalation` и `nav_v2_profiles_guard_self_escalation` включены; их функции недоступны для прямого `anon`/`authenticated` execute, `service_role` сохранен.
- Негативные smoke-тесты profile self-escalation прошли: обычный СПН не может обновить собственную legacy-роль до `admin`, v2-роль до `owner`, а также не может создать себе новый профиль сразу с privileged ролью.
- Позитивный smoke-test профиля прошел: обычное обновление собственного `full_name/phone` в `nav_user_profiles` разрешено и проходит через RLS.
- `nav_v2_profiles_select` больше не вызывает `infinite recursion` при прямом update профиля.
- `nav_set_deal_created_by()` имеет `anon_can_execute=false`, `authenticated_can_execute=false`, `service_can_execute=true`; trigger `trg_nav_deals_set_created_by` на `nav_deals` активен.
- `nav_v2_touch_updated_at()` имеет `anon_can_execute=false`, `authenticated_can_execute=false`, `service_can_execute=true`; triggers `nav_deals_v2_touch_updated_at` и `nav_deal_tasks_v2_touch_updated_at` активны.
- Все trigger-функции `nav*` закрыты от прямого `anon`/`authenticated` execute; `service_role` сохранен.
- Legacy helper-RPC после hardening:
  - обычный СПН видит собственную роль и может проверить собственное право создания сделки;
  - обычный СПН не видит роль чужого админа и не может проверить создание сделки за него;
  - админ может читать роль другого активного пользователя и оценивать его права;
  - service role может оценивать целевого пользователя без `auth.uid()`;
  - обычный пользователь не может получить `true` по `nav_can_view_deal` / `nav_can_edit_deal`, подставив `p_uid` админа.
- Legacy `nav_save_wizard_deal(jsonb)` закрыт от `anon`, доступен authenticated/service_role и теперь валидирует серверный payload мастера.
- Smoke-test `nav_save_wizard_deal(jsonb)` внутри rollback прошел: валидная заявка создала draft-сделку с ожидаемым названием.
- Негативный smoke-test legacy-мастера прошел: заявка с нечисловой фактической ценой блокируется ошибкой `Фактическая цена должна быть числом`.
- `nav_v2_update_document_assignment(...)` закрыт от `anon`, доступен authenticated/service_role, проверяет участника сделки для `assigned_to` и пишет `document_assignment_updated` только при фактическом изменении.
- Smoke-test `nav_v2_update_document_assignment(...)` внутри rollback прошел: назначение участника, смена роли, установка срока и очистка ответственного/срока вернули ожидаемые значения.
- В `nav_deal_documents_v2` workflow-поля заполнены: 141/141 документов имеют `responsible_role`, 125 открытых документов имеют `due_date`.
- `nav_v2_save_wizard_result(jsonb)` закрыт от `anon`, доступен authenticated/service_role, содержит role guard owner/admin/manager/СПН и проверки входного JSON.
- Позитивный smoke-test v2-мастера внутри rollback вернул draft-сделку; негативный smoke-test с задатком больше цены ожидаемо блокируется.
- Smoke-test приватного комментария внутри rollback прошел: автор видит приватный комментарий, юрист не видит, owner видит.
- Smoke-test задачи внутри rollback прошел: два одинаковых вызова смены статуса создали только одно событие `task_status_changed`.
- Smoke-test review-решения внутри rollback прошел: `blocked` нормализуется в `blocks_deposit=true` и `blocks_deal=true`.
- Негативный smoke-test статуса прошел: `ready_for_deal` при блокирующем решении останавливается серверной ошибкой.
- `nav_v2_get_lawyer_queue(10)` от имени активного юриста возвращает объект с `items/counts`, счетчик `blocking_reviews` и `lawyer_next_action`.
- `nav_v2_get_lawyer_queue(integer)` больше не использует большой `jsonb_build_object` для элементов очереди и не падает на лимите PostgreSQL по количеству аргументов.
- `nav_v2_return_spn_rework(...)` и `nav_v2_submit_spn_rework(...)` закрыты от `anon`, доступны authenticated/service_role, используют `nav_v2_user_role` и пишут `author_role`.
- `nav_v2_get_lawyer_review_summary()` закрыт от `anon`, доступен authenticated/service_role и видит структурированные решения.
- Повторный security advisor больше не показывает предупреждения для уже закрытых `anon`-доступов и прямого execute trigger-функций Навигатора.

## Оставшиеся риски и технический долг

- Supabase advisor продолжает показывать предупреждения по части `SECURITY DEFINER` функций, доступных authenticated. Часть ожидаема, но нужен пофункциональный аудит каждой RPC.
- В advisor есть предупреждение по `leader_public_lead_audit`; это зона CRM «Лидер», не Навигатора.
- В Supabase Auth выключена leaked password protection. Желательно включить в настройках Auth.
- Фронтенд v2 местами построен слоями дополнительных JS-модулей. Следующая стабилизация должна упростить карточку сделки и убрать лишние модульные накладки.
- Документам нужен полноценный worklist/kanban с фильтрами по ответственному, сроку, статусу и просрочке.
- Кабинету юриста нужен отдельный фильтр/очередь по блокирующим решениям, если команда начнет активно пользоваться review-слоем.
- GitHub raw/curl и clone из терминала в этой среде возвращают 403, поэтому чтение/запись репозитория выполняется через GitHub-коннектор.
- Changelog Supabase из терминала возвращает 403; при Supabase-работах используется MCP-проверка текущей схемы и smoke-тесты.

## Следующий приоритет

1. Продолжить аудит всех `nav_v2_*` и legacy `nav_*` RPC, доступных authenticated.
2. Убрать технический шум из интерфейса обычных пользователей.
3. Развить документы до полного kanban/worklist: ответственный, срок, статус, напоминание, решение.
4. Усилить режим обучения СПН на основе сценариев `spn-v2-checklist.html`.
5. Упростить карточку сделки и убрать лишние модульные накладки после точечных действий.
