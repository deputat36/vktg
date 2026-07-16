# Navigator v2 — task RPC consumer matrix v2

Дата: 16 июля 2026 года.

Статус: repository-only deployment gate v2. Runtime-код и production Supabase не меняются.

## Итог

После PR #371–#375 закрыты основные проектные пробелы bounded-task интерфейса, но deployment всё ещё запрещён.

Готовы:

- controlled legacy review pack;
- точная inventory старых RPC consumers;
- contract-aware lite DTO;
- direct-link bounded task UI preview;
- evidence input preview;
- explicit waiting/deferred controls;
- immutable bounded completion semantics;
- pure dual-path router;
- validated Edge action contract;
- synthetic dual-path browser regression.

Не готовы:

- интеграция одного authoritative handler в рабочую карточку;
- удаление конкурирующего base listener;
- интеграция Edge actions;
- database deployment и minimal grants;
- authenticated application E2E;
- включение frontend transport;
- controlled pilot.

## PR #371 — controlled legacy review

Read-only review pack показывает нейтральные ссылки, source/status/role/assignee/due date/age и высокоуверенные suggestions.

Он не меняет строки, не создаёт bounded tasks, не завершает задачи и не используется для оценки сотрудников.

## PR #372 — consumer inventory

Зафиксированы три активных consumer path старого `nav_v2_update_task_status`:

1. `assets/js/nav-v2/deal-card-v2.js` — base listener;
2. `assets/js/nav-v2/task-action-guard-v2.js` — основной перехватывающий handler;
3. `supabase/functions/nav-v2-deal-api/index.ts` — Edge action facade.

Активных runtime consumers `nav_v2_add_task` нет.

## PR #373 — lite DTO v2

Repository overlay `nav_v2_get_deal_card_lite_bounded_tasks.sql` добавляет:

- contract version и task type;
- evidence kind и completion criterion;
- gate scope и outcomes;
- `legacy_status_path`;
- `requires_evidence_reference`;
- `supports_reopen`;
- отдельные permissions start/complete/active outcome/proposal/decision.

Production DTO не менялся.

## PR #374 — UI preview

Direct-link synthetic preview показывает coexistence legacy и bounded tasks, evidence UUID, waiting/deferred, terminal proposal/decision и exact RPC preview.

Страница не входит в role menu и не вызывает Supabase.

## PR #375 — dual-path contract

Pure router `task-action-router-v2.js` выбирает ровно один route preview:

- legacy row → старый status RPC;
- bounded row → governed start/complete/outcome RPC.

Bounded reopen запрещён. Завершённая bounded-задача неизменяема; новая работа создаётся отдельной audited-задачей.

Edge action contract проверяет UUID, enum/date, replacement и unknown fields, но не импортирован в deployed `index.ts`.

Synthetic Playwright regression подтверждает legacy/bounded выбор маршрута и отсутствие сетевых RPC вызовов.

## Закрытые blockers

- `lite_dto_contract_fields_missing`;
- `evidence_input_missing`;
- `reopen_semantics_undefined`;
- `governed_action_validation_missing`;
- `dual_path_browser_contract_missing`.

## Оставшиеся blockers

### Authoritative handler

`task-action-guard-v2.js` должен стать единственным владельцем task action flow и использовать dual-path router.

Base listener в `deal-card-v2.js` необходимо удалить или полностью отключить, чтобы один клик не мог вызвать два mutation path.

### Edge integration

`task-action-contract-v2.js` должен быть подключён к `nav-v2-deal-api/index.ts` только после database deployment.

Legacy action остаётся legacy-only и обязана отклонять contract-v2 row.

### Database и access

Bounded schema, audit table и RPC отсутствуют в production. Нужен отдельный migration/deploy PR с minimal grants и security advisor review.

### Authenticated application E2E

Skipped authenticated job не считается доказательством. Нужны реальные роли СПН, lawyer, broker, manager, owner/admin и coexistence legacy/bounded rows.

### Transport и pilot

Frontend transport остаётся выключенным до полного deployment order и controlled pilot.

## Следующий safe slice

Repository-only integration rehearsal:

1. создать отключённый authoritative handler candidate поверх synthetic fixture;
2. доказать отсутствие duplicate listener;
3. проверить DTO → router → Edge payload mapping;
4. не импортировать candidate в production карточку;
5. не вызывать сеть;
6. обновить source/browser contracts.

После rehearsal можно подготовить реальную runtime-интеграцию отдельным PR, всё ещё с transport disabled.

## Production gate

Deployment запрещён, пока `deployment_ready=false` и остаётся хотя бы один integration/E2E/deploy/pilot blocker.

98 legacy tasks продолжают существовать без массового backfill. Review pack и pilot metrics не используются для оценки сотрудников.

## Rollback

Этот slice меняет только matrix, checker, workflow, handoff и документацию. Rollback — вернуть предыдущие repository artifacts. Runtime и database state не затрагиваются.
