# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 2026-07-13.
- Текущий product `main`: `2b80074fa1aa33c272d1d5ecb654e9accd11a52c` — PR #246.
- Runtime PR после #246: release-sync PR для baseline/aliases/handoff.
- Canonical frontend build: `20260711-01`.
- Deal-card budget: 22; механическое сокращение без новой продуктовой причины запрещено.

## Последние завершённые PR

- #246 — исправлено сравнение operational adoption: точные непересекающиеся server-side окна вместо клиентского `N` против `2N` вычитания.
- #245 — предыдущий handoff.
- #244 — первоначальное client-side сравнение периодов; методология superseded PR #246.
- #243 — reconciliation исторических migration aliases для risk/readiness/task/broker/viewer/adoption.
- #241 — adoption split-deploy history, alias-aware release drift и baseline.
- #240 — отчёт «Движение и результат».
- #239 — Navigator-only Advisor scope gate.
- #238 — source history для live task contract migration.
- #237 — release baseline.
- #236 — persisted nullable `task_type` / `sla_days` preview.
- #235 — controlled read-only migration/Edge drift report.
- #233 — owner/admin information architecture.
- #232 — SPN handoff после сохранения.
- #230 — lawyer focus mode.
- #228 — viewer workspace.
- #227 — broker triage.
- #226 — task taxonomy.
- #225 — manager queue UX.
- #224 — role-aware dashboard.
- #222 — operational readiness.
- #220 — risk lifecycle; issue #218 закрыта.

## Supabase production

- Project: `ofewxuqfjhamgerwzull`.
- Последняя live migration: `20260713164757_nav_v2_operational_adoption_period_comparison`.
- Canonical source: `20260713203000_nav_v2_operational_adoption_period_comparison.sql`.
- Canonical source blob: `2e6ee17e2428872c523314b070c5000c6b59db29`.
- Adoption report split-deploy:
  - `20260713160355_nav_v2_operational_adoption_report_core`;
  - `20260713160446_nav_v2_operational_adoption_active_profile_guard`;
  - `20260713160524_nav_v2_operational_adoption_health_registration`.
- `nav-invite-user`: v10 ACTIVE, `verify_jwt=true`, SHA `14020dac054cadf3ca86d19313cf2bc2b012aca9d634e76e8dd0ffde11b05a5f`.
- `nav-v2-deal-api`: v4 ACTIVE, `verify_jwt=true`, SHA `b64e3fdbc2fa22ccb4998e69232e4351308f1d9b0a7c3c2bec7093186d3e4095`.
- RPC grant health: 49 items, 0 problems.
- Frontend RPC coverage: 42 items, 0 problems.
- Рабочие строки после deployment не менялись.

## Operational adoption: текущий снимок

Read-only owner/admin/manager report за последние 30 дней:

- Deals in scope: 16.
- With confirmed result: 1.
- Activity without confirmed result: 15.
- No recent activity: 0.
- Confirmed result rate: 6.3%.
- Completed tasks: 0.
- Resolved risks: 0.
- Resolved documents: 1.
- Created tasks: 52.
- Client actions created: 18.
- Quality warnings created: 34.
- Open tasks: 76; overdue tasks: 76.
- Open risks: 44.
- Overdue required documents: 119.
- Missing manager: 16.
- Missing SPN: 2.
- Needs attention: 16.
- Stale 7+ days: 16.

## PR #246 — точное сравнение периодов

- Публичная browser-точка не расширена: используется один `nav_v2_get_operational_adoption_report`.
- Private helper: `nav_v2_private.nav_v2_get_operational_adoption_period_comparison_unchecked_20260713(integer)`.
- Два SQL-окна непересекающиеся и одинаковой длины.
- Сделка входит в период только если `deal.created_at < period_end`.
- Выполнение задачи учитывается по стабильному `completed_at`, а не по последующему `updated_at`.
- Исторический backlog не реконструируется: `historical_backlog_included=false`.
- Единого рейтинга сотрудника нет: `employee_score=false`.
- UI показывает размеры обеих выборок и нейтральные дельты, включая процентные пункты.
- Current 30 days: 16 сделок; 1 с результатом; 15 activity without result; 0 no activity; rate 6.3%.
- Previous 30 days: 9 сделок; 1 с результатом; 8 activity without result; 0 no activity; rate 11.1%.
- Delta: +7 сделок, +7 activity without result, −4.8 п.п. confirmed result rate.
- Нельзя автоматически трактовать дельту как оценку сотрудника: размеры выборок различаются.
- PR #246 checks: static PASS; JavaScript PASS; Advisor scope PASS; public desktop/mobile PASS; review threads 0.
- `authenticated-smoke` был `skipped`; это не authenticated PASS.

## Security и access

- Public adoption wrapper: authenticated EXECUTE=true; anon=false; PUBLIC=false.
- Private adoption report implementation: service_role only; authenticated/anon/PUBLIC=false.
- Private period comparison implementation: service_role only; authenticated/anon/PUBLIC=false.
- SPN invocation: SQLSTATE `42501`, PASS.
- Active manager-профиля нет, поэтому live manager invocation не выполнен.
- Access helpers остаются в `nav_v2_private`; публичные дубли не восстановлены.
- Advisor warning для adoption RPC ожидаем и зарегистрирован в Navigator-only scope gate.
- Security Advisor после deployment не показал нового public Navigator RPC: external surface остался 49.
- Массовый revoke запрещён.
- Leaked-password protection остаётся выключенной до invite/recovery E2E.
- Performance Advisor содержит общий шум shared project; автоматическое удаление индексов запрещено.

## Release drift

- Baseline latest live: `20260713164757`.
- `config/nav-v2-release-migration-aliases.json` связывает live timestamp versions с reviewed canonical SQL и Git blob SHA.
- Live `20260713164757` должен быть связан с canonical `20260713203000`.
- Alias workflows сохраняют evidence artifact и падают на неизвестном repository-only/remote-only drift.
- Первый approved production workflow run с Environment secrets ещё требует ручной настройки владельца.

## Рабочие данные

До и после migration counts совпали:

- Deals: 21.
- Documents: 168.
- Tasks: 92.
- Risks: 49.
- Events: 116.
- Persisted task type: 0.
- Persisted SLA: 0.
- Активные профили: owner 1, lawyer 1, SPN 3; active admin/manager/broker/viewer отсутствуют.
- Один active SPN без `manager_id`; назначение вслепую запрещено.
- Реальных сделок: 16.
- Все 16 требуют manager attention и не имеют manager/exception.
- 2 сделки без SPN.
- Lawyer waiting: 11; broker waiting: 5.
- Все 76 открытых рабочих задач просрочены.
- Реальные назначения, статусы, task types и SLA автоматически не менялись.

## Authenticated E2E blocker

- Supabase development branch отсутствует: Branching доступен только на Pro или выше.
- Отдельного test project нет.
- GitHub Environment `navigator-e2e`, disposable role accounts и mailbox отсутствуют.
- Authenticated Playwright matrix: BLOCKED.
- Invite/access-link/password/recovery/email delivery: BLOCKED.
- Browser task/document/risk/status mutations: BLOCKED.
- Workflow success при `authenticated-smoke=skipped` не является authenticated PASS.

## Открытые issues

- #16 — invite/recovery/password E2E.
- #156 — operational data quality и внедрение.
- #157 — active SPN без manager.
- #159 — authenticated desktop/mobile visual matrix.
- #161 — Advisor scope и leaked-password protection.
- #164 — release readiness.
- #176 — master roadmap.
- #177 — controlled release drift/deploy process.
- #179 — frontend architecture и authenticated role tests.
- #199 — legacy decommission; не выполнять без отдельного решения.

## Ручные действия владельца

1. Создать GitHub Environment `navigator-production-readonly`, required reviewer и secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`.
2. Запустить `.github/workflows/nav-v2-release-drift.yml` для `main` с `allow_drift=false` и сохранить artifact/result в #177.
3. Для auth E2E: Supabase Pro branch либо отдельный test project без реальных данных.
4. Создать Environment `navigator-e2e`, disposable role accounts и mailbox.
5. Подтвердить manager assignments/exceptions по 16 реальным сделкам.
6. Не сохранять массово task type/SLA и не менять реальные назначения до authenticated mutation E2E.

## NEXT_WORK_QUEUE

- P0 MANUAL — первый approved release drift workflow run с `allow_drift=false`.
- P0 BLOCKED — isolated target + authenticated role/invite/recovery/mutation E2E.
- P0 MANUAL — manager assignments/exceptions по 16 реальным сделкам.
- P1 UNBLOCKED — read-only manager assignment proposal: вывести предполагаемого менеджера из `seller_spn.manager_id` / `buyer_spn.manager_id`, состояния `single_candidate`, `conflict`, `missing_source`; никаких mutation и bulk update.
- P1 BLOCKED ON AUTH EVIDENCE — audited point task contract mutation: preview → одна synthetic task → audit event → reload verification.
- P1 BLOCKED ON CONFIRMATION — audited point manager assignment.
- P1 — leaked-password protection только после auth E2E.
- DO NOT REPEAT — общий аудит, guest/no-JWT/private-helper smoke, deal-card consolidation, risk #218, operational/task/broker/viewer previews, lawyer focus, SPN handoff, owner/admin IA, task contract schema, Advisor scope gate, базовый adoption snapshot и period comparison без новой причины.

## Команда следующего запуска

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #246 и live migration 20260713164757. Один раз проверь Environment navigator-production-readonly, isolated auth target и manager confirmation. Если release Environment настроен — запусти approved drift report и обнови #177. Если auth/manager остаются blocked — реализуй read-only manager assignment proposal из manager_id назначенных SPN с явными состояниями single_candidate/conflict/missing_source, без mutation и без изменения реальных сделок. Заверши branch → PR → CI → merge → Supabase verification → handoff.`
