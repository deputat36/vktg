# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 2026-07-13.
- Runtime main: `37440757132574263e289ec2805619b6842e0930` — PR #236.
- Этот файл и production baseline публикуются отдельным docs/config PR; его merge SHA будет новее runtime baseline.
- Открытых runtime PR после #236: 0.
- Canonical frontend build: `20260711-01`.
- Deal-card budget: 22; механическое сокращение без новой продуктовой причины запрещено.

## Последние product и release slices

- #236 — nullable persisted `task_type`/`sla_days` и read-only сравнение сохранённого контракта с inference.
- #235 — controlled read-only migration/Edge drift report с GitHub Environment approval и release artifacts.
- #233 — owner/admin меню: «Работа», «Команда и доступы», «Система».
- #232 — SPN handoff после сохранения: кому передано, что дальше, ответственный и контрольный срок.
- #230 — lawyer focus mode.
- #228 — viewer workspace.
- #227 — broker triage.
- #226 — task taxonomy.
- #225 — manager queue UX.
- #224 — role-aware dashboard.
- #222 — operational readiness.
- #220 — risk lifecycle; #218 закрыта.

## Supabase

- Project: `ofewxuqfjhamgerwzull`.
- Последняя live migration: `20260713151053_nav_v2_task_contract_preview`.
- GitHub source: `supabase/migrations/20260713172000_nav_v2_task_contract_preview.sql`.
- Migration добавила nullable `task_type` и `sla_days`, constraints и обновила существующий read-only taxonomy RPC.
- Существующие задачи не обновлялись: persisted task type = 0, persisted SLA = 0.
- `nav-invite-user`: v10 ACTIVE, `verify_jwt=true`, SHA `14020dac054cadf3ca86d19313cf2bc2b012aca9d634e76e8dd0ffde11b05a5f`.
- `nav-v2-deal-api`: v4 ACTIVE, `verify_jwt=true`, SHA `b64e3fdbc2fa22ccb4998e69232e4351308f1d9b0a7c3c2bec7093186d3e4095`.
- Live RPC health: 48 items, 0 problems.
- Frontend coverage: 42 items, 0 problems.
- Private helper health: 6 items, 0 problems.
- Counts: 21 deals / 168 documents / 92 tasks / 49 risks / 116 events.

## PR #235 — release drift gate

- Добавлен `config/nav-v2-release-baseline.json` с подтверждёнными migration/Edge значениями.
- Добавлен parser/report `scripts/check_nav_v2_release_drift.py`.
- Добавлен ручной workflow `.github/workflows/nav-v2-release-drift.yml`.
- Workflow использует Environment `navigator-production-readonly` и сохраняет JSON/Markdown/migration/function evidence.
- Workflow read-only: нет `db push`, Edge deploy, migration repair, SQL mutations или изменения secrets.
- Static CI проверяет parser, source Git blobs, baseline и отсутствие deploy-команд.
- Live Supabase вручную сверена: migrations и обе Edge Functions совпадали с baseline до следующей migration.
- После #236 baseline обновлён на `20260713151053`; Edge metadata не менялась.
- GitHub Environment, secrets и первый approved workflow run ещё требуют ручной настройки владельца.
- Issue #177 остаётся открытой до первого approved PASS и решения о дальнейшем controlled deploy процессе.

## PR #236 — persisted task contract preview

- Добавлены nullable поля `nav_deal_tasks_v2.task_type` и `sla_days`.
- Допустимые типы: operational task, document request, quality warning, system recommendation, legal blocker, broker task, management escalation.
- SLA ограничен диапазоном 1–365 дней.
- Defaults и `NOT NULL` не добавлялись.
- Существующие 92 задачи не переклассифицированы и не обновлены.
- Read-only preview возвращает persisted, inferred и effective значения.
- Состояния контракта: `not_persisted`, `partial`, `matches_inference`, `overrides_inference`.
- UI показывает сохранённые/расчётные значения и фильтр «Без сохранённого контракта».
- Mutation controls и прямой table access отсутствуют.
- Transaction/rollback DDL rehearsal: PASS; после rollback contract columns = 0.
- После merge/live migration: columns = 2; constraints validated; persisted values = 0.
- Owner preview: 76 открытых рабочих задач, missing contracts = 76, partial/override/persisted = 0.
- Entity counts после migration не изменились.

## Проверки

- PR #235 static CI: parser self-test, baseline-only, workflow contract и release-integrity PASS; review threads 0.
- PR #236 static, persisted contract regression, taxonomy regression, release integrity, JavaScript и public desktop/mobile PASS; review threads 0.
- `authenticated-smoke` в PR #236 был `skipped`; authenticated role PASS отсутствует.
- Security Advisor после #236: ожидаемый warning для curated `nav_v2_get_task_taxonomy_preview`; массовый revoke запрещён.
- Leaked-password protection остаётся выключенной.
- Performance Advisor не показал новой Navigator v2 проблемы от nullable contract columns; оставшийся шум относится legacy/generic/другим подсистемам и unused indexes.

## Auth E2E blocker

- Supabase branch отсутствует: текущий план ранее вернул `Branching is supported only on the Pro plan or above`.
- GitHub Environment `navigator-e2e`, disposable accounts и mailbox отсутствуют.
- Invite/access-link/password/recovery/email delivery: BLOCKED.
- Browser task/document/risk/status mutations: BLOCKED.
- Leaked-password protection не включалась.

## Operational state

- Реальных сделок: 16.
- Manager attention: 16; без manager/exception: 16; без SPN: 2.
- Lawyer waiting: 11; broker waiting: 5.
- Blocking risk: 16; overdue task: 16; overdue required document: 12.
- Task preview: 76 просроченных; quality 34, operational 26, legal 11, broker 5.
- Persisted task contracts: 0; все 76 пока используют безопасный inference.
- Реальные назначения, статусы, task types и SLA автоматически не менялись.
- Один активный SPN без `manager_id`; назначение вслепую запрещено.

## Открытые issues

- #16, #156, #157, #159, #161, #164, #176, #177, #179, #199.
- #199 не выполнять без отдельного решения.

## Ручные действия владельца

1. Для #177 создать GitHub Environment `navigator-production-readonly`, required reviewer и secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`; выполнить workflow с `allow_drift=false`.
2. Supabase Pro branch либо отдельный test project для authenticated E2E.
3. Создать GitHub Environment `navigator-e2e` и disposable role accounts/mailbox.
4. Подтвердить manager assignments/exceptions по реальным сделкам.
5. Не сохранять массово task type/SLA до authenticated mutation E2E и утверждённого preview/audit workflow.

## NEXT_WORK_QUEUE

- P0 BLOCKED — isolated target + authenticated role/invite/recovery/mutation E2E.
- P0 MANUAL — manager assignments/exceptions.
- P1 MANUAL — первый approved release drift workflow run с `allow_drift=false`; затем обновить #177 фактическим artifact/result.
- P1 BLOCKED ON AUTH EVIDENCE — audited point task contract mutation: preview → one task → audit event → reload verification; никаких bulk updates.
- P1 BLOCKED ON CONFIRMATION — audited point manager assignment.
- P1 UNBLOCKED — read-only operational adoption report: сделки без активности, реальные действия против quality warnings, закрытые задачи/риски/документы за период; без изменения строк.
- P1 — leaked-password protection только после auth E2E.
- DO NOT REPEAT — общий аудит, guest/no-JWT/private-helper smoke, deal-card consolidation, risk #218, operational/task/broker/viewer previews, lawyer focus, SPN handoff, owner/admin IA, release drift infrastructure и persisted task contract schema без новой причины.

## Команда следующего запуска

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #236. Один раз проверь isolated auth target, manager confirmation и Environment navigator-production-readonly. Если release Environment настроен — запусти approved drift report и обнови #177. Если всё заблокировано — реализуй read-only operational adoption report без изменения рабочих строк. Заверши branch → PR → CI → merge → Supabase verification → handoff.`
