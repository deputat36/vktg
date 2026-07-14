# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 2026-07-14.
- Текущий `main`: `16b2d9af4a5a641c8f879dc04539a998e5a9372c` — merge PR #292.
- Supabase project: `ofewxuqfjhamgerwzull`.
- Последняя production migration: `20260714125054_nav_v2_exact_duplicate_review_pack`.
- Public operational report version: 8.
- Supabase branches: только production `main`.
- Isolated authenticated target: не создан.
- `authenticated-smoke=skipped` не является authenticated PASS.

## Завершённая UX-цепочка

### PR #288 — рабочий стол «Что делать сейчас»

- три объяснимых приоритета;
- role-aware действия;
- рабочие KPI без demo и точных повторов;
- шесть последних рабочих сделок вместо длинного списка;
- pure priority model и semantic CI.

### PR #290 — рабочие режимы списка сделок

Страница `deals-v2.html` теперь по умолчанию показывает канонический рабочий набор:

- demo скрыты;
- точные повторы объединены, ранняя карточка остаётся;
- owner/admin/manager: `Рабочие / Требуют внимания / Просрочено / Без ответственного / Готовы к задатку`;
- СПН, юрист, брокер и viewer получают свои role-aware быстрые режимы;
- полный исходный список, demo и повторы остаются доступны через расширенный фильтр;
- карточка показывает просрочки, документы, ответственность и следующий шаг;
- используется только существующий `nav_v2_get_deals_list`.

Файлы:

- `assets/js/nav-v2/deals-work-modes-v2.js`;
- `assets/js/nav-v2/deals-v2.js`;
- `assets/css/nav-v2-deals.css`;
- `scripts/check-nav-v2-deals-work-modes.mjs`;
- `scripts/check_nav_v2_deals_work_modes.py`.

### PR #291 — action-first карточка сделки

После hero показывается блок `Главное действие сейчас`:

- выбирается наиболее срочная открытая задача;
- просрочка и urgent/high имеют приоритет;
- показаны ответственный, срок и готовность;
- есть критерий `Как понять, что готово`;
- видны красные риски, просроченные задачи и недостающие документы;
- кнопка ведёт прямо во вкладку задачи, риска, документа или сводки;
- при отсутствии задач fallback строится по риску, документу или `next_action`;
- viewer получает явный read-only режим;
- новый hook не вызывает RPC и использует уже загруженный card payload.

Файлы:

- `assets/js/nav-v2/deal-card-action-focus-model-v2.js`;
- `assets/js/nav-v2/deal-card-action-focus-v2.js`;
- `assets/css/nav-v2-deal-action-focus.css`;
- consolidated lifecycle `deal-card-recheck-alert-v2.js`.

### PR #292 — прямые маршруты менеджера

Менеджерская очередь ведёт сразу к работе:

- просроченные задачи → `#tasks`;
- блокирующие риски → `#risks`;
- просроченные документы → `#docs`;
- пробелы ответственности → `manager-source-remediation-v2.html`;
- дополнительные кнопки открывают связанные причины;
- используется прежний read-only `nav_v2_get_operational_readiness_preview`.

Файлы:

- `assets/js/nav-v2/manager-action-route-v2.js`;
- `assets/js/nav-v2/manager-v2.js`;
- `scripts/check-nav-v2-manager-action-routes.mjs`.

## Проверки UX-срезов

Для PR #288/#290/#291/#292 пройдены:

- dedicated semantic regressions;
- полный static suite;
- role/operational/deal-card/BAZA/risk/SPN compatibility contracts;
- JavaScript syntax;
- public desktop/mobile Playwright;
- review threads: 0.

Authenticated jobs были `skipped` и не считаются PASS.

## Production snapshot

После merge PR #292:

- Deals: 23;
- Tasks: 98;
- Risks: 53;
- Documents: 198;
- Events: 118;
- Latest live migration: `20260714125054`.

UX PR не меняли Supabase schema, grants, functions, Auth users или рабочие строки.

## Security и release state

- latest migration совпадает с baseline: `20260714125054`;
- live → canonical alias: `20260714125054` → `20260714130000`;
- canonical source blob: `cd6c0962b7f3bfcce5bc3b51fe717fbfca100a14`;
- connector-equivalent evidence: `docs/NAV_V2_LIVE_VERIFICATION_20260714.md`;
- ручной workflow `navigator-production-readonly` с `allow_drift=false` ещё не запускался;
- Advisor whitelist: 48/48, missing 0, unexpected 0;
- leaked-password protection заблокирована до isolated authenticated E2E.

## Ручные блокеры

### Exact duplicate cleanup

- четыре группы / восемь карточек;
- owner decision `navigator_v2_exact_duplicate_owner_decision` не предоставлен;
- issue #273 открыта;
- cleanup mutation запрещена.

### Operational pilot

Не предоставлены шесть файлов от owner decision до responsible acknowledgement. Pilot mutation запрещена.

### Responsibility correction

Не предоставлены confirmation JSON, validation report, fresh server preview и bundle manifest. Не менять `seller_spn_id`, `buyer_spn_id`, `manager_id`.

### Isolated authenticated E2E

Issue #282 ожидает точное cost approval. Без него не вызывать `confirm_cost`, не создавать branch/Auth users/secrets.

## UX_NEXT_WORK_QUEUE

Не добавлять новые отчёты. Продолжать сокращать путь до подтверждённого результата.

1. СПН: единый маршрут `замечание → что исправить → сохранить → отправить повторно → увидеть принятие`.
2. Юрист: документный цикл `нужен → запросить → получен → проверить → проблема/готово` на одном экране.
3. Карточка: после выполнения действия показывать подтверждение результата и следующий шаг без поиска по вкладкам.
4. Мобильная навигация: оставить ключевое действие и 2–3 контекстные кнопки на первом экране.
5. Менеджер: показывать факт выполнения и evidence, а не только открытый backlog.
6. Измерение UX: клики до действия, доля задач с результатом, возвраты на доработку и изменение просроченного backlog.

## NEXT_WORK_QUEUE

- P1 UX — упростить SPN rework cycle, используя существующие status/comment/rework RPC и hooks.
- P1 UX — собрать документный цикл юриста поверх существующих document RPC.
- P1 UX — показать completion evidence/next step после закрытия главной задачи.
- P0 MANUAL — owner duplicate decision #273.
- P0 MANUAL — шесть pilot-файлов.
- P0 MANUAL — четыре responsibility evidence-файла.
- P0 MANUAL — production-readonly workflow `allow_drift=false`.
- P0 MANUAL COST APPROVAL — issue #282.

## DO NOT REPEAT без новой причины

- общий технический аудит;
- dashboard/list/deal-card/manager action-first UX PR #288/#290/#291/#292;
- public guest/no-JWT/private-helper smoke;
- risk lifecycle #218;
- readiness/task taxonomy/broker/viewer/lawyer previews;
- owner/admin IA;
- adoption/comparison/remediation;
- responsibility и pilot scaffolding;
- duplicate comparison/trigger;
- isolated E2E cost scaffold;
- Edge observability и Advisor attestation.

## Команда следующего запуска

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #292. Один раз проверь ручные gates. Если они пусты, продолжай UX_NEXT_WORK_QUEUE с маршрута СПН: замечание → исправление → повторная отправка → подтверждение. Используй существующие RPC/hooks, не добавляй production mutation без отдельного reviewed contract и не создавай платную Supabase branch без точного approval #282.`
