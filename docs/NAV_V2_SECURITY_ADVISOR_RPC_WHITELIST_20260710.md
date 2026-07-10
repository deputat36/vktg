# Navigator v2 — curated RPC whitelist для Security Advisor

Дата: 2026-07-10

## Цель

Разобрать предупреждения Supabase Security Advisor по `SECURITY DEFINER` функциям без массового `revoke execute` и без поломки рабочего интерфейса Navigator v2.

Основной принцип:

- наличие предупреждения Advisor не означает, что функцию нужно немедленно закрыть;
- браузерные RPC должны оставаться доступными роли `authenticated`, если внутри есть проверка пользователя, роли и доступа к сделке;
- внутренние helpers и legacy RPC нужно разбирать отдельно;
- изменения прав выполняются только после regression test по ролям.

## Группа A — рабочий frontend API

Эти RPC вызываются интерфейсом Navigator v2 и являются whitelist-кандидатами для `authenticated`:

### Профиль и dashboard

- `nav_v2_get_my_profile`
- `nav_v2_get_dashboard`
- `nav_v2_get_deals_list`
- `nav_v2_get_handoff_scores`

### Карточка сделки

- `nav_v2_get_deal_card`
- `nav_v2_get_deal_card_lite`
- `nav_v2_get_deal_responsibility_snapshot`
- `nav_v2_get_deal_status_options`
- `nav_v2_update_deal_parties`
- `nav_v2_update_deal_status`
- `nav_v2_add_comment`
- `nav_v2_add_deal_review`
- `nav_v2_return_spn_rework`
- `nav_v2_submit_spn_rework`

### Документы, задачи, риски и расходы

- `nav_v2_add_document`
- `nav_v2_update_document_status`
- `nav_v2_update_document_assignment`
- `nav_v2_update_document_workflow`
- `nav_v2_add_task`
- `nav_v2_update_task_status`
- `nav_v2_update_task_due_date`
- `nav_v2_add_risk`
- `nav_v2_add_expense`

### СПН и юрист

- `nav_v2_save_wizard_result`
- `nav_v2_get_lawyer_queue`
- `nav_v2_get_lawyer_review_summary`

## Группа B — owner/admin API

Эти RPC могут оставаться callable для `authenticated`, только если внутри есть обязательный owner/admin gate:

- `nav_v2_list_users`
- `nav_v2_link_user_by_email`
- `nav_v2_update_user_profile`
- `nav_v2_check_deal_access`
- `nav_v2_get_access_audit`
- `nav_v2_get_data_quality_dashboard`
- `nav_v2_get_team_profile_quality_health`
- `nav_v2_get_data_integrity_health`
- `nav_v2_get_frontend_rpc_coverage_health`
- `nav_v2_get_frontend_coverage_health`
- `nav_v2_get_rpc_grant_health`
- `nav_v2_get_security_hardening_health`
- `nav_v2_get_rls_policy_health`
- `nav_v2_get_storage_security_health`
- `nav_v2_get_index_health`
- `nav_v2_get_internal_rpc_lockdown_health`

Проверено отдельно:

- `nav_v2_list_users` требует `auth.uid()` и owner/admin;
- `nav_v2_link_user_by_email` требует `auth.uid()` и owner/admin;
- `nav_v2_update_user_profile` требует `auth.uid()` и owner/admin;
- diagnostics RPC проверяют авторизацию и owner/admin.

## Группа C — demo wrappers

- `nav_v2_seed_demo_data`
- `nav_v2_clear_demo_data`

Они допустимы в exposed API только как wrappers с gate:

- owner/admin;
- либо `service_role`.

Внутренние unchecked-функции не должны быть доступны напрямую обычным пользователям.

## Группа D — Edge Function user-context RPC

Edge Function `nav-v2-deal-api` вызывает RPC от имени авторизованного пользователя, поэтому этим функциям нужен `authenticated execute`:

- `nav_v2_get_deal_card`
- `nav_v2_get_deal_card_lite`
- `nav_v2_add_comment`
- `nav_v2_update_deal_status`
- `nav_v2_update_document_status`
- `nav_v2_update_document_workflow`
- `nav_v2_update_task_status`

Для них warning Advisor является ожидаемым до тех пор, пока функция:

- проверяет `auth.uid()`;
- проверяет доступ пользователя к сделке;
- валидирует допустимый статус и переход;
- не открыта для `anon`/`public`.

## Группа E — access helpers

### Уже перенесено в private schema

#### `nav_v2_is_active_user(uuid)`

- находится в `nav_v2_private`;
- `public.nav_v2_is_active_user(uuid)` отсутствует;
- `anon` и `PUBLIC` не имеют `EXECUTE`;
- `authenticated` имеет только необходимый для RLS `USAGE` схемы и `EXECUTE` функции;
- policy `nav_v2_deals_insert` вызывает private helper явно;
- warning Security Advisor по публичной функции исчез;
- migration: `20260710181623_nav_v2_private_active_user_and_rpc_health.sql`.

#### `nav_v2_my_role(uuid)`

- находится в `nav_v2_private`;
- `public.nav_v2_my_role(uuid)` отсутствует;
- девять вызывающих функций пересозданы с private schema-qualified ссылкой;
- две RLS-политики используют private helper;
- stale-ссылок в функциях и policies нет;
- `anon` и `PUBLIC` не имеют `EXECUTE`;
- warning Security Advisor по публичной функции исчез;
- migration: `20260710182320_nav_v2_private_my_role_helper.sql`.

#### `nav_v2_is_owner_or_admin(uuid)`

- находится в `nav_v2_private`;
- `public.nav_v2_is_owner_or_admin(uuid)` отсутствует;
- двадцать вызывающих функций пересозданы с private schema-qualified ссылкой;
- три RLS-политики используют private helper;
- stale-ссылок в функциях и policies нет;
- `anon` и `PUBLIC` не имеют `EXECUTE`;
- `authenticated` и `service_role` имеют необходимый `EXECUTE`;
- warning Security Advisor по публичной функции исчез;
- migration: `20260710182808_nav_v2_private_owner_admin_helper.sql`.

Ролевой regression baseline после private migrations:

- lawyer: `my_role=lawyer`, owner/admin=false, view=true, edit=false;
- owner: `my_role=owner`, owner/admin=true, view=true, edit=true;
- spn: `my_role=spn`, owner/admin=false, view=true, edit=true.

### Уже закрыто от прямого authenticated-вызова

- `nav_v2_jsonb_has(jsonb, text)` больше не имеет прямого `authenticated execute`;
- migration: `20260710155703_nav_v2_revoke_authenticated_jsonb_has.sql`.

### Остаётся перенести по dependency plan

- `nav_v2_can_view_deal`
- `nav_v2_can_edit_deal`

Обе функции взаимосвязаны с большим числом RLS policies и рабочих RPC. Их следует переносить одной согласованной migration после полного dependency rehearsal, потому что edit helper использует те же границы доступа и часть caller functions вызывает оба helper.

Перед переносом нужно проверить:

1. точный список caller functions и policies для каждой функции;
2. порядок замены ссылок;
3. private grants для RLS;
4. отсутствие stale public references;
5. role regression и чтение карточки сделки;
6. browser RPC health и Edge Function smoke.

## DB health-check после разделения API и helpers

`nav_v2_get_rpc_grant_health()` проверяет только browser-callable группы:

- `frontend_api`;
- `admin_api`;
- `demo_api`.

Внутренние helpers больше не считаются потерянными frontend RPC. Ответ сохраняет совместимые поля административного интерфейса и добавляет:

- `scope = browser_callable_only`;
- `missing_count`;
- `duplicate_count`.

Live-проверка после private migrations:

- `items_count = 44`;
- `problem_count = 0`;
- `missing_authenticated_count = 0`;
- `anon_open_count = 0`;
- `public_open_count = 0`.

Репозиторный CI сравнивает `config/nav-v2-rpc-surface.json` со списком browser-callable RPC внутри DB health migration и запрещает попадание `internal_only` в browser health.

## Группа F — legacy RPC

Legacy `nav_*` функции не включаются автоматически в whitelist Navigator v2:

- `nav_can_create_deal`
- `nav_can_edit_deal`
- `nav_can_view_deal`
- `nav_current_role`
- `nav_is_admin`

Перед revoke нужно подтвердить отсутствие использования:

- старым интерфейсом;
- RLS legacy-таблиц;
- миграциями и служебными проверками.

## Уже исправлено

- `set_broker_leads_updated_at()` получил fixed `search_path = public, pg_temp`;
- warning `function_search_path_mutable` устранён;
- создана закрытая схема `nav_v2_private`;
- trigger helper `nav_v2_guard_active_spn_manager()` перенесён в private schema;
- `nav_v2_is_active_user(uuid)` перенесён в private schema;
- `nav_v2_my_role(uuid)` перенесён в private schema;
- `nav_v2_is_owner_or_admin(uuid)` перенесён в private schema;
- browser RPC grant health отделён от internal helper health.

## Что не делать

- не выполнять массовый `revoke execute on all functions`;
- не менять рабочие RPC на `security invoker` без теста RLS;
- не переносить функции в private schema без проверки зависимостей;
- не закрывать `authenticated execute` для Edge Function user-context RPC;
- не включать leaked password protection до проверки invite/recovery/password flow.

## Следующий безопасный этап

1. Выполнить транзакционную репетицию совместного переноса `nav_v2_can_view_deal` и `nav_v2_can_edit_deal`.
2. Проверить все RLS policies, caller definitions и role baseline.
3. Расширить internal lockdown health private-helper проверками.
4. Выполнить browser role smoke для всех ролей.
5. Отдельно проверить legacy `nav_*` на отсутствие использования.
6. После auth QA включить leaked password protection в Supabase Auth.

## Критерий завершения #161

- сформирован и проверен whitelist рабочего API;
- internal helpers закрыты от прямого Data API вызова без поломки RLS;
- legacy RPC либо подтверждены как используемые, либо закрыты;
- `anon` и `public` не имеют лишнего execute;
- invite/recovery/password flow пройден вручную;
- leaked password protection включена после успешного auth QA;
- Security Advisor повторно проверен.
