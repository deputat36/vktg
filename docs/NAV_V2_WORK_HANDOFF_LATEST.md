# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 2026-07-13.
- Текущий product `main`: `9959d82dbeb89004c491b8e73be37804accffaff` — PR #258.
- Последняя production migration: `20260713195810_nav_v2_responsibility_point_preview_guard`.
- Canonical migrations: `20260714001500_nav_v2_responsibility_point_preview.sql` и `20260714001600_nav_v2_responsibility_point_preview_guard.sql`.
- Release-sync: ветка `agent/nav-v2-responsibility-point-preview-release-sync`.
- Canonical frontend build: `20260711-01`.
- Deal-card budget: 22; механическое сокращение без новой продуктовой причины запрещено.

## Последние завершённые PR

- #258 — owner/admin server-side read-only preview одной responsibility correction, fingerprint, private implementation и CI contracts.
- #257 — handoff после package validator.
- #256 — импорт и локальная read-only валидация JSON-пакета перед точечной коррекцией.
- #255/#254 — release sync и browser-local лист подтверждения ответственности.
- #253/#252 — release sync, source-remediation UI и evidence-only candidates.
- #251/#250 — release sync и grouped source-remediation SQL.
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
- Live core preview: `20260713195749_nav_v2_responsibility_point_preview`.
- Live guard: `20260713195810_nav_v2_responsibility_point_preview_guard`.
- Canonical core blob: `298c5093419e7cf3837b3255df170f32f60498c9`.
- Canonical guard blob: `d92aaf30482f0fc8802f947e796ca9307cc3479f`.
- `nav-invite-user`: v10 ACTIVE, `verify_jwt=true`.
- `nav-v2-deal-api`: v4 ACTIVE, `verify_jwt=true`.
- RPC grant health: 50 items, 0 problems.
- Frontend RPC coverage: 43 items, 0 problems.
- Supabase branches: только production `main`; isolated auth target отсутствует.

## Operational adoption

Текущий 30-дневный owner/admin/manager snapshot:

- 16 реальных сделок в scope.
- 1 подтверждённый результат.
- 15 сделок с активностью без подтверждённого результата.
- Confirmed result rate: 6.3%.
- 52 созданные задачи: 18 client actions и 34 quality warnings.
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

## Источники ответственности

### Manager assignment proposal

- Public report version: 6.
- Live: 16 `missing_source`; остальные состояния 0.
- Candidate выводится только из `manager_id` корректного активного СПН стороны сделки.
- `mutation_available=false`.

### Grouped source remediation

Пять live-групп:

1. 10 сделок: `buyer_spn_id` указывает на owner-профиль.
2. 10 сделок: `seller_spn_id` указывает на owner-профиль.
3. Овчинников Александр Константинович — активный СПН без `manager_id`; 4 сделки, 7 сторон.
4. 3 сделки без `seller_spn_id`.
5. 2 сделки без `buyer_spn_id`.

Порядок исправления:

1. Подтвердить фактических СПН и сторону каждой сделки.
2. Подтвердить менеджера Овчинникова.
3. Заполнить отсутствующие стороны.
4. Повторно запустить manager proposal.
5. Только затем рассматривать point manager assignment.

### Responsibility evidence

- 16 сделок в scope.
- Strong single evidence: 4.
- Weak single evidence: 0.
- Multiple candidates: 0.
- No active-SPN evidence: 12.
- Во всех четырёх strong-evidence сделках кандидат — Овчинников А. К.
- Evidence не определяет сторону сделки и не выполняет назначение.

## Локальный confirmation workflow

Экран `manager-source-remediation-v2.html` позволяет:

- подготовить `seller_spn_id`, `buyer_spn_id` и `manager_id` в localStorage;
- явно выбрать сторону evidence-кандидата;
- добавить основание решения;
- скачать JSON/CSV;
- импортировать JSON в local package validator;
- получить `point_operation_ready=true` только для ровно одной свежей и однозначной операции.

Package validator:

- принимает JSON до 2 МБ;
- повторно получает свежий adoption report;
- сравнивает current ids с live report;
- проверяет допустимые активные профили;
- требует `decision_status=confirmed` и комментарий;
- классифицирует `ready`, `stale`, `invalid`, `not_ready`, `no_change`;
- ничего не пишет в Supabase.

## PR #258 — server responsibility point preview

Public RPC:

`public.nav_v2_preview_responsibility_point_correction(p_operation jsonb)`

Private implementation:

`nav_v2_private.nav_v2_preview_responsibility_point_correction_unchecked_20260714(p_operation jsonb)`

Поддерживаемые операции:

- `deal_spn` → только `seller_spn_id` или `buyer_spn_id`;
- `profile_manager` → только `manager_id`.

Server preview:

- доступен только owner/admin;
- требует ровно одну нормализованную операцию;
- требует явный ключ `expected_current_id`, включая JSON null;
- требует основание не короче 10 символов;
- проверяет live current value;
- проверяет active/role целевого и предлагаемого профиля;
- отказывает при stale, no-change, неизвестном поле, неверной роли или self-manager;
- возвращает before/after, preconditions, fingerprint и `expires_at` через 15 минут;
- `mutation_available=false`;
- `execution_rpc_available=false`;
- `requires_revalidation=true`;
- не создаёт audit event и не изменяет таблицы.

UI-модуль:

`assets/js/nav-v2/manager-source-remediation-server-preview-v2.js`

Он появляется после локального validation block. Manager может пользоваться локальным validator, но server fingerprint доступен только owner/admin.

## Production verification PR #258

Owner read-only preview:

- target: Овчинников Александр Константинович;
- operation: `profile_manager.manager_id`;
- before: `null`;
- proposed: Алексей Ковтун, role owner;
- result: `ready=true`;
- fingerprint сформирован;
- срок действия: 15 минут;
- пакет без `expected_current_id`: `missing_expected_current`;
- SPN invocation: SQLSTATE `42501`.

Grants:

- public wrapper: authenticated=true, anon=false, PUBLIC=false;
- private implementation: service_role=true, authenticated=false, anon=false, PUBLIC=false.

## Advisors

- Security Advisor после deploy получен.
- Новый public preview присутствует как ожидаемый `authenticated_security_definer_function_executable` warning и учтён в Navigator-only Advisor baseline.
- Private implementation наружу не утекла.
- Leaked-password protection остаётся выключенной до invite/recovery E2E.
- Performance Advisor не показал preview-specific проблему.
- Общий Performance Advisor смешивает Navigator, legacy Nav, Leader, Parket и другие подсистемы; автоматическое удаление индексов или массовая правка RLS запрещены без workload evidence.

## Рабочие данные

До и после server preview deploy:

- Deals: 21.
- Documents: 168.
- Tasks: 92.
- Risks: 49.
- Events: 116.
- Profiles: 5.
- Persisted task type: 0.
- Persisted SLA: 0.
- Реальные `seller_spn_id`, `buyer_spn_id`, `manager_id`, статусы и задачи не менялись.

## Проверки PR #258

- Dedicated remediation contract: PASS.
- Responsibility point preview private-wrapper regression: PASS.
- RPC surface health-chain contract: PASS.
- Full static suite: PASS.
- JavaScript syntax: PASS.
- Advisor scope: PASS.
- Public desktop/mobile Playwright: PASS.
- Review threads: 0.
- `authenticated-smoke`: `skipped`; это не authenticated PASS.
- DDL rehearsal с полным `ROLLBACK`: PASS.
- Production post-deploy verification: PASS.

## Release drift

- Baseline latest live после release-sync: `20260713195810`.
- Live `20260713195749` связан с canonical `20260714001500` и blob `298c5093419e7cf3837b3255df170f32f60498c9`.
- Live `20260713195810` связан с canonical `20260714001600` и blob `d92aaf30482f0fc8802f947e796ca9307cc3479f`.
- Alias manifest: 15 approved live mappings и 15 canonical repository-only sources.
- Неизвестный remote-only/repo-only drift продолжает ломать gate.
- Approved workflow run в Environment `navigator-production-readonly` всё ещё требует ручной настройки владельца.

## Authenticated E2E blocker

- Отдельного Supabase test project или Pro branch нет.
- GitHub Environment `navigator-e2e`, disposable role accounts и mailbox отсутствуют.
- Authenticated Playwright matrix: BLOCKED.
- Invite/access-link/password/recovery/email delivery: BLOCKED.
- Browser mutation E2E: BLOCKED.
- Workflow success при `authenticated-smoke=skipped` не является authenticated PASS.

## Ручные действия владельца

1. Открыть `manager-source-remediation-v2.html` под owner/admin.
2. Заполнить локальный confirmation draft.
3. Скачать JSON.
4. Импортировать JSON в local validator и получить `point_operation_ready=true`.
5. Нажать «Получить серверный preview».
6. Скачать server preview с актуальным fingerprint.
7. Сохранить confirmation JSON, validation report и server preview как три evidence-файла.
8. Только после явного подтверждения рассматривать одну audited point correction.
9. Создать Environment `navigator-production-readonly` и выполнить approved drift workflow.
10. Для auth E2E создать отдельный test project/branch и Environment `navigator-e2e`.

## NEXT_WORK_QUEUE

- P0 MANUAL — получить confirmation JSON, validation report и server preview fingerprint.
- P0 MANUAL — approved release drift workflow run с `allow_drift=false`.
- P0 BLOCKED — isolated target + authenticated role/invite/recovery/mutation E2E.
- P1 BLOCKED ON THREE EVIDENCE FILES — одна audited point correction одного SPN field либо `manager_id`, с повторной revalidation, pre/post snapshot и audit event.
- P1 BLOCKED ON AUTH EVIDENCE — audited synthetic task contract mutation.
- P1 — leaked-password protection только после auth E2E.
- DO NOT REPEAT — общий аудит, guest/no-JWT/private-helper smoke, deal-card consolidation, risk #218, operational/task/broker/viewer previews, lawyer focus, SPN handoff, owner/admin IA, task contract schema, Advisor scope gate, adoption snapshot/comparison, manager proposal, grouped remediation, evidence candidates, local confirmation draft, package validator и server point preview без новой причины.

## Команда следующего запуска

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #258 и live migration 20260713195810. Один раз проверь Environment navigator-production-readonly, isolated auth target и наличие трёх evidence-файлов: confirmation JSON, validation report с point_operation_ready=true и server preview с неистёкшим fingerprint. Если все три файла подтверждены владельцем — выполни только одну audited point correction с повторной server revalidation, pre/post snapshot и audit event. Если evidence нет — реальные назначения не менять.`
