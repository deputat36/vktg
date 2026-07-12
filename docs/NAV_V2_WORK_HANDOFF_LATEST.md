# Navigator v2 — актуальный handoff

## 1. Дата и время

- 2026-07-12 18:42 CEST / 16:42 UTC.

## 2. Текущий main SHA

- Runtime main: `32a298d273492cc9a2d2be9602a5f4c72407fe84` — squash merge PR #222.
- Этот handoff публикуется отдельным docs-only PR; его merge SHA будет новее runtime baseline, но не меняет приложение или Supabase.

## 3. Runtime code baseline

- `32a298d273492cc9a2d2be9602a5f4c72407fe84`.
- `deal-card-v2.html`: budget 22 entry-модуля.
- Canonical frontend build: `20260711-01`.
- Risk lifecycle подключён к существующему explicit deal-card hook без отдельного entry-module.
- Добавлены read-only RPC операционной готовности и самостоятельный `manager-v2.html`; deal-card budget не менялся.

## 4. Последняя live migration

- Live version: `20260712163919_nav_v2_operational_readiness_manager_queue`.
- GitHub source: `supabase/migrations/20260712162609_nav_v2_operational_readiness_manager_queue.sql`.
- Migration добавила только read-only RPC `nav_v2_get_operational_readiness_preview(integer)` и включила его в curated RPC health/coverage; рабочие строки и RLS не менялись.

## 5. Edge Functions

- `nav-invite-user`: v10, ACTIVE, `verify_jwt=true`, SHA-256 `14020dac054cadf3ca86d19313cf2bc2b012aca9d634e76e8dd0ffde11b05a5f`.
- `nav-v2-deal-api`: v4, ACTIVE, `verify_jwt=true`, SHA-256 `b64e3fdbc2fa22ccb4998e69232e4351308f1d9b0a7c3c2bec7093186d3e4095`.
- Edge Functions в этом запуске не деплоились.

## 6. Смерженные PR текущего запуска

- #222 — `Add truthful operational readiness and manager queue`.
- Runtime merge: `32a298d273492cc9a2d2be9602a5f4c72407fe84`.
- Отдельный docs-only PR обновляет этот handoff после #222.

Предыдущая инфраструктурная точка:

- #220 — risk resolution lifecycle.
- #221 — предыдущая версия handoff.

## 7. Открытые PR

- Нет перед созданием docs-only handoff PR.
- После merge docs-only PR снова должно быть 0 открытых PR.

## 8. Закрытые issues

- #218 — безопасный lifecycle устранения и повторного открытия риска; закрыта после PR #220, production migration и rollback mutation E2E.

## 9. Открытые issues

- #16 — invite/recovery/password E2E.
- #156 — operational data quality cleanup.
- #157 — один активный СПН без `manager_id`.
- #159 — authenticated mobile/desktop visual audit.
- #161 — Security Advisor и leaked password protection.
- #164 — release readiness checklist.
- #176 — master roadmap.
- #177 — release pipeline и drift checks.
- #179 — frontend architecture и authenticated role tests.
- #199 — legacy decommission; не выполнять без отдельного решения.

## 10. Role matrix

| Роль | DB/API | Реальный browser | Статус |
|---|---|---|---|
| guest | Ранее: browser RPC 401, private helpers 404 | Ранее: auth-gates desktop/mobile | Historical PASS; не повторять без причины |
| owner | production operational preview: 16 real deals; RPC/grants/coverage PASS | disposable credentials отсутствуют | DB/API PASS; browser BLOCKED |
| admin | static route/menu/admin guards | isolated `nav-e2e` user отсутствует | Static PASS; browser BLOCKED |
| manager | server role gate и team scope rollback-test; route/menu/CSP PASS | isolated `nav-e2e` user отсутствует | DB/API + Static PASS; browser BLOCKED |
| spn | profile/dashboard/свои сделки/запрет чужой ранее проверены; forbidden risk mutation PASS | isolated `nav-e2e` user отсутствует | DB/API PASS; browser BLOCKED |
| lawyer | profile/dashboard/deals/card ранее проверены; risk resolve/reopen PASS в rollback transaction | isolated `nav-e2e` user отсутствует | DB/API PASS; browser BLOCKED |
| broker | static route/menu contract | isolated `nav-e2e` user отсутствует | Static PASS; browser BLOCKED |
| viewer | static route/menu contract; risk UI contract запрещает mutation control | isolated `nav-e2e` user отсутствует | Static PASS; browser BLOCKED |

Важно:

- GitHub workflow содержит authenticated matrix, но job `authenticated-smoke` в PR #222 был `skipped` из-за отсутствующих Environment secrets.
- Успех workflow означает успех public/static job, а не authenticated browser PASS.

## 11. Invite/recovery result

- Static invite/recovery validator: PASS.
- `nav-invite-user` остаётся JWT-protected.
- Production `nav-e2e` Auth users в этом запуске не создавались.
- Access link, password setup, login, logout, recovery, invalid/expired/reused link и email delivery: BLOCKED.
- Supabase development branch создать не удалось: API вернул `Branching is supported only on the Pro plan or above`.
- Предварительная стоимость branch была подтверждена как `$0.01344/hour`, но создание отклонено текущим планом.
- GitHub Environment `navigator-e2e`, role credentials и disposable mailbox отсутствуют.
- Leaked-password protection не включалась.

## 12. Mutation E2E result

### Risk lifecycle #218

Production migration применена, а mutation E2E выполнен на синтетической сделке и риске внутри одной транзакции с итоговым `ROLLBACK`:

- lawyer resolve: PASS;
- `is_resolved=true`, `resolved_at`, `resolved_by`, `updated_at`: PASS;
- повторный resolve: `changed=false`, PASS;
- повторный resolve не создаёт второе событие: PASS;
- reopen: PASS;
- reopen очищает `resolved_at` и `resolved_by`: PASS;
- `risk_resolved` / `risk_reopened` audit events: PASS;
- непривязанный СПН получает SQLSTATE `42501`: PASS;
- persistent test rows: 0.

### Browser mutations

- Risk resolve/reopen click-through в реальном браузере: BLOCKED до isolated environment.
- Task/document/status authenticated browser lifecycle: BLOCKED до isolated environment.
- Реальные сделки и клиентские данные не изменялись.

## 13. Operational aggregates

Rollback-тест не изменил рабочие агрегаты:

- Сделки 21; документы 168; задачи 92; риски 49; события 116.
- Активные профили 5: owner 1, lawyer 1, spn 3; admin/manager/broker/viewer 0.
- Один активный СПН без `manager_id`; назначение вслепую не выполнялось.
- Открытые задачи 86; все 86 просрочены; urgent 13; high 35; done 0.
- Auto-quality открытые задачи 44.
- Открытые риски 49; resolved 0; блокируют сделку 36; задаток 38.
- Документы needed 152; просроченные открытые 125; без `assigned_to` и `responsible_role` 27.
- Последнее рабочее обновление сделки: 25 июня; документа: 24 июня; задачи: 9 июля; события: 25 июня.

Read-only production preview после #222:

- Рабочие сделки: 16; demo исключены.
- Средняя legacy readiness к задатку: 68,8%; средняя operational readiness: 21,9%.
- Legacy 80%+: 5 сделок; operational 80%+: 0; скрытые расхождения: 5.
- Требуют внимания менеджера: 16; без менеджера/исключения: 16; без СПН: 2.
- Юрист ожидает распределения: 11; брокер: 5.
- С блокирующим риском: 16; с просроченной задачей: 16; с просроченным обязательным документом: 12.
- Полный следующий шаг с владельцем/ролью и сроком найден у всех 16 через существующие operational tasks; auto-quality задачи не выбираются главным клиентским действием.

## 14. Security Advisor

- Security Advisor: 50 WARN.
- Новый ожидаемый WARN относится к `nav_v2_get_operational_readiness_preview`: это намеренно browser-callable `SECURITY DEFINER` RPC с owner/admin/manager gate и ограниченным manager scope.
- Legacy `nav_*` warnings и curated Navigator browser/admin RPC warnings остаются.
- `anon` и `PUBLIC` не имеют EXECUTE на новом operational preview RPC; authenticated и service_role имеют.
- Private helpers не вернулись в public schema.
- Leaked-password protection остаётся выключенной до успешного invite/recovery E2E.
- Массовый revoke запрещён.

## 15. Performance Advisor

- Performance Advisor: 164 notices — 29 WARN, 135 INFO.
- Новых предупреждений, привязанных к operational preview RPC, нет.
- Основной оставшийся шум относится к legacy Navigator и другим подсистемам: `auth_rls_initplan`, `multiple_permissive_policies`, `unindexed_foreign_keys`, `unused_index`.
- `leader_*`, `parket_*`, generic CRM и legacy `nav_*` в этом запуске не менялись.

## 16. RPC health

После production migration:

- `nav_v2_get_rpc_grant_health`: 46 items, 0 problems, `ok=true`.
- Frontend RPC coverage: 40 items, 0 problems, `ok=true`.
- `nav_v2_get_operational_readiness_preview` присутствует в обоих health reports.
- Новый RPC: authenticated EXECUTE=true; service_role=true; anon=false; PUBLIC=false.
- Все 11 Navigator v2 tables используют RLS; прямые authenticated table privileges пока не сокращались до role/browser E2E.

## 17. Private helper health

- Private helpers остаются в `nav_v2_private`.
- Публичные дубли access helpers не восстановлены.
- Risk RPC использует `nav_v2_private.nav_v2_can_view_deal`, `nav_v2_can_edit_deal` и `nav_v2_my_role`.
- Публичный PostgREST smoke для private helpers ранее давал ожидаемый 404; без причины не повторять.

## 18. Что исправлено

- Старые проценты анкеты больше не используются как единственный сигнал готовности руководителю.
- Сервер возвращает operational readiness, критические пробелы, блокеры, следующее действие, владельца/роль, срок, stale days, manager attention и причины запрета следующего этапа.
- Критичные пробелы ограничивают readiness ниже 80%; отсутствие стороны или менеджера — 59%, блокирующий риск — 60%, просроченный обязательный документ — 65%.
- Добавлен менеджерский экран «Что требует решения сегодня» с причиной, ответственным, сроком, одним главным действием, ссылкой на карточку, readiness discrepancy и нагрузкой СПН.
- Preview не содержит mutation controls и не меняет реальные назначения.
- Auto-quality задачи не смешиваются с главным клиентским действием.
- Добавлен focused regression `scripts/check_nav_v2_operational_readiness.py`.

Предыдущий завершённый slice:

- Добавлен атомарный RPC resolve/reopen риска.
- Добавлена блокировка строки `FOR UPDATE`.
- Добавлена идемпотентность без дублей audit event.
- Добавлены `updated_at`, корректная установка и очистка `resolved_at`/`resolved_by`.
- Добавлены `risk_resolved` и `risk_reopened` events.
- Добавлены явные UI-действия в карточке через общий lifecycle.
- Viewer не получает mutation control.
- Прямого browser table update нет.
- Module budget карточки остался 22.
- Добавлен отдельный focused regression-check `scripts/check_nav_v2_risk_resolution.py`.
- Исправлен ложный CI-positive: `Array.from(...)` больше не воспринимается как Supabase `.from('nav_...')`.

## 19. Что реально проверено

- PR #222: static checks PASS.
- JavaScript syntax PASS.
- RPC surface PASS.
- Focused operational readiness regression PASS.
- Review threads: 0.
- SQL migration полностью выполнена внутри предварительной transaction/rollback проверки.
- Production migration применена успешно.
- Production RPC grants/coverage health: PASS.
- Owner preview: 16/16 real deals; required response keys PASS; critical readiness <80% PASS.
- SPN forbidden preview: SQLSTATE `42501`, PASS.
- DDL rollback PASS; counts сделок/задач/документов/рисков/событий не изменились.
- GitHub Pages: `manager-v2.html`, manager JS и role-menu JS отвечают HTTP 200 и содержат release markers.
- Public workflow PASS; authenticated job SKIPPED из-за отсутствующих isolated secrets и не считается role E2E.
- Edge versions и JWT settings не изменились.

## 20. Что не удалось проверить

- Создание Supabase development branch: текущий план не поддерживает branching.
- Authenticated Playwright matrix по ролям.
- Invite/recovery/password и email delivery.
- Risk UI click-through с реальной browser session.
- Task/document/status browser mutations.
- Authenticated manager screen: console/page errors, desktop/mobile и real role scope.
- Leaked-password protection после invite/recovery.

## 21. Созданные тестовые данные

- Supabase development branches: 0.
- Auth users: 0.
- Persistent profiles: 0.
- Persistent deals/documents/tasks/risks/events: 0.
- В текущем operational rollback-тесте synthetic rows не создавались.
- GitHub secrets не создавались.

## 22. Cleanup

- Предварительная DDL transaction завершена `ROLLBACK`; затем точный migration SQL применён после merge.
- Persistent test rows: 0.
- Production Auth cleanup не требовался.
- Ветка Supabase не была создана, поэтому её удаление не требуется.

## 23. Ручные действия владельца

Нужен один из безопасных вариантов:

1. Перевести Supabase organization/project на план с development branching и создать branch `nav-e2e`.
2. Либо создать отдельный тестовый Supabase project без реальных данных.
3. Создать GitHub Environment `navigator-e2e`.
4. Добавить branch/test-project URL, publishable key и disposable role credentials по `tests/e2e/README.md`.
5. Email тестовых пользователей должны начинаться с `nav-e2e`; не использовать реальные ФИО и рабочие аккаунты.
6. Подключить disposable mailbox для invite/recovery.
7. Запустить `Navigator v2 authenticated browser E2E` с `target=all`; owner включать только с disposable owner.

## 24. Три следующие задачи

1. Owner/admin вручную просматривает `manager-v2.html` и подтверждает manager assignments либо документированные исключения; до подтверждения реальные сделки не менять.
2. После подтверждения сделать отдельный безопасный assignment workflow: preview, точечное назначение, audit event, reload verification; без bulk update по умолчанию.
3. Следующим независимым product slice разделить operational tasks и quality warnings, добавив тип/SLA/владельца/контрольный срок и read-only bulk sorting preview.

Параллельный BLOCKED-трек: isolated target, authenticated role matrix, invite/recovery и browser mutation E2E.

## 25. Точная команда следующего Work-запуска

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #222. Не повторяй public guest/no-JWT/private-helper smoke, deal-card consolidation, risk lifecycle #218 и общий аудит. Один раз проверь isolated auth target. Если owner уже подтвердил manager assignments/exceptions — сделай отдельный audited assignment slice. Если подтверждения нет — не меняй реальные сделки и возьми разделение operational tasks/quality warnings с read-only preview. Заверши PR, CI, merge, migration smoke и обновлением handoff.`

## NEXT_WORK_QUEUE

- P0 — подключить Supabase development branch на Pro либо отдельный test project и GitHub Environment `navigator-e2e`.
- P0 — выполнить authenticated Playwright matrix admin/manager/spn/lawyer/broker/viewer; owner только disposable.
- P0 — выполнить invite/recovery/password и browser mutation matrix на synthetic deal.
- P0 MANUAL — owner/admin проверить 16 сделок в `manager-v2.html` и подтвердить manager assignment/exception.
- P1 — после подтверждения: safe point assignment + preview + audit event; без автоматического bulk update.
- P1 — task taxonomy: operational task отдельно от quality warning, type/SLA/owner/control due date и read-only sorting preview.
- P1 — после успешного auth E2E включить leaked-password protection и повторить password/recovery smoke.
- BLOCKED — current Supabase plan не поддерживает branching; Environment secrets, disposable role accounts и mailbox отсутствуют.
- DO NOT REPEAT — полный аудит, public guest smoke, no-JWT RPC/Edge smoke, private helper relocation/smoke, deal-card consolidation 30→22, backend risk lifecycle #218 и его rollback mutation E2E.
