# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 2026-07-13.
- Текущий product `main`: `ffc0d29f42317ae797d83845bd169e9f67c46c36` — PR #250.
- Runtime release-sync: ветка `agent/nav-v2-source-remediation-release-sync` после production migration `20260713173156`.
- Canonical frontend build: `20260711-01`.
- Deal-card budget: 22; механическое сокращение без новой продуктовой причины запрещено.

## Последние завершённые PR

- #250 — grouped read-only manager source remediation plan.
- #249 — release baseline/aliases/handoff после manager assignment proposal deploy.
- #248 — read-only manager assignment proposal внутри operational adoption report.
- #247 — release baseline/aliases/handoff после exact period comparison deploy.
- #246 — точные непересекающиеся server-side окна current/previous period.
- #243 — reconciliation исторических migration aliases.
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
- Последняя live migration: `20260713173156_nav_v2_manager_source_remediation_plan`.
- Canonical source: `20260713223000_nav_v2_manager_source_remediation_plan.sql`.
- Canonical source blob: `d7af8ac6e1ad7c17d8c087e86620af9214162df6`.
- Предыдущая manager proposal migration: live `20260713170608`, canonical `20260713213000`.
- Exact-period migration: live `20260713164757`, canonical `20260713203000`.
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

## Точное сравнение периодов

- Browser использует один `nav_v2_get_operational_adoption_report`.
- Private helper: `nav_v2_private.nav_v2_get_operational_adoption_period_comparison_unchecked_20260713(integer)`.
- Два SQL-окна непересекающиеся и одинаковой длины.
- Сделка входит в период только если `deal.created_at < period_end`.
- Выполнение задачи учитывается по стабильному `completed_at`.
- Исторический backlog не реконструируется: `historical_backlog_included=false`.
- Единого рейтинга сотрудника нет: `employee_score=false`.
- Current 30 days: 16 сделок; 1 с результатом; 15 activity without result; rate 6.3%.
- Previous 30 days: 9 сделок; 1 с результатом; 8 activity without result; rate 11.1%.
- Delta: +7 сделок, +7 activity without result, −4.8 п.п.

## Manager assignment proposal

- Public report version после PR #250: 4.
- Private helper: `nav_v2_private.nav_v2_get_manager_assignment_proposal_unchecked_20260713(integer)`.
- Состояния: `already_assigned`, `single_candidate`, `conflict`, `missing_source`.
- Кандидат выводится только из `manager_id` корректного активного СПН, уже назначенного на сторону сделки.
- `mutation_available=false`; кнопки назначения и bulk update отсутствуют.
- Live summary: 16 missing_source; 0 already_assigned; 0 single_candidate; 0 conflict.
- Массовое назначение менеджера недопустимо до исправления СПН и `manager_id`.

## PR #250 — grouped source remediation plan

- Private helper: `nav_v2_private.nav_v2_get_manager_source_remediation_plan_unchecked_20260713(integer)`.
- Browser продолжает использовать прежний adoption RPC; внешняя RPC surface не увеличена.
- Отдельный экран: `manager-source-remediation-v2.html` для owner/admin/manager.
- `mutation_available=false`; автоматические исправления и массовые назначения отсутствуют.
- План содержит 5 групп и затрагивает 16 уникальных сделок:
  1. 10 сделок: `buyer_spn_id` указывает на owner-профиль вместо СПН.
  2. 10 сделок: `seller_spn_id` указывает на owner-профиль вместо СПН.
  3. Профиль СПН Овчинникова А. К. не имеет `manager_id`; затронуто 4 сделки и 7 сторон.
  4. 3 сделки без `seller_spn_id`.
  5. 2 сделки без `buyer_spn_id`.
- Порядок ручного исправления:
  1. заменить owner-профиль в полях СПН на фактических СПН;
  2. после подтверждения владельца заполнить `manager_id` профиля СПН;
  3. заполнить отсутствующие стороны сделки;
  4. повторно запустить manager assignment proposal;
  5. только затем рассматривать точечное назначение менеджера.
- DDL rehearsal выполнен с `ROLLBACK`.
- Production verification: report version 4; remediation groups 5; affected deals 16; mutation=false.
- PR #250 checks: dedicated contract PASS; static PASS; JavaScript PASS; Advisor scope PASS; public desktop/mobile PASS; review threads 0.
- `authenticated-smoke` был `skipped`; это не authenticated PASS.

## Security и access

- Public adoption wrapper: authenticated EXECUTE=true; anon=false; PUBLIC=false.
- Private adoption, comparison, manager proposal и source remediation implementations: service_role only.
- Private helpers: authenticated/anon/PUBLIC=false.
- SPN invocation source-remediation report: SQLSTATE `42501`, PASS.
- Active manager-профиля нет, поэтому live manager invocation не выполнен.
- Security Advisor после DDL не показал нового внешнего Navigator RPC.
- Performance Advisor остаётся shared-project списком; автоматическое удаление индексов запрещено.
- Массовый revoke запрещён.
- Leaked-password protection остаётся выключенной до invite/recovery E2E.

## Release drift

- Baseline latest live после текущего release-sync: `20260713173156`.
- Live `20260713173156` связан с canonical `20260713223000` и blob `d7af8ac6e1ad7c17d8c087e86620af9214162df6`.
- Alias manifest содержит 11 approved live mappings и 11 canonical repository-only sources.
- Alias workflows сохраняют evidence artifact и падают на неизвестном repository-only/remote-only drift.
- Первый approved production workflow run с Environment secrets всё ещё требует ручной настройки владельца.

## Рабочие данные

До и после source remediation migration counts совпали:

- Deals: 21.
- Documents: 168.
- Tasks: 92.
- Risks: 49.
- Events: 116.
- Persisted task type: 0.
- Persisted SLA: 0.
- Активные профили: owner 1, lawyer 1, SPN 3; active admin/manager/broker/viewer отсутствуют.
- Один active SPN без `manager_id`.
- Реальных сделок: 16.
- Все 16 требуют manager attention и не имеют manager/exception.
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
- #157 — active SPN без manager и исправление источников manager proposal.
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
5. Подтвердить фактических СПН по пяти группам source remediation plan и менеджера для Овчинникова А. К.
6. Не сохранять массово task type/SLA и не менять реальные назначения до authenticated mutation E2E.

## NEXT_WORK_QUEUE

- P0 MANUAL — первый approved release drift workflow run с `allow_drift=false`.
- P0 BLOCKED — isolated target + authenticated role/invite/recovery/mutation E2E.
- P0 MANUAL — подтверждение фактических СПН и manager_id по пяти remediation groups.
- P1 UNBLOCKED — evidence-only responsibility candidates: для каждой затронутой сделки показать активных СПН, уже связанных с ней через creator/participants/events/tasks/documents, с числом подтверждающих сигналов; не выбирать кандидата и не выполнять mutation.
- P1 BLOCKED ON AUTH EVIDENCE — audited point task contract mutation: preview → одна synthetic task → audit event → reload verification.
- P1 BLOCKED ON CONFIRMATION — audited point manager assignment.
- P1 — leaked-password protection только после auth E2E.
- DO NOT REPEAT — общий аудит, guest/no-JWT/private-helper smoke, deal-card consolidation, risk #218, operational/task/broker/viewer previews, lawyer focus, SPN handoff, owner/admin IA, task contract schema, Advisor scope gate, базовый adoption snapshot, period comparison, manager proposal и grouped source remediation без новой причины.

## Команда следующего запуска

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #250 и live migration 20260713173156. Один раз проверь Environment navigator-production-readonly, isolated auth target и owner confirmation. Если release Environment настроен — запусти approved drift report и обнови #177. Если auth/confirmation остаются blocked — реализуй evidence-only responsibility candidates для пяти source-remediation groups: creator/participants/events/tasks/documents, число независимых сигналов, без автоматического выбора, mutation и изменения реальных данных. Заверши branch → PR → CI → merge → Supabase verification → handoff.`
