# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 2026-07-13.
- Runtime main: `c530bee44367e9d44210c50e82bfe9e257e4f981` — PR #230.
- Этот файл публикуется отдельным docs-only PR; его merge SHA будет новее runtime baseline.
- Открытых runtime PR после #230: 0.
- Canonical frontend build: `20260711-01`.
- Deal-card budget: 22; механическое сокращение без новой продуктовой причины запрещено.

## Последние product slices

- #230 — lawyer focus mode: одна следующая важная сделка, причина, одно главное действие, переход к следующей, progressive disclosure.
- #228 — компактный viewer workspace.
- #227 — брокерская очередь предварительной оценки.
- #226 — task taxonomy и отделение quality warnings.
- #225 — упрощённая manager queue.
- #224 — role-aware dashboard.
- #222 — operational readiness и manager preview.
- #220 — risk resolve/reopen lifecycle; issue #218 закрыта.

## Supabase

- Project: `ofewxuqfjhamgerwzull`.
- Последняя live migration: `20260713091921_nav_v2_viewer_operational_workspace`.
- GitHub source: `supabase/migrations/20260713090856_nav_v2_viewer_operational_workspace.sql`.
- PR #230 frontend-only: migrations, RLS, grants и рабочие строки не менялись.
- `nav-invite-user`: v10, ACTIVE, `verify_jwt=true`, SHA `14020dac054cadf3ca86d19313cf2bc2b012aca9d634e76e8dd0ffde11b05a5f`.
- `nav-v2-deal-api`: v4, ACTIVE, `verify_jwt=true`, SHA `b64e3fdbc2fa22ccb4998e69232e4351308f1d9b0a7c3c2bec7093186d3e4095`.
- Live RPC grant health после #230: 48 items, 0 problems, `ok=true`.
- Frontend RPC coverage: 42 items, 0 problems, `ok=true`.
- Рабочие counts: 21 deals / 168 documents / 92 tasks / 49 risks / 116 events.
- Access helpers остаются в `nav_v2_private`; публичные дубли не восстановлены.

## Role/browser status

| Роль | DB/API/Static | Authenticated browser |
|---|---|---|
| owner | PASS | BLOCKED |
| admin | Static PASS | BLOCKED |
| manager | DB/API + Static PASS | BLOCKED |
| spn | DB/API PASS | BLOCKED |
| lawyer | Queue/priority + focus regression PASS | BLOCKED |
| broker | DB/API + Static PASS | BLOCKED |
| viewer | DB/API rollback + Static PASS | BLOCKED |

- PR #230: static suite PASS, lawyer focus regression PASS, JavaScript syntax PASS, public desktop/mobile smoke PASS, review threads 0.
- Workflow success не является authenticated PASS: job `authenticated-smoke` был `skipped`.
- Реальная authenticated visual/mutation matrix не выполнена.
- Прямой GitHub Pages fetch из текущей среды заблокирован DNS/safe-URL ограничением; не считать production Pages PASS.

## Auth E2E blocker

- Supabase development branch отсутствует; текущий план ранее вернул `Branching is supported only on the Pro plan or above`.
- GitHub Environment `navigator-e2e`, disposable role credentials и mailbox отсутствуют.
- Production test users не создавались.
- Invite/access-link/password/recovery/email delivery: BLOCKED.
- Leaked-password protection не включалась.

## Operational state

- Реальных сделок без demo: 16.
- Manager attention: 16; manager/exception отсутствует у 16; без SPN — 2.
- Lawyer waiting: 11; broker waiting: 5.
- Blocking risk: 16; overdue task: 16; overdue required document: 12.
- Task preview: 76 открытых и просроченных; quality 34, operational 26, legal 11, broker 5.
- Broker preview: 5 сделок, все без broker, 5 overdue broker tasks, 19 missing finance fields.
- Реальные назначения, сроки и статусы автоматически не менялись.
- Один активный SPN без `manager_id`; назначение вслепую запрещено.

## Что изменил PR #230

- Кабинет юриста больше не начинается с плотного полного списка.
- Первый экран показывает одну наиболее важную сделку.
- Выделены «Почему сейчас», «Главное действие» и SPN по клиентам.
- Есть переход «Следующая сделка».
- KPI и вся очередь раскрываются по запросу.
- Сохранены только два существующих read-only RPC: `nav_v2_get_lawyer_queue` и `nav_v2_get_lawyer_review_summary`.
- Mutation surface и новая migration отсутствуют.
- Добавлен `scripts/check_nav_v2_lawyer_focus.py`.

## Открытые issues

- #16 invite/recovery/password E2E.
- #156 operational data quality.
- #157 SPN без manager.
- #159 authenticated visual audit.
- #161 Security Advisor и leaked-password protection.
- #164 release readiness.
- #176 master roadmap.
- #177 release pipeline/drift.
- #179 frontend architecture/role tests.
- #199 legacy decommission — не выполнять без отдельного решения.

## Ручные действия владельца

1. Для auth E2E нужен Supabase Pro branch либо отдельный test project без реальных данных.
2. Создать GitHub Environment `navigator-e2e` и disposable role accounts/mailbox.
3. Owner/admin вручную подтвердить manager assignment либо исключение по реальным сделкам.

## Следующие задачи

1. P0 BLOCKED — isolated target + authenticated role/invite/recovery/browser mutation matrix.
2. P0 MANUAL — подтверждение manager assignments/exceptions; затем audited point-assignment lifecycle.
3. P1 UNBLOCKED — SPN handoff после сохранения: кому передано, что дальше, ответственный и срок.
4. P1 — owner/admin information architecture.
5. P1 — controlled release pipeline и migration/Edge drift checks.

## NEXT_WORK_QUEUE

- P0 — isolated Supabase target + `navigator-e2e` Environment.
- P0 — authenticated Playwright matrix и invite/recovery/mutation E2E.
- P0 MANUAL — подтвердить manager assignments/exceptions.
- P1 BLOCKED ON CONFIRMATION — safe point manager assignment с preview и audit event.
- P1 UNBLOCKED — SPN operational handoff после сохранения.
- P1 — owner/admin IA без технической лексики в рабочих разделах.
- P1 — release pipeline/drift checks.
- BLOCKED — isolated target, secrets, disposable accounts и mailbox отсутствуют.
- DO NOT REPEAT — общий аудит, public guest/no-JWT/private-helper smoke, deal-card consolidation, risk #218, operational/task/broker/viewer previews и lawyer focus без новой причины.

## Команда следующего запуска

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #230. Не повторяй завершённые smoke/audit/product slices без новой причины. Один раз проверь isolated auth target. Если manager assignments подтверждены — сделай audited point-assignment. Иначе реализуй SPN operational handoff после сохранения. Заверши branch → PR → CI → merge → migration только при необходимости → production smoke → handoff.`
