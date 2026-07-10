# Navigator v2 — curated RPC whitelist для Security Advisor

Дата: 2026-07-10

## Цель

Разбирать предупреждения Supabase Security Advisor по `SECURITY DEFINER` функциям без массового `REVOKE` и без поломки Navigator v2.

Принципы:

- browser RPC остаётся доступным `authenticated`, если внутри есть проверка пользователя, роли и сделки;
- owner/admin RPC допустим в exposed API только с обязательным role gate;
- internal helpers должны находиться вне exposed `public`;
- legacy `nav_*` разбираются отдельно;
- каждое изменение прав сопровождается dependency scan, assertions и regression checks.

## Рабочий frontend API

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

Эти RPC являются намеренным whitelist для `authenticated`. Их нельзя закрывать только из-за warning Advisor.

## Owner/admin API

Допустимы в exposed API только при внутреннем owner/admin gate:

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

Проверено: user-management и diagnostics RPC требуют авторизацию и owner/admin.

## Demo API

- `nav_v2_seed_demo_data`
- `nav_v2_clear_demo_data`

Допустимы только как gated wrappers для owner/admin или `service_role`.

## Edge Function user-context API

`nav-v2-deal-api` вызывает RPC с JWT авторизованного пользователя. Поэтому `authenticated EXECUTE` нужен для:

- `nav_v2_get_deal_card`
- `nav_v2_get_deal_card_lite`
- `nav_v2_add_comment`
- `nav_v2_update_deal_status`
- `nav_v2_update_document_status`
- `nav_v2_update_document_workflow`
- `nav_v2_update_task_status`

Production smoke проверяет, что обе Edge Functions отклоняют POST без JWT с HTTP 401.

## Internal access helpers: завершённый private migration

Все основные Navigator v2 access helpers перенесены из exposed `public` в `nav_v2_private`.

### `nav_v2_is_active_user(uuid)`

- public endpoint отсутствует;
- policy создания сделки вызывает private helper;
- `anon` и `PUBLIC` не имеют `EXECUTE`;
- migration: `20260710181623_nav_v2_private_active_user_and_rpc_health.sql`.

### `nav_v2_my_role(uuid)`

- обновлены 9 caller functions;
- 2 RLS policies используют private helper;
- stale public references отсутствуют;
- migration: `20260710182320_nav_v2_private_my_role_helper.sql`.

### `nav_v2_is_owner_or_admin(uuid)`

- обновлены 20 caller functions;
- 3 RLS policies используют private helper;
- stale public references отсутствуют;
- migration: `20260710182808_nav_v2_private_owner_admin_helper.sql`.

### `nav_v2_can_view_deal(uuid, uuid)`

- public endpoint отсутствует;
- обновлены 17 caller functions;
- 12 RLS policies используют `nav_v2_private.nav_v2_can_view_deal`;
- stale function/policy references: 0;
- `authenticated` и `service_role` имеют необходимый `EXECUTE`;
- `anon` и `PUBLIC` не имеют `EXECUTE`;
- migration: `20260710183428_nav_v2_private_can_view_deal_helper.sql`.

### `nav_v2_can_edit_deal(uuid, uuid)`

- public endpoint отсутствует;
- обновлены 12 caller functions;
- 16 RLS policies используют `nav_v2_private.nav_v2_can_edit_deal`;
- stale function/policy references: 0;
- `authenticated` и `service_role` имеют необходимый `EXECUTE`;
- `anon` и `PUBLIC` не имеют `EXECUTE`;
- migration: `20260710183524_nav_v2_private_can_edit_deal_helper.sql`.

### Regression results

До финального переноса baseline был:

- lawyer: view=true, edit=false;
- owner: owner/admin=true, view=true, edit=true;
- spn: owner/admin=false, view=true, edit=true.

После переноса:

- structural assertions для 28 RLS policies прошли;
- публичные view/edit endpoints отсутствуют;
- private view/edit functions существуют;
- browser RPC grant health: `items_count=44`, `problem_count=0`, `scope=browser_callable_only`;
- Security Advisor больше не показывает предупреждения по пяти основным access helpers;
- Performance Advisor не показал новых Navigator v2 warnings.

## Другие внутренние функции

- `nav_v2_guard_active_spn_manager()` находится в `nav_v2_private`;
- `nav_v2_jsonb_has(jsonb, text)` закрыт от прямого `authenticated EXECUTE`;
- unchecked demo/admin helpers не должны быть доступны обычным пользователям.

## Browser RPC health

`nav_v2_get_rpc_grant_health()` проверяет только browser-callable группы:

- `frontend_api`;
- `admin_api`;
- `demo_api`.

Internal helpers не считаются потерянными frontend RPC.

Live состояние:

- `items_count = 44`;
- `problem_count = 0`;
- `missing_authenticated_count = 0`;
- `anon_open_count = 0`;
- `public_open_count = 0`.

CI сравнивает `config/nav-v2-rpc-surface.json` со списком browser-callable RPC внутри DB health migration и не допускает `internal_only` в browser health.

## Legacy RPC

Не входят в whitelist Navigator v2:

- `nav_can_create_deal`
- `nav_can_edit_deal`
- `nav_can_view_deal`
- `nav_current_role`
- `nav_is_admin`

Перед revoke требуется подтвердить отсутствие использования старым интерфейсом и legacy RLS.

## Не делать

- не выполнять массовый `REVOKE EXECUTE ON ALL FUNCTIONS`;
- не переводить рабочие RPC в `SECURITY INVOKER` без теста RLS;
- не закрывать Edge user-context RPC;
- не удалять unused indexes без статистики;
- не включать leaked-password protection до ручного invite/recovery/password QA.

## Следующий безопасный этап

1. Обновить `nav_v2_get_internal_rpc_lockdown_health()` для проверки private helpers и grants.
2. Выполнить authenticated browser role smoke для owner/admin/manager/spn/lawyer/broker/viewer.
3. Проверить legacy `nav_*` dependency map и закрыть только неиспользуемые endpoints.
4. После auth QA включить leaked-password protection.

## Критерий завершения #161

- рабочий browser/admin API классифицирован;
- internal helpers находятся вне exposed API;
- legacy RPC либо подтверждены как используемые, либо закрыты;
- у `anon` и `PUBLIC` нет лишнего `EXECUTE`;
- invite/recovery/password flow пройден вручную;
- leaked-password protection включена после QA;
- Security Advisor повторно проверен.
