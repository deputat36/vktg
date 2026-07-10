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

Требуют отдельного решения, потому что могут использоваться RLS и другими RPC:

- `nav_v2_can_view_deal`
- `nav_v2_can_edit_deal`
- `nav_v2_is_active_user`
- `nav_v2_is_owner_or_admin`
- `nav_v2_my_role`
- `nav_v2_jsonb_has`

До изменения grants нужно проверить:

1. использование в RLS policies;
2. вызовы из других функций;
3. прямые вызовы из frontend;
4. возможность переноса в private schema;
5. regression test owner/admin/manager/spn/lawyer/broker/viewer.

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
- Supabase migration: `20260709145432_fix_broker_leads_updated_at_search_path`;
- migration-файл синхронизирован с GitHub через PR #169;
- warning `function_search_path_mutable` больше не является открытым пунктом #161.

## Что не делать

- не выполнять массовый `revoke execute on all functions`;
- не менять рабочие RPC на `security invoker` без теста RLS;
- не переносить функции в private schema без проверки зависимостей;
- не закрывать `authenticated execute` для Edge Function user-context RPC;
- не включать leaked password protection до проверки invite/recovery/password flow.

## Следующий безопасный этап

1. Снять фактический список прямых frontend-вызовов.
2. Сравнить его с `nav_v2_get_frontend_rpc_coverage_health()`.
3. Для каждой функции группы E построить dependency list.
4. Отдельно проверить legacy `nav_*` на отсутствие использования.
5. Подготовить маленькую migration только для подтверждённых internal/legacy функций.
6. Выполнить role regression test.
7. После auth QA включить leaked password protection в Supabase Auth.

## Критерий завершения #161

- сформирован и проверен whitelist рабочего API;
- internal helpers закрыты от прямого вызова, если это не ломает RLS;
- legacy RPC либо подтверждены как используемые, либо закрыты;
- `anon` и `public` не имеют лишнего execute;
- invite/recovery/password flow пройден вручную;
- leaked password protection включена после успешного auth QA;
- Security Advisor повторно проверен.
