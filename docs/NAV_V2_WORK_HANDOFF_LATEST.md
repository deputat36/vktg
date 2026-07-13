# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 2026-07-13.
- Текущий product `main`: `c3228d9a12d8f3b1d26ea56933e7df7ce89223b1` — PR #252.
- Текущий release-sync: ветка `agent/nav-v2-responsibility-evidence-release-sync`.
- Последняя production migration: `20260713180701_nav_v2_responsibility_evidence_candidates`.
- Canonical frontend build: `20260711-01`.
- Deal-card budget: 22; механическое сокращение без новой продуктовой причины запрещено.

## Последние завершённые PR

- #252 — доставлен отсутствовавший source-remediation UI, role-safe route, evidence-only responsibility candidates и обязательный CI gate.
- #251 — release baseline/aliases после source-remediation deploy.
- #250 — grouped source-remediation SQL и regression source; UI delivery в этом PR не состоялся, dedicated workflow был красным. Gap исправлен PR #252.
- #249 — release baseline/aliases после manager assignment proposal.
- #248 — read-only manager assignment proposal.
- #247 — release baseline/aliases после exact-period comparison.
- #246 — точные непересекающиеся current/previous SQL-окна.
- #243 — reconciliation исторических migration aliases.
- #241 — adoption split-deploy history и alias-aware release drift.
- #240 — отчёт «Движение и результат».
- #239 — Navigator-only Advisor scope gate.
- #238 — source history для live task contract migration.
- #237 — release baseline.
- #236 — nullable `task_type` / `sla_days` preview.
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
- Latest live: `20260713180701_nav_v2_responsibility_evidence_candidates`.
- Canonical source: `20260713233000_nav_v2_responsibility_evidence_candidates.sql`.
- Canonical source blob: `7d540b25b8e9127e058e44a05a6123b781c934c3`.
- Previous source-remediation live: `20260713173156`, canonical `20260713223000`.
- Manager proposal live: `20260713170608`, canonical `20260713213000`.
- Exact-period live: `20260713164757`, canonical `20260713203000`.
- `nav-invite-user`: v10 ACTIVE, `verify_jwt=true`, SHA `14020dac054cadf3ca86d19313cf2bc2b012aca9d634e76e8dd0ffde11b05a5f`.
- `nav-v2-deal-api`: v4 ACTIVE, `verify_jwt=true`, SHA `b64e3fdbc2fa22ccb4998e69232e4351308f1d9b0a7c3c2bec7093186d3e4095`.
- RPC grant health: 49 items, 0 problems.
- Frontend RPC coverage: 42 items, 0 problems.

## Operational adoption

Текущий 30-дневный owner/admin/manager snapshot:

- 16 сделок в scope.
- 1 подтверждённый результат.
- 15 сделок с активностью без подтверждённого результата.
- Confirmed result rate: 6.3%.
- 52 созданные задачи, 18 client actions, 34 quality warnings.
- 76 открытых задач; все 76 просрочены.
- 44 открытых риска.
- 119 просроченных обязательных документов.
- 16 сделок без manager/exception.
- 2 сделки без СПН.

Сравнение с предыдущими 30 днями:

- Current: 16 сделок, 1 результат, rate 6.3%.
- Previous: 9 сделок, 1 результат, rate 11.1%.
- Delta: +7 сделок и −4.8 процентного пункта.
- Исторический backlog не реконструируется.
- Автоматический рейтинг сотрудника отсутствует.

## Manager assignment proposal

- Public report version: 5.
- Private helper: `nav_v2_private.nav_v2_get_manager_assignment_proposal_unchecked_20260713(integer)`.
- Состояния: `already_assigned`, `single_candidate`, `conflict`, `missing_source`.
- Live: 16 `missing_source`, остальные состояния 0.
- Candidate выводится только из `manager_id` корректного активного СПН стороны сделки.
- `mutation_available=false`; bulk update и кнопки назначения отсутствуют.

## Grouped source remediation

Private helper:

`nav_v2_private.nav_v2_get_manager_source_remediation_plan_unchecked_20260713(integer)`

Пять live-групп:

1. 10 сделок: `buyer_spn_id` указывает на owner-профиль.
2. 10 сделок: `seller_spn_id` указывает на owner-профиль.
3. Овчинников Александр Константинович — активный СПН без `manager_id`; 4 сделки, 7 сторон.
4. 3 сделки без `seller_spn_id`.
5. 2 сделки без `buyer_spn_id`.

Порядок исправления:

1. Подтвердить фактических СПН и заменить owner-профиль в полях сторон.
2. Подтвердить менеджера Овчинникова и заполнить `manager_id` точечно.
3. Заполнить отсутствующие стороны после проверки карточек.
4. Повторно запустить manager proposal.
5. Только после этого рассматривать point manager assignment.

## PR #252 — responsibility evidence и фактическая доставка UI

- Добавлены реальные файлы `manager-source-remediation-v2.html` и `assets/js/nav-v2/manager-source-remediation-v2.js`.
- Маршрут доступен только owner/admin/manager.
- СПН, юрист, брокер и viewer не получают ссылку.
- Browser продолжает использовать один `nav_v2_get_operational_adoption_report`.
- Private evidence helper: `nav_v2_private.nav_v2_get_responsibility_evidence_unchecked_20260713(integer)`.
- Учитываются только активные профили с ролью `spn`.
- Независимые сигналы:
  - создатель сделки;
  - участник;
  - автор события;
  - создатель, исполнитель и завершивший задачу;
  - ответственный и проверивший документ.
- Live evidence summary:
  - deals in scope: 16;
  - strong single evidence: 4;
  - weak single evidence: 0;
  - multiple candidates: 0;
  - no active SPN evidence: 12.
- Во всех четырёх strong-evidence сделках кандидат — Овчинников А. К.
- На сделку: 5 независимых типов сигналов и 8–11 действий.
- У кандидата `manager_id` отсутствует.
- Evidence не определяет сторону сделки и не выполняет назначение.
- `selection_available=false`, `mutation_available=false`.

## Delivery governance

Выявленный gap:

- PR #250 был смержен при зелёном общем static suite, но dedicated workflow был `failure` из-за отсутствующих HTML/JS/menu файлов.
- PR #252 фактически доставил экран и исправил governance.

Теперь:

- dedicated workflow проверяет SQL, HTML, JS, menu, role contract, RPC registry и mutation-запреты;
- тот же regression включён в общий static suite;
- отсутствие delivery-файлов ломает оба gate;
- PR #252: dedicated PASS, static PASS, JavaScript PASS, Advisor PASS, public desktop/mobile PASS, review threads 0;
- authenticated-smoke был `skipped`; это не authenticated PASS.

## Security и access

- Public adoption wrapper: authenticated=true, anon=false, PUBLIC=false.
- Adoption, comparison, manager proposal, remediation и evidence implementations: service_role only.
- Private evidence helper: PUBLIC=false, anon=false, authenticated=false, service_role=true.
- SPN invocation: SQLSTATE `42501`, PASS.
- Active manager profile отсутствует; live manager invocation не выполнен.
- Security Advisor не показал новую внешнюю Navigator API.
- Performance Advisor остаётся shared-project списком; автоматическое удаление индексов запрещено.
- Leaked-password protection не включать до invite/recovery E2E.

## Рабочие данные

До и после evidence deployment:

- Deals: 21.
- Documents: 168.
- Tasks: 92.
- Risks: 49.
- Events: 116.
- Persisted task type: 0.
- Persisted SLA: 0.
- Реальные назначения и статусы автоматически не менялись.

## Release drift

- Baseline latest live после текущего release-sync: `20260713180701`.
- Live `20260713180701` связан с canonical `20260713233000` и blob `7d540b25b8e9127e058e44a05a6123b781c934c3`.
- Alias manifest: 12 approved live mappings и 12 canonical repository-only sources.
- Неизвестный repo-only или remote-only drift по-прежнему ломает gate.
- Первый approved workflow run в Environment `navigator-production-readonly` требует ручной настройки владельца.

## Authenticated E2E blocker

- Supabase development branch отсутствует; Branching требует Pro или выше.
- Отдельного test project нет.
- GitHub Environment `navigator-e2e`, disposable role accounts и mailbox отсутствуют.
- Authenticated Playwright matrix: BLOCKED.
- Invite/access-link/password/recovery/email delivery: BLOCKED.
- Browser task/document/risk/status mutations: BLOCKED.

## Ручные действия владельца

1. Создать Environment `navigator-production-readonly`, required reviewer и secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`.
2. Запустить `.github/workflows/nav-v2-release-drift.yml` для `main` с `allow_drift=false`.
3. Подтвердить Овчинникова как фактического СПН по четырём evidence-сделкам и определить его менеджера.
4. Подтвердить фактических СПН для остальных 12 сделок, где active-SPN evidence отсутствует.
5. Для auth E2E создать Pro branch или отдельный test project и Environment `navigator-e2e`.
6. Не выполнять массовые task type/SLA/assignment updates до authenticated mutation E2E.

## NEXT_WORK_QUEUE

- P0 MANUAL — approved release drift workflow run с `allow_drift=false`.
- P0 MANUAL — подтверждение СПН по 4 evidence-сделкам, 12 no-evidence сделкам и manager_id Овчинникова.
- P0 BLOCKED — isolated target + authenticated role/invite/recovery/mutation E2E.
- P1 BLOCKED ON CONFIRMATION — audited point correction одного SPN field и одного manager_id, только после явного подтверждения владельца.
- P1 BLOCKED ON AUTH EVIDENCE — audited synthetic task contract mutation.
- P1 — leaked-password protection только после auth E2E.
- DO NOT REPEAT — общий аудит, guest/no-JWT/private-helper smoke, deal-card consolidation, risk #218, operational/task/broker/viewer previews, lawyer focus, SPN handoff, owner/admin IA, task contract schema, Advisor scope gate, adoption snapshot/comparison, manager proposal, grouped remediation и responsibility evidence без новой причины.

## Команда следующего запуска

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #252 и live migration 20260713180701. Один раз проверь Environment navigator-production-readonly, isolated auth target и owner confirmation. Если release Environment настроен — запусти approved drift report и обнови #177. Если owner подтвердил СПН/manager_id — выполни только одну audited point correction с pre/post snapshot и audit evidence. Если подтверждения нет — не меняй реальные назначения; улучши только confirmation workflow или evidence export без mutation.`
