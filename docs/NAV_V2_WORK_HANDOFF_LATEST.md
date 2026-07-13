# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 2026-07-13.
- Runtime main: `181b2a9d77d71724be96032aa616da2f686bca89` — PR #233.
- Этот файл публикуется docs-only PR; его merge SHA будет новее runtime baseline.
- Открытых runtime PR после #233: 0.
- Canonical frontend build: `20260711-01`.
- Deal-card budget: 22; механическое сокращение без новой продуктовой причины запрещено.

## Последние product slices

- #233 — owner/admin меню: «Работа», «Команда и доступы», «Система»; исправлено удаление технических ссылок у owner/admin.
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
- Последняя live migration: `20260713091921_nav_v2_viewer_operational_workspace`.
- GitHub source: `supabase/migrations/20260713090856_nav_v2_viewer_operational_workspace.sql`.
- PR #230, #232, #233 frontend-only; DDL, RLS, grants, Edge и рабочие строки не менялись.
- `nav-invite-user`: v10 ACTIVE, `verify_jwt=true`, SHA `14020dac054cadf3ca86d19313cf2bc2b012aca9d634e76e8dd0ffde11b05a5f`.
- `nav-v2-deal-api`: v4 ACTIVE, `verify_jwt=true`, SHA `b64e3fdbc2fa22ccb4998e69232e4351308f1d9b0a7c3c2bec7093186d3e4095`.
- Live RPC health: 48 items, 0 problems.
- Frontend coverage: 42 items, 0 problems.
- Counts: 21 deals / 168 documents / 92 tasks / 49 risks / 116 events.

## Проверки

- PR #232: static, SPN handoff regression, JavaScript, BAZA и public desktop/mobile PASS; review threads 0.
- PR #233: static, role contract, owner/admin IA, JavaScript и public desktop/mobile PASS; review threads 0.
- `authenticated-smoke` в обоих PR был `skipped`; authenticated role PASS отсутствует.
- Прямой GitHub Pages fetch из текущей среды не выполнен из-за DNS/safe-URL ограничения.

## Auth E2E blocker

- Supabase branch отсутствует: текущий план ранее вернул `Branching is supported only on the Pro plan or above`.
- GitHub Environment `navigator-e2e`, disposable accounts и mailbox отсутствуют.
- Invite/access-link/password/recovery/email delivery: BLOCKED.
- Leaked-password protection не включалась.

## Operational state

- Реальных сделок: 16.
- Manager attention: 16; без manager/exception: 16; без SPN: 2.
- Lawyer waiting: 11; broker waiting: 5.
- Blocking risk: 16; overdue task: 16; overdue required document: 12.
- Task preview: 76 просроченных; quality 34, operational 26, legal 11, broker 5.
- Реальные назначения и статусы автоматически не менялись.
- Один активный SPN без `manager_id`; назначение вслепую запрещено.

## PR #232

- Save RPC и redirect мастера не менялись.
- В `sessionStorage` временно сохраняются только deal ID, next action и время.
- Карточка созданной сделки показывает передачу, следующий этап, ответственного и ближайший срок.
- Используется существующий responsibility snapshot и уже загруженные tasks.
- Если срока нет, интерфейс сообщает это явно.
- Новых RPC, DDL и mutations нет.

## PR #233

- Owner/admin маршруты сгруппированы по назначению.
- Активная группа подсвечивается; мобильное раскрытие поддержано.
- Исправлен `nav-base-menu-cleanup-v2.js`: системные ссылки сохраняются у owner/admin и скрываются у остальных.
- Набор маршрутов и серверные права не изменены.

## Открытые issues

- #16, #156, #157, #159, #161, #164, #176, #177, #179, #199.
- #199 не выполнять без отдельного решения.

## Ручные действия владельца

1. Supabase Pro branch либо отдельный test project.
2. GitHub Environment `navigator-e2e` и disposable role accounts/mailbox.
3. Подтвердить manager assignments/exceptions по реальным сделкам.

## NEXT_WORK_QUEUE

- P0 BLOCKED — isolated target + authenticated role/invite/recovery/mutation E2E.
- P0 MANUAL — manager assignments/exceptions.
- P1 BLOCKED ON CONFIRMATION — audited point manager assignment.
- P1 UNBLOCKED — issue #177: migration/Edge drift report, controlled release summary и post-deploy verification без автоматического production deploy.
- P1 UNBLOCKED — persisted task type/SLA contract и preview без изменения существующих строк.
- P1 — leaked-password protection только после auth E2E.
- DO NOT REPEAT — общий аудит, guest/no-JWT/private-helper smoke, deal-card consolidation, risk #218, operational/task/broker/viewer previews, lawyer focus, SPN handoff и owner/admin IA без новой причины.

## Команда следующего запуска

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #233. Один раз проверь isolated auth target и manager assignments. Если заблокировано, начни #177: drift report, controlled release summary и post-deploy verification без автоматического production deploy. Заверши branch → PR → CI → merge → Supabase verification → handoff.`
