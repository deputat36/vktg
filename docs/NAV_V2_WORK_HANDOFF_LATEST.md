# Navigator v2 — актуальный handoff

## 1. Дата и время

- 2026-07-13 11:23 CEST / 09:23 UTC.

## 2. Текущий main SHA

- Runtime main: `eb08d02a31a3b4cae37a5cb5b003709caa80f4c1` — squash merge PR #228.
- Этот handoff публикуется отдельным docs-only PR; его merge SHA будет новее runtime baseline, но не меняет приложение или Supabase.

## 3. Runtime code baseline

- `eb08d02a31a3b4cae37a5cb5b003709caa80f4c1`.
- Canonical frontend build: `20260711-01`.
- `deal-card-v2.html`: budget 22 entry-модуля; дальнейшее механическое сокращение запрещено без новой продуктовой причины.
- Специализированные read-only рабочие места: `manager-v2.html`, `task-review-v2.html`, `broker-v2.html`, `viewer-v2.html`.
- Ролевой dashboard ведёт manager в контроль, lawyer в юридическую очередь, broker в брокерскую очередь, viewer в отдельный компактный обзор.

## 4. Последняя live migration

- Live version: `20260713091921_nav_v2_viewer_operational_workspace`.
- GitHub source: `supabase/migrations/20260713090856_nav_v2_viewer_operational_workspace.sql`.
- Migration не создаёт таблиц и не меняет рабочие строки, RLS или table grants.
- Существующий read-only RPC `nav_v2_get_operational_readiness_preview(integer)` разрешает роль viewer только для сделок, которые уже разрешены `nav_v2_private.nav_v2_can_view_deal(...)`.

Предыдущие live product migrations:

- `20260712205117_nav_v2_broker_triage_queue` → `20260712203000_nav_v2_broker_triage_queue.sql`.
- `20260712200429_nav_v2_task_taxonomy_preview` → `20260712190000_nav_v2_task_taxonomy_preview.sql`.
- `20260712163919_nav_v2_operational_readiness_manager_queue` → `20260712162609_nav_v2_operational_readiness_manager_queue.sql`.

## 5. Edge Functions

- `nav-invite-user`: v10, ACTIVE, `verify_jwt=true`, SHA-256 `14020dac054cadf3ca86d19313cf2bc2b012aca9d634e76e8dd0ffde11b05a5f`.
- `nav-v2-deal-api`: v4, ACTIVE, `verify_jwt=true`, SHA-256 `b64e3fdbc2fa22ccb4998e69232e4351308f1d9b0a7c3c2bec7093186d3e4095`.
- Edge Functions в PR #224–#228 не менялись и не деплоились.

## 6. Смерженные PR после предыдущего handoff

- #224 — role-aware dashboard, единая терминология, `aria-current` и keyboard focus.
- #225 — упрощённая визуальная иерархия manager queue: 4 главных KPI и одно главное действие.
- #226 — read-only task taxonomy и отдельный разбор рабочих задач/quality warnings.
- #227 — отдельная брокерская очередь предварительной финансовой оценки.
- #228 — отдельный компактный viewer workspace на операционной готовности.
- Runtime merge #228: `eb08d02a31a3b4cae37a5cb5b003709caa80f4c1`.

Предыдущие завершённые точки:

- #222 — операционный минимум, правдивая readiness и manager queue.
- #220 — risk resolve/reopen lifecycle.

## 7. Открытые PR

- 0 перед созданием docs-only handoff PR.
- После merge docs-only PR снова должно быть 0 открытых PR.

## 8. Закрытые issues

- #218 — безопасный lifecycle устранения и повторного открытия риска; закрыта после PR #220, production migration и rollback mutation E2E.

## 9. Открытые issues

- #16 — invite/recovery/password E2E.
- #156 — operational data quality cleanup.
- #157 — один активный СПН без `manager_id`.
- #159 — authenticated mobile/desktop visual audit.
- #161 — Security Advisor и leaked-password protection.
- #164 — release readiness checklist.
- #176 — master roadmap; обновлена фактами #222, #224–#228.
- #177 — release pipeline и drift checks.
- #179 — frontend architecture и authenticated role tests; обновлена фактами #222, #226 и #228.
- #199 — legacy decommission; не выполнять без отдельного решения.

## 10. Role matrix

| Роль | DB/API | Реальный browser | Статус |
|---|---|---|---|
| guest | Исторически: browser RPC 401, private helpers 404 | PR #228 public desktop/mobile guest gates PASS | Historical/API PASS; не повторять без причины |
| owner | production operational preview: 16 real deals; RPC/grants/coverage PASS | disposable credentials отсутствуют | DB/API PASS; authenticated browser BLOCKED |
| admin | static route/menu/admin guards; read-only product pages разрешены | isolated `nav-e2e` user отсутствует | Static PASS; browser BLOCKED |
| manager | operational/task/broker server gates и team scope rollback/static tests | isolated `nav-e2e` user отсутствует | DB/API + Static PASS; browser BLOCKED |
| spn | ранее проверены свои сделки и forbidden mutations | isolated `nav-e2e` user отсутствует | DB/API PASS; browser BLOCKED |
| lawyer | server prioritization и risk lifecycle ранее проверены | isolated `nav-e2e` user отсутствует | DB/API PASS; browser BLOCKED |
| broker | read-only broker preview, role route и access helper contract PASS | isolated `nav-e2e` user отсутствует | DB/API + Static PASS; browser BLOCKED |
| viewer | rollback role test: доступные сделки >0, forbidden rows 0; dedicated route/static contract PASS | isolated viewer отсутствует | DB/API rollback + Static PASS; browser BLOCKED |

Важно:

- Workflow `Navigator v2 authenticated browser E2E` в PR #228 завершился success за счёт `public-smoke`; job `authenticated-smoke` был `skipped`.
- Это не является authenticated role PASS и не разрешает production test users, массовые grants/RLS changes или leaked-password protection.

## 11. Isolated auth target и invite/recovery

- Supabase branches: только default `main`; отдельного development branch нет.
- Текущий план ранее отклонил создание branch: `Branching is supported only on the Pro plan or above`.
- GitHub Environment `navigator-e2e`, disposable role credentials и mailbox отсутствуют.
- Production `nav-e2e` Auth users не создавались.
- Invite, access link, password setup, login/logout, recovery, invalid/expired/reused link и email delivery: BLOCKED.
- Leaked-password protection не включалась.

## 12. Mutation E2E

### Risk lifecycle #218

- Lawyer resolve/reopen, идемпотентность, row lock, audit events и forbidden SPN прошли внутри транзакции с итоговым `ROLLBACK`.
- Persistent synthetic rows: 0.

### Browser mutations

- Task/document/risk/deal-status authenticated browser lifecycle: BLOCKED до isolated target.
- Manager assignment mutation не реализован: owner/admin не подтвердил соответствия менеджеров или исключения по 16 сделкам.
- Реальные сделки, назначения, сроки и статусы автоматически не менялись.

## 13. Operational aggregates

Рабочие агрегаты после #228 не изменились:

- Сделки 21; документы 168; задачи 92; риски 49; события 116.
- Активные профили 5: owner 1, lawyer 1, spn 3; admin/manager/broker/viewer 0.
- Один активный СПН без `manager_id`; назначение вслепую не выполнялось.
- По общему аудиту: открытые задачи 86, завершённых 0; открытые риски 49, resolved 0; просроченные обязательные документы 125.

Operational readiness real-deal preview:

- Рабочие сделки 16; demo исключены.
- Средняя legacy readiness к задатку 68,8%; operational readiness 21,9%.
- Legacy 80%+: 5; operational 80%+: 0; скрытые расхождения: 5.
- Требуют внимания manager: 16; без manager/exception: 16; без СПН: 2.
- Lawyer waiting: 11; broker waiting: 5.
- Blocking risk: 16; overdue task: 16; overdue required document: 12.
- Полный следующий шаг с владельцем/ролью и сроком найден у всех 16 через operational tasks; quality warnings не выбираются главным клиентским действием.

Task taxonomy real-deal preview после #226:

- Открытых задач в preview: 76; все просрочены.
- Quality warnings: 34; operational tasks: 26; legal blockers: 11; broker tasks: 5.
- Классификация, SLA, контрольная дата, состояние владельца и причина просрочки read-only; рабочие строки не переклассифицированы автоматически.

Broker preview после #227:

- `broker_needed`: 5; без назначенного broker: 5; просроченных broker tasks: 5.
- Сертификат: 1; маткапитал: 1; отсутствующих полей первичной финансовой оценки: 19.
- Банк, статус/дата заявки, причина отказа и банковское решение пока не моделируются.

## 14. Security Advisor

- Security Advisor: 52 WARN.
- `nav_v2_get_operational_readiness_preview` имеет ожидаемый `authenticated_security_definer_function_executable`: это намеренно browser-callable read-only RPC с role gate и deal scope.
- Remediation reference: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- `authenticated` EXECUTE=true; `anon` и `PUBLIC` EXECUTE=false.
- Viewer migration не создала новую функцию и не добавила новый Advisor object; существующий intentional WARN сохранился.
- Массовый revoke запрещён; legacy `nav_*`, `leader_*`, `parket_*` и generic CRM не менялись.

## 15. Performance Advisor

- Performance Advisor: 164 notices — 29 WARN, 135 INFO.
- Предупреждений, привязанных к operational preview/viewer migration, нет.
- Оставшиеся notices относятся к существующим `auth_rls_initplan`, `multiple_permissive_policies`, `unindexed_foreign_keys` и `unused_index` в нескольких подсистемах.

## 16. RPC health

После live migrations #226–#228:

- `nav_v2_get_rpc_grant_health`: 48 items, 0 problems, `ok=true`.
- Frontend RPC coverage: 42 items, 0 problems, `ok=true`.
- Operational, task taxonomy и broker preview RPC присутствуют в curated reports.
- `nav_v2_get_operational_readiness_preview`: authenticated=true; anon=false; PUBLIC=false.
- Все 11 Navigator v2 tables используют RLS; прямые authenticated table privileges без role E2E не сокращались массово.

## 17. Private helper health

- Access helpers остаются в `nav_v2_private`; публичные дубли не восстановлены.
- Viewer operational scope вызывает `nav_v2_private.nav_v2_can_view_deal(d.id, v_uid)`.
- Transaction/rollback test подтвердил: viewer preview не возвращает строк, для которых helper даёт false.
- Public PostgREST smoke private helpers ранее PASS; без новой причины не повторять.

## 18. Что исправлено

- Manager больше не ориентируется только на процент анкеты; отдельная очередь показывает причину, владельца, срок и главное действие.
- Manager first screen сокращён до 4 KPI, вторичные данные раскрываются по запросу.
- Рабочие задачи визуально и серверно отделены от quality warnings в read-only preview.
- Broker получил отдельную очередь с назначением, финансовым минимумом, сроком и честными границами текущей модели.
- Viewer получил отдельный компактный read-only обзор: статус, operational readiness, препятствие, ответственные, дата и история.
- Для #224–#228 добавлены focused regressions, role/module/CSP contracts и public routes.

Что сознательно не исправлялось автоматически:

- 16 реальных сделок без manager/exception.
- Незаполненные имена сторон.
- Просроченные tasks/documents и открытые risks.
- Реальные role/profile assignments.

## 19. Что реально проверено для #228

- Branch `agent/nav-v2-viewer-workspace`, PR #228, 1 commit, 17 файлов.
- Local Navigator static suite: PASS.
- JavaScript syntax для Navigator/E2E modules: PASS.
- Focused viewer regression, role contract, operational readiness, module budget, CSP, RPC surface и E2E contract: PASS.
- Transaction/rollback DDL: PASS; viewer accessible deals >0, forbidden rows 0, required fields PASS.
- После rollback: исходный DDL восстановлен, persistent viewer profiles 0.
- PR CI: static success; JavaScript syntax success; public desktop/mobile success; review threads 0.
- PR #228 merged: `eb08d02a31a3b4cae37a5cb5b003709caa80f4c1`.
- Live migration применена: `20260713091921_nav_v2_viewer_operational_workspace`.
- Production owner preview: 16 real deals; critical gaps <80%; grant/coverage health PASS.
- Working counts после migration: 21/92/168/49/116; persistent viewer profiles 0.
- GitHub Pages: `viewer-v2.html`, viewer JS и viewer CSS отвечают HTTP 200 и содержат release markers.
- Security и Performance Advisors запущены после DDL.
- Issues #176 и #179 обновлены фактическими результатами.

## 20. Что не удалось проверить

- Реальная authenticated viewer session desktop/mobile.
- Viewer console/page errors после login и проверка данных после reload.
- Authenticated Playwright matrix всех ролей.
- Invite/recovery/password/email delivery.
- Browser task/document/risk/status mutations.
- Leaked-password protection после invite/recovery.
- Корректность конкретных manager assignments/exceptions по реальным сделкам без ручного решения owner/admin.

## 21. Созданные тестовые данные

- Supabase development branches: 0.
- Production Auth users: 0.
- Persistent profiles/deals/documents/tasks/risks/events: 0.
- Viewer rollback test временно менял роль существующего СПН внутри транзакции; итоговый `ROLLBACK`, persistent viewer profiles 0.
- GitHub secrets и Environment variables не создавались.

## 22. Cleanup

- Предварительная DDL transaction завершена `ROLLBACK`; затем точный migration SQL применён только после merge.
- Временная смена роли rollback-теста не сохранилась.
- Production Auth cleanup не требовался.
- Supabase development branch не создан, поэтому branch cleanup не требуется.

## 23. Ручные действия владельца

Для auth E2E нужен один из безопасных вариантов:

1. Включить Supabase development branching на Pro и создать `nav-e2e` branch либо создать отдельный test project без реальных данных.
2. Создать GitHub Environment `navigator-e2e`.
3. Добавить test URL, publishable key и disposable role credentials по `tests/e2e/README.md`.
4. Использовать только email с техническим префиксом `nav-e2e`; подключить disposable mailbox.
5. Запустить `target=all`; owner — только disposable owner и явный opt-in.

Отдельное продуктовое решение:

6. Owner/admin вручную открыть `manager-v2.html` и подтвердить manager assignment либо документированное исключение для каждой из 16 реальных сделок.

## 24. Три следующие задачи

1. P0 BLOCKED — isolated target + authenticated role/invite/recovery/browser mutation matrix.
2. P0 MANUAL — подтверждение manager assignments/exceptions; только затем отдельный audited point-assignment lifecycle с preview, audit event и reload verification.
3. P1 UNBLOCKED — упростить кабинет юриста: одна следующая наиболее важная сделка, одно главное действие, детали и вторичные KPI по запросу; сохранить существующую серверную приоритизацию.

Следующие независимые кандидаты после lawyer focus:

- SPN handoff после сохранения: кому передано, что произойдёт дальше и к какому сроку.
- Owner/Admin information architecture: Команда, Доступы, Качество данных, Безопасность/диагностика.
- Полный persisted task type/SLA lifecycle и безопасный mutation preview после auth evidence.

## 25. Точная команда следующего Work-запуска

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #228. Не повторяй общий аудит, public guest/no-JWT/private-helper smoke, deal-card consolidation, risk lifecycle #218, operational/task/broker/viewer preview без новой причины. Один раз проверь isolated auth target. Если owner подтвердил manager assignments/exceptions — сделай отдельный audited point-assignment slice. Если подтверждения нет — не меняй реальные сделки и реализуй lawyer focus: следующая наиболее важная сделка, одно главное действие и progressive disclosure. Заверши branch → PR → CI → merge → migration только при необходимости → production smoke → handoff.`

## NEXT_WORK_QUEUE

- P0 — Supabase development branch на Pro либо отдельный test project + GitHub Environment `navigator-e2e`.
- P0 — authenticated Playwright matrix admin/manager/spn/lawyer/broker/viewer; owner только disposable.
- P0 — invite/access-link/password/recovery и browser task/document/risk/status mutation matrix на synthetic data.
- P0 MANUAL — owner/admin подтвердить manager assignment/exception по 16 реальным сделкам.
- P1 BLOCKED ON CONFIRMATION — safe point manager assignment + preview + audit event; без автоматического bulk update.
- P1 UNBLOCKED — lawyer focus mode: одна наиболее важная сделка, одно действие, progressive disclosure и переход к следующей.
- P1 — SPN operational minimum и явный handoff после сохранения.
- P1 — owner/admin information architecture без технической лексики в рабочих разделах.
- P1 — после успешного auth E2E включить leaked-password protection и повторить password/recovery smoke.
- BLOCKED — isolated target, Environment secrets, disposable role accounts и mailbox отсутствуют.
- DO NOT REPEAT — полный аудит, public guest smoke, no-JWT RPC/Edge smoke, private helper relocation/smoke, deal-card consolidation 30→22, backend risk lifecycle #218 и его rollback E2E, уже выполненные operational/task/broker/viewer previews без новой причины.
