# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 2026-07-13.
- Текущий product `main`: `53c4d3ed12b883aff1ce82ebd821700ab4c1f118` — PR #254.
- Текущий release-sync: ветка `agent/nav-v2-responsibility-confirmation-release-sync`.
- Последняя production migration: `20260713184344_nav_v2_responsibility_confirmation_context`.
- Canonical frontend build: `20260711-01`.
- Deal-card budget: 22; механическое сокращение без новой продуктовой причины запрещено.

## Последние завершённые PR

- #254 — browser-local лист подтверждения ответственности, JSON/CSV export и read-only каталог СПН/менеджеров.
- #253 — release baseline/aliases после responsibility evidence deploy.
- #252 — доставлен source-remediation UI, role-safe route, evidence-only responsibility candidates и обязательный CI gate.
- #251 — release baseline/aliases после grouped source-remediation deploy.
- #250 — grouped source-remediation SQL; UI delivery в этом PR не состоялся, gap исправлен PR #252.
- #249/#248 — release sync и read-only manager assignment proposal.
- #247/#246 — release sync и exact current/previous period comparison.
- #243/#241 — migration alias reconciliation и adoption split-deploy history.
- #240 — отчёт «Движение и результат».
- #239 — Navigator-only Advisor scope gate.
- #238/#237/#236 — task contract source history, release baseline и nullable task type/SLA preview.
- #235 — controlled read-only migration/Edge drift report.
- #233/#232/#230/#228/#227/#226/#225/#224/#222/#220 — owner/admin IA, SPN handoff, lawyer focus, viewer, broker, taxonomy, manager UX, role dashboard, readiness и risk lifecycle.

## Supabase production

- Project: `ofewxuqfjhamgerwzull`.
- Latest live: `20260713184344_nav_v2_responsibility_confirmation_context`.
- Canonical source: `20260713234500_nav_v2_responsibility_confirmation_context.sql`.
- Canonical source blob: `c4ee976a59e2645c04c97948e234d69b8a7d03d1`.
- Previous evidence live: `20260713180701`, canonical `20260713233000`.
- Grouped remediation live: `20260713173156`, canonical `20260713223000`.
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

- Public report version: 6.
- Private helper: `nav_v2_private.nav_v2_get_manager_assignment_proposal_unchecked_20260713(integer)`.
- Live: 16 `missing_source`; `already_assigned`, `single_candidate`, `conflict` = 0.
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

## Responsibility evidence

- Private helper: `nav_v2_private.nav_v2_get_responsibility_evidence_unchecked_20260713(integer)`.
- Учитываются только активные профили с ролью `spn`.
- Сигналы: creator, participant, event actor, task creator/assignee/completer, document assignee/checker.
- Live summary:
  - deals in scope: 16;
  - strong single evidence: 4;
  - weak single evidence: 0;
  - multiple candidates: 0;
  - no active SPN evidence: 12.
- Во всех четырёх strong-evidence сделках кандидат — Овчинников А. К.
- На сделку: 5 независимых типов сигналов и 8–11 действий.
- Evidence не определяет сторону сделки и не выполняет назначение.
- `selection_available=false`, `mutation_available=false`.

## PR #254 — локальный лист подтверждения

Private context helper:

`nav_v2_private.nav_v2_get_responsibility_confirmation_context_unchecked_20260713(integer)`

Live context:

- context version: 1;
- active SPN options: 3;
- SPN without manager: 1 — Овчинников А. К.;
- manager options: 1 — Алексей Ковтун, role owner;
- `local_draft_available=true`;
- `local_storage_only=true`;
- `export_available=true`;
- `server_selection_available=false`;
- `server_mutation_available=false`.

Экран `manager-source-remediation-v2.html` теперь позволяет:

- для каждой сделки выбрать локальный статус проверки;
- подготовить `seller_spn_id` и `buyer_spn_id`;
- явно выбрать сторону для evidence-кандидата;
- оставить основание или вопрос для уточнения;
- подготовить менеджера для каждого активного СПН;
- сохранить черновик только в `localStorage` текущего браузера и текущего пользователя;
- скачать JSON;
- скачать CSV с UTF-8 BOM;
- скопировать текстовую сводку.

Экспорт содержит текущие и предлагаемые значения, evidence summary, комментарии и safety markers. Он не подтверждает изменение данных в Supabase и не вызывает mutation RPC.

## Проверки PR #254

- Dedicated remediation/confirmation contract: PASS.
- Полный static suite: PASS.
- JavaScript syntax: PASS.
- Advisor scope CI: PASS.
- Public desktop/mobile Playwright: PASS.
- Review threads: 0.
- `authenticated-smoke`: `skipped`; это не authenticated PASS.
- DDL rehearsal выполнен с `ROLLBACK`.
- Rehearsal и production дали одинаковый context summary 3/1/1.

## Security и access

- Public adoption wrapper: authenticated=true, anon=false, PUBLIC=false.
- Adoption, comparison, proposal, remediation, evidence и confirmation implementations: service_role only.
- Private confirmation helper: PUBLIC=false, anon=false, authenticated=false, service_role=true.
- SPN invocation: SQLSTATE `42501`, PASS.
- Внешняя browser RPC surface не увеличена.
- `server_selection_available=false`, `server_mutation_available=false`.
- Supabase Advisors после production DDL через connector не получены: оба вызова вернули permission denied. Не считать это Advisor PASS.
- Отдельный Advisor scope CI PR #254 прошёл.
- Leaked-password protection не включать до invite/recovery E2E.

## Рабочие данные

До и после confirmation context deployment:

- Deals: 21.
- Documents: 168.
- Tasks: 92.
- Risks: 49.
- Events: 116.
- Profiles: 5.
- Active SPN: 3.
- Active SPN without manager: 1.
- Persisted task type: 0.
- Persisted SLA: 0.
- Реальные `seller_spn_id`, `buyer_spn_id`, `manager_id`, статусы и задачи не менялись.

## Release drift

- Baseline latest live после текущего release-sync: `20260713184344`.
- Live `20260713184344` связан с canonical `20260713234500` и blob `c4ee976a59e2645c04c97948e234d69b8a7d03d1`.
- Alias manifest: 13 approved live mappings и 13 canonical repository-only sources.
- Неизвестный repo-only или remote-only drift по-прежнему ломает gate.
- Первый approved workflow run в Environment `navigator-production-readonly` требует ручной настройки владельца.

## Authenticated E2E blocker

- Supabase development branch отсутствует; доступна только production `main`.
- Отдельного test project нет.
- GitHub Environment `navigator-e2e`, disposable role accounts и mailbox отсутствуют.
- Authenticated Playwright matrix: BLOCKED.
- Invite/access-link/password/recovery/email delivery: BLOCKED.
- Browser task/document/risk/status mutations: BLOCKED.
- Workflow success при `authenticated-smoke=skipped` не является authenticated PASS.

## Ручные действия владельца

1. Открыть `manager-source-remediation-v2.html` под owner/admin.
2. Заполнить локальный лист по четырём evidence-сделкам и двенадцати сделкам без evidence.
3. Подтвердить сторону Овчинникова по каждой сделке, а не переносить его сразу в обе стороны.
4. Подтвердить manager_id Овчинникова; единственный текущий option — Алексей Ковтун.
5. Скачать JSON или CSV и сохранить как evidence решения.
6. После явного подтверждения выполнить только одну audited point correction с pre/post snapshot и audit evidence.
7. Создать Environment `navigator-production-readonly`, required reviewer и secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`.
8. Запустить `.github/workflows/nav-v2-release-drift.yml` для `main` с `allow_drift=false`.
9. Для auth E2E создать Pro branch или отдельный test project и Environment `navigator-e2e`.

## NEXT_WORK_QUEUE

- P0 MANUAL — заполнить локальный confirmation draft и выгрузить JSON/CSV.
- P0 MANUAL — approved release drift workflow run с `allow_drift=false`.
- P0 BLOCKED — isolated target + authenticated role/invite/recovery/mutation E2E.
- P1 BLOCKED ON EXPLICIT EXPORT/CONFIRMATION — одна audited point correction одного SPN field либо manager_id.
- P1 BLOCKED ON AUTH EVIDENCE — audited synthetic task contract mutation.
- P1 — leaked-password protection только после auth E2E.
- DO NOT REPEAT — общий аудит, guest/no-JWT/private-helper smoke, deal-card consolidation, risk #218, operational/task/broker/viewer previews, lawyer focus, SPN handoff, owner/admin IA, task contract schema, Advisor scope gate, adoption snapshot/comparison, manager proposal, grouped remediation, evidence candidates и local confirmation draft без новой причины.

## Команда следующего запуска

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #254 и live migration 20260713184344. Один раз проверь Environment navigator-production-readonly, isolated auth target и наличие явного JSON/CSV confirmation export. Если export содержит подтверждённое решение — выполни только одну audited point correction с pre/post snapshot и audit evidence. Если подтверждения нет — не меняй реальные назначения.`
