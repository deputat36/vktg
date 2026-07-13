# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 2026-07-13.
- Текущий product `main`: `02ee2f3cb0b941a3a7a7a895a344c6c3671cc591` — PR #244.
- Открытых runtime PR после #244: 0.
- Canonical frontend build: `20260711-01`.
- Deal-card budget: 22; механическое сокращение без новой продуктовой причины запрещено.

## Последние завершённые PR

- #244 — read-only сравнение operational adoption текущего и предыдущего равного периода.
- #243 — reconciliation исторических migration aliases для risk/readiness/task/broker/viewer/adoption.
- #242 — предыдущий handoff.
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
- Последняя live migration: `20260713160524_nav_v2_operational_adoption_health_registration`.
- Adoption report split-deploy:
  - `20260713160355_nav_v2_operational_adoption_report_core`;
  - `20260713160446_nav_v2_operational_adoption_active_profile_guard`;
  - `20260713160524_nav_v2_operational_adoption_health_registration`.
- Canonical fresh-install SQL:
  - `20260713193000_nav_v2_operational_adoption_report.sql`;
  - `20260713193500_nav_v2_operational_adoption_active_profile_guard.sql`.
- `nav-invite-user`: v10 ACTIVE, `verify_jwt=true`, SHA `14020dac054cadf3ca86d19313cf2bc2b012aca9d634e76e8dd0ffde11b05a5f`.
- `nav-v2-deal-api`: v4 ACTIVE, `verify_jwt=true`, SHA `b64e3fdbc2fa22ccb4998e69232e4351308f1d9b0a7c3c2bec7093186d3e4095`.
- RPC grant health: 49 items, 0 problems.
- Frontend RPC coverage: 42 items, 0 problems.
- Рабочие строки после adoption deployment и PR #244 не менялись.

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

## PR #244 — сравнение периодов

- Используется существующий read-only RPC без новой migration.
- Экран параллельно запрашивает `N` и `2N` дней.
- Предыдущий равный период выводится вычитанием только аддитивных метрик.
- Сравниваются подтверждённые результаты, выполненные задачи, закрытые риски, подтверждённые документы, сделки без активности, клиентские действия и quality warnings.
- Единого рейтинга сотрудника или команды нет.
- Исторический backlog не сравнивается: прошлые snapshots открытых задач, рисков и документов не сохранялись.
- Current 30 days: 1 deal with result, 15 activity without result, 0 no activity, 18 client actions, 34 quality warnings.
- Previous 30 days: 1 deal with result, 8 activity without result, 7 no activity, 24 client actions, 0 quality warnings.
- Interpretation: активность распространилась на большее число сделок, но подтверждённый результат не вырос; число клиентских действий снизилось, а quality warnings выросли.
- PR #244 checks: static PASS; JavaScript PASS; public desktop/mobile PASS; review threads 0.
- `authenticated-smoke` был `skipped`, это не authenticated PASS.

## Security и access

- Public adoption wrapper: authenticated EXECUTE=true; anon=false; PUBLIC=false.
- Private adoption implementation: service_role only; authenticated/anon/PUBLIC=false.
- SPN invocation: SQLSTATE `42501`, PASS.
- Access helpers остаются в `nav_v2_private`; публичные дубли не восстановлены.
- Advisor warning для adoption RPC ожидаем и зарегистрирован в Navigator-only scope gate.
- Массовый revoke запрещён.
- Leaked-password protection остаётся выключенной до invite/recovery E2E.
- Performance Advisor не показал новой Navigator v2 проблемы от adoption report.

## Release drift

- Baseline latest live: `20260713160524`.
- `config/nav-v2-release-migration-aliases.json` связывает live timestamp versions с reviewed canonical SQL и Git blob SHA.
- PR #243 добавил aliases для risk resolution, manager readiness, task taxonomy, broker queue и viewer workspace.
- PR #241/#243 alias workflows сохраняют evidence artifact и падают на неизвестном repository-only/remote-only drift.
- Первый approved production workflow run с Environment secrets ещё требует ручной настройки владельца.

## Рабочие данные

- Deals: 21.
- Documents: 168.
- Tasks: 92.
- Risks: 49.
- Events: 116.
- Активные профили: owner 1, lawyer 1, SPN 3; active admin/manager/broker/viewer отсутствуют.
- Один active SPN без `manager_id`; назначение вслепую запрещено.
- Реальных сделок: 16.
- Все 16 требуют manager attention и не имеют manager/exception.
- 2 сделки без SPN.
- Lawyer waiting: 11; broker waiting: 5.
- Все 76 открытых рабочих задач просрочены.
- Persisted task contracts: 0; preview использует inference.
- Реальные назначения, статусы, task types и SLA автоматически не менялись.

## Authenticated E2E blocker

- Supabase development branch отсутствует: план ранее вернул `Branching is supported only on the Pro plan or above`.
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

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #244. Один раз проверь Environment navigator-production-readonly, isolated auth target и manager confirmation. Если release Environment настроен — запусти approved drift report и обнови #177. Если auth/manager остаются blocked — реализуй read-only manager assignment proposal из manager_id назначенных SPN с явными состояниями single candidate/conflict/missing source, без mutation и без изменения реальных сделок. Заверши branch → PR → CI → merge → Supabase verification → handoff.`
