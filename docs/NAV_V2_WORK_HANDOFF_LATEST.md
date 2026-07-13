# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 2026-07-13.
- Текущий `main`: `ab71ee03da1df448f28d47aaef28b7ecfb281bb8` — PR #241.
- Последний product runtime: `6a56c7b59df04171e8dc364c2eda39a74e01b1ea` — PR #240.
- Открытых PR после #241: 0.
- Canonical frontend build: `20260711-01`.
- Deal-card budget: 22; механическое сокращение без новой продуктовой причины запрещено.

## Последние завершённые PR

- #241 — синхронизация production adoption history, alias-aware release drift и baseline.
- #240 — read-only отчёт внедрения «Движение и результат».
- #239 — Navigator-only Supabase Advisor scope gate.
- #238 — source history для live task contract migration.
- #237 — release baseline и предыдущий handoff.
- #236 — nullable persisted `task_type` / `sla_days` и read-only contract preview.
- #235 — controlled read-only migration/Edge drift report.
- #233 — owner/admin information architecture.
- #232 — явный SPN handoff после сохранения.
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
- Adoption report был применён безопасным split-deploy:
  - `20260713160355_nav_v2_operational_adoption_report_core`;
  - `20260713160446_nav_v2_operational_adoption_active_profile_guard`;
  - `20260713160524_nav_v2_operational_adoption_health_registration`.
- Canonical fresh-install SQL сохранён в:
  - `20260713193000_nav_v2_operational_adoption_report.sql`;
  - `20260713193500_nav_v2_operational_adoption_active_profile_guard.sql`.
- Split history описана в `config/nav-v2-release-migration-aliases.json` с canonical Git blob SHA и причинами.
- Release baseline: `config/nav-v2-release-baseline.json`, latest live `20260713160524`.
- `nav-invite-user`: v10 ACTIVE, `verify_jwt=true`, SHA `14020dac054cadf3ca86d19313cf2bc2b012aca9d634e76e8dd0ffde11b05a5f`.
- `nav-v2-deal-api`: v4 ACTIVE, `verify_jwt=true`, SHA `b64e3fdbc2fa22ccb4998e69232e4351308f1d9b0a7c3c2bec7093186d3e4095`.

## Operational adoption report

Read-only owner/admin/manager report for 30 days after live deployment:

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
- Created risks: 18.
- Open risks: 44.
- Open tasks: 76.
- Overdue tasks: 76.
- Overdue required documents: 119.
- Missing manager: 16.
- Missing SPN: 2.
- Needs attention: 16.
- Stale 7+ days: 16.

Interpretation:

- Система фиксирует активность, но почти не получает подтверждённого завершения.
- Quality warnings не считаются клиентским результатом.
- Рабочие строки отчётом не изменяются.
- SPN получает серверный запрет SQLSTATE `42501`.

## Security и RPC health

- RPC grant health: 49 items, 0 problems, `ok=true`.
- Frontend RPC coverage: 42 items, 0 problems, `ok=true`.
- Public adoption wrapper: authenticated EXECUTE=true; anon=false; PUBLIC=false.
- Private adoption implementation: authenticated=false; anon=false; PUBLIC=false; service_role only.
- Access helpers остаются в `nav_v2_private`; публичные дубли не восстановлены.
- Новый Advisor WARN для `nav_v2_get_operational_adoption_report` ожидаем: curated browser RPC с active-profile и role gate.
- `config/nav-v2-advisor-scope.json` и CI запрещают неизвестные Navigator warnings и массовый auto-revoke.
- Leaked-password protection остаётся выключенной до успешного invite/recovery E2E.
- Performance Advisor не показал новой Navigator v2 проблемы от adoption report; оставшийся шум относится legacy/generic/другим подсистемам и unused indexes.

## Release drift

- PR #241 добавил alias-aware reporter `scripts/check_nav_v2_release_drift_aliases.py`.
- Approved split-deploy versions:
  - `20260713160355` → canonical `20260713193000`;
  - `20260713160446` → canonical `20260713193500`;
  - `20260713160524` → canonical `20260713193000` health section.
- Approved repository-only canonical/forward versions:
  - `20260713172000` represented by live `20260713151053`;
  - `20260713193000` represented by live `20260713160355` + `20260713160524`;
  - `20260713193500` represented by live `20260713160446`.
- Любая другая repository-only или remote-only migration продолжает падать.
- Alias blob SHA проверяются в CI.
- PR #241 checks: migration alias workflow PASS; общий static suite PASS; review threads 0.
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
- Persisted task contracts: 0; текущий preview использует безопасный inference.
- Реальные назначения, статусы, task types и SLA автоматически не менялись.

## Authenticated E2E blocker

- Supabase development branch отсутствует: текущий план ранее вернул `Branching is supported only on the Pro plan or above`.
- Отдельного test project нет.
- GitHub Environment `navigator-e2e`, disposable role accounts и mailbox отсутствуют.
- Authenticated Playwright matrix: BLOCKED.
- Invite/access-link/password/recovery/email delivery: BLOCKED.
- Browser task/document/risk/status mutations: BLOCKED.
- Успешный workflow с `authenticated-smoke=skipped` не является authenticated PASS.

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
- P1 BLOCKED ON AUTH EVIDENCE — audited point task contract mutation: preview → одна synthetic task → audit event → reload verification; никаких bulk updates.
- P1 BLOCKED ON CONFIRMATION — audited point manager assignment.
- P1 UNBLOCKED — добавить read-only сравнение adoption report с предыдущим равным периодом: текущий результат против предыдущего, без изменения строк и без оценки сотрудников одним числом.
- P1 — leaked-password protection только после auth E2E.
- DO NOT REPEAT — общий аудит, guest/no-JWT/private-helper smoke, deal-card consolidation, risk #218, operational/task/broker/viewer previews, lawyer focus, SPN handoff, owner/admin IA, task contract schema, Advisor scope gate и базовый adoption snapshot без новой причины.

## Команда следующего запуска

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #241. Один раз проверь Environment navigator-production-readonly, isolated auth target и manager confirmation. Если release Environment настроен — запусти approved drift report и обнови #177. Если auth/manager остаются blocked — реализуй read-only сравнение operational adoption текущего периода с предыдущим равным периодом, без mutation и без изменения рабочих строк. Заверши branch → PR → CI → merge → Supabase verification → handoff.`
