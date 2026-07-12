# Navigator v2 — актуальный handoff

## 1. Дата и время

- 2026-07-12 12:00 CEST / 10:00 UTC.

## 2. Текущий main SHA

- Runtime main: `9028e685be30598a743fb5323a25cea7ac4a5a71` — squash merge PR #217.
- Этот handoff публикуется отдельным docs-only PR #219; его merge SHA будет новее runtime baseline, но не меняет приложение или Supabase.

## 3. Runtime code baseline

- `9028e685be30598a743fb5323a25cea7ac4a5a71`.
- `deal-card-v2.html`: budget 22 entry-модуля.
- Canonical frontend build: `20260711-01`.

## 4. Последняя live migration

- `20260710184255_nav_v2_private_helper_lockdown_health`.
- Новых migrations, DDL, grants и RLS-изменений в текущем запуске нет.

## 5. Edge Functions

- `nav-invite-user`: v10, ACTIVE, `verify_jwt=true`, SHA-256 `14020dac054cadf3ca86d19313cf2bc2b012aca9d634e76e8dd0ffde11b05a5f`.
- `nav-v2-deal-api`: v4, ACTIVE, `verify_jwt=true`, SHA-256 `b64e3fdbc2fa22ccb4998e69232e4351308f1d9b0a7c3c2bec7093186d3e4095`.
- Edge Functions в этом запуске не деплоились.

## 6. Смерженные PR текущего запуска

- #217 — `Add isolated Navigator authenticated browser E2E`.
- #219 — docs-only актуализация этого handoff.

Delta перед запуском:

- #216 — readable values переведены в deal-card lifecycle; budget 23 → 22.

## 7. Открытые PR

- Нет после merge #219.

## 8. Закрытые issues

- В текущем запуске issues не закрывались: authenticated role, invite/recovery и mutation E2E ещё не выполнены.

## 9. Открытые issues

- #16 — invite/recovery/password E2E.
- #156 — operational data quality cleanup.
- #159 — authenticated mobile/desktop visual audit.
- #161 — Security Advisor и leaked password protection.
- #164 — release readiness checklist.
- #176 — master roadmap.
- #177 — release pipeline.
- #179 — frontend consolidation и role tests.
- #199 — legacy decommission; не выполнять без отдельного решения.
- #218 — безопасный lifecycle устранения риска.

## 10. Role matrix

| Роль | DB/API | Реальный browser | Статус |
|---|---|---|---|
| guest | 9 RPC 401; 6 private helpers 404 | 5 auth-gates × desktop/mobile | PASS |
| owner | profile/dashboard/deals/card/admin ранее проверены | credentials отсутствуют | DB/API PASS; browser BLOCKED |
| admin | static route/menu/admin guards | `nav-e2e` user отсутствует | Static PASS; browser BLOCKED |
| manager | static route/menu contract | `nav-e2e` user отсутствует | Static PASS; browser BLOCKED |
| spn | profile/dashboard/свои сделки/запрет чужой ранее проверены | `nav-e2e` user отсутствует | DB/API PASS; browser BLOCKED |
| lawyer | profile/dashboard/deals/card ранее проверены | `nav-e2e` user отсутствует | DB/API PASS; browser BLOCKED |
| broker | static route/menu contract | `nav-e2e` user отсутствует | Static PASS; browser BLOCKED |
| viewer | static route/menu contract | `nav-e2e` user отсутствует | Static PASS; browser BLOCKED |

PR #217 добавил executable authenticated matrix для всех ролей; owner запускается только с disposable account и явным opt-in.

## 11. Invite/recovery result

- Static invite/recovery validator: PASS.
- `nav-invite-user` без JWT: HTTP 401 PASS.
- Production `nav-e2e` Auth users: 0.
- Access link, password setup, login, logout, recovery, invalid/expired/reused link и email delivery: BLOCKED.
- Причина конкретная: Supabase branch listing возвращает `Project reference is missing when validating permissions`; development branch URL, Environment secrets и disposable mailbox отсутствуют.
- Leaked-password protection не включалась.

## 12. Mutation E2E result

- В текущем запуске реальные сделки не изменялись.
- Task/document/risk/status browser mutation E2E: BLOCKED до isolated branch и synthetic deal.
- Найден функциональный gap: есть `nav_v2_add_risk`, но нет явного browser RPC/UI lifecycle для resolve/reopen риска; создана #218.
- Прямой browser UPDATE таблицы для обхода gap запрещён.

## 13. Operational aggregates

- Сделки 21; документы 168; задачи 92; риски 49; события 116.
- Активные профили 5: owner 1, lawyer 1, spn 3; admin/manager/broker/viewer 0.
- Один активный СПН без `manager_id`; назначение вслепую не выполнялось.
- Открытые задачи 86; все 86 просрочены; urgent 13; high 35; done 0.
- Auto-quality открытые задачи 44.
- Открытые риски 49; resolved 0; блокируют сделку 36; задаток 38.
- Документы needed 152; просроченные открытые 125; без assigned_to и responsible_role 27.
- Последнее обновление сделки: 25 июня; документа: 24 июня; задачи: 9 июля; событие: 25 июня.

## 14. Security Advisor

- 48 WARN.
- Категории: authenticated-callable SECURITY DEFINER functions и выключенная leaked-password protection.
- Public `nav_v2_*` functions: 56; authenticated-callable: 44; anon-callable: 0.
- Private helpers не вернулись в public schema.
- Массовый revoke и leaked-password protection отложены до role/auth E2E.

## 15. Performance Advisor

- 168 notices: 29 WARN, 139 INFO.
- Категории: `auth_rls_initplan`, `multiple_permissive_policies`, `unindexed_foreign_keys`, `unused_index`.
- В текущем запуске DDL не было, поэтому индексы и политики не изменялись.

## 16. RPC health

- `nav_v2_get_rpc_grant_health`: 44 items, 0 problems.
- Frontend RPC coverage: 38 items, 0 problems.
- Live no-JWT smoke: 9 browser RPC вернули ожидаемый 401 / `42501`.
- Все 11 Navigator v2 tables используют RLS; authenticated сохраняет прямые privileges на 11 таблиц до role/mutation E2E.

## 17. Private helper health

- Private helpers: 6 items, 0 missing, 0 problems; private schema healthy.
- Locked public internal helpers: 11 items, 0 open.
- Live PostgREST smoke: 6 helpers отсутствуют в public RPC schema и вернули 404 / `PGRST202`.

## 18. Что исправлено

- Добавлен Playwright `1.61.1` с lockfile.
- Добавлены desktop Chrome и Pixel 7 projects.
- Public guest smoke автоматически запускается на релевантных PR.
- Authenticated matrix использует GitHub Environment `navigator-e2e` и branch-only frontend config.
- Preflight блокирует production Supabase и требует email prefix `nav-e2e`.
- Secrets, JWT, refresh tokens и service-role key не выводятся и не попадают в browser bundle.
- Добавлены HTML/JSON reports, trace, screenshot/video on failure и cleanup contract.
- Issues #156, #159, #164, #176, #179 актуализированы; #16/#161 получили свежий статус; создана #218.

## 19. Что реально проверено

- PR #217 static CI: PASS.
- PR #217 public Playwright: PASS, 10 guest tests на desktop/mobile.
- Browser artifact `nav-v2-public-e2e`: создан, retention 14 дней.
- Review threads и PR comments: отсутствуют.
- Post-merge static push workflow: PASS.
- GitHub Pages deploy: PASS; `nav-v2.html` отвечает HTTP 200.
- RPC auth smoke: PASS 9/9; private helper smoke: PASS 6/6; Edge auth smoke: PASS 2/2.
- Свежие логи: API 100 Navigator entries (58×401, 42×404), Edge 23×401; новых error-like/5xx не найдено.

## 20. Что не удалось проверить

- Authenticated browser matrix по ролям.
- Invite/recovery/password и email delivery.
- Task/document/risk/status mutations на synthetic deal.
- Полный многостраничный local Pages smoke: sandbox заблокировал Python-доступ к `deputat36.github.io`; deployment и главная страница подтверждены отдельно.
- Supabase development branch: list operation завершилась permission-validation error.

## 21. Созданные тестовые данные

- Auth users: 0.
- Profiles: 0.
- Deals/documents/tasks/risks/events: 0.
- GitHub secrets и Supabase branch: не создавались.

## 22. Cleanup

- Production cleanup не требовался: рабочие данные и Auth не изменялись.
- Будущий E2E cleanup: удалить development branch целиком; альтернативный ручной cleanup описан в `tests/e2e/README.md`.

## 23. Ручные действия владельца

1. Создать Supabase development branch и убедиться, что доступно управление Auth этого branch.
2. Создать GitHub Environment `navigator-e2e`.
3. Добавить branch URL/publishable key и role credentials строго по `tests/e2e/README.md`; email начинаются с `nav-e2e`.
4. Создать только synthetic deals без реальных клиентов; СПН назначить synthetic manager.
5. Запустить `Navigator v2 authenticated browser E2E` с `target=all`; owner включать только для disposable owner.

## 24. Три следующие задачи

1. Настроить isolated development branch + `navigator-e2e` Environment и получить authenticated role PASS/FAIL.
2. Пройти disposable invite/recovery/password E2E; затем решить leaked-password protection.
3. На synthetic deal реализовать и проверить #218 вместе с task/document/status mutation lifecycle.

## 25. Точная команда следующего Work-запуска

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md: начни с первой незаблокированной задачи NEXT_WORK_QUEUE; не повторяй public guest smoke и deal-card consolidation; настрой isolated nav-e2e branch/environment, получи authenticated role evidence, затем mutation E2E и в конце обнови тот же handoff.`

## NEXT_WORK_QUEUE

- P0 — создать или подключить Supabase development branch и GitHub Environment `navigator-e2e` по `tests/e2e/README.md`.
- P0 — выполнить authenticated Playwright matrix admin/manager/spn/lawyer/broker/viewer; owner только disposable.
- P1 — проверить invite/recovery/password, затем task/document/status и risk lifecycle #218 на synthetic deal.
- BLOCKED — branch permission, disposable mailbox и Environment secrets требуют действий владельца/доступа к настройкам.
- DO NOT REPEAT — полный аудит, PR #203–#217, private helper relocation, build marker, deal-card budget 30→22, public guest Playwright PR smoke, no-JWT RPC/Edge smoke.
