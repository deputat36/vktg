# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 2026-07-15.
- Текущий `main`: `9183a289d60140e4167fe559dac9d7f622c36e33` — merge PR #296.
- Supabase project: `ofewxuqfjhamgerwzull`.
- Последняя production migration: `20260714125054_nav_v2_exact_duplicate_review_pack`.
- Public operational report version: 8.
- Supabase branches: только production `main`.
- Isolated authenticated target: не создан.
- `authenticated-smoke=skipped` не является authenticated PASS.
- Открытых PR после merge #296: 0.

## Завершённая action-first UX-цепочка

### PR #288 — рабочий стол «Что делать сейчас»

- три объяснимых приоритета;
- role-aware действия;
- рабочие KPI без demo и точных повторов;
- шесть последних рабочих сделок вместо длинного списка;
- pure priority model и semantic CI.

### PR #290 — рабочие режимы списка сделок

- demo скрыты по умолчанию;
- точные повторы объединены, ранняя карточка остаётся;
- быстрые role-aware режимы `Рабочие / Требуют внимания / Просрочено / Без ответственного / Готовы к задатку`;
- полный исходный список доступен через расширенный фильтр;
- используется существующий `nav_v2_get_deals_list`.

### PR #291 — action-first карточка сделки

- блок `Главное действие сейчас` выбирает срочную/просроченную задачу;
- показаны ответственный, срок и критерий готового результата;
- fallback строится по риску, документу или `next_action`;
- переход ведёт прямо в рабочую вкладку;
- hook использует загруженный card payload без нового read RPC.

### PR #292 — прямые маршруты менеджера

- задачи → `#tasks`;
- риски → `#risks`;
- документы → `#docs`;
- пробелы ответственности → `manager-source-remediation-v2.html`;
- используется прежний read-only preview операционной готовности.

### PR #293 — предыдущий канонический handoff

- зафиксировал завершение dashboard/list/card/manager action-first цепочки;
- перенёс точку продолжения на цикл доработки СПН.

### PR #294 — единый цикл доработки СПН

Закрыт маршрут:

`замечание → где исправить → сохранить → отправить повторно → увидеть подтверждение принятия`

СПН получает один заметный блок:

- кто и когда вернул карточку;
- причина возврата;
- структурированный список замечаний: стороны, документы, расчёты, расходы, риски, следующий шаг, ответственные или другое;
- точный переход в нужный раздел;
- `исправлено / не исправлено` только для достоверно проверяемых по payload пунктов;
- обязательный комментарий `что именно исправлено`;
- server-confirmed результат после reload: получатель, время, новый статус, следующий ответственный, срок и что произойдёт дальше.

Юрист и менеджер формируют один структурированный возврат. Юрист видит, что передача повторная, комментарий СПН и быстрые переходы к документам, рискам и комментариям.

Использованы существующие:

- `nav_v2_return_spn_rework`;
- `nav_v2_submit_spn_rework`;
- card payload `deal/documents/risks/tasks/comments/events`.

Новых RPC, migrations, grants и production mutations нет.

Основные файлы:

- `assets/js/nav-v2/deal-card-spn-rework-model-v2.js`;
- `assets/js/nav-v2/deal-card-spn-rework-v2.js`;
- `assets/css/nav-v2-spn-rework.css`;
- `scripts/check-nav-v2-spn-rework-cycle.mjs`;
- `scripts/check_nav_v2_spn_rework_cycle.py`;
- `.github/workflows/nav-v2-spn-rework-cycle.yml`.

Три конкурирующих rework entry-модуля удалены из lifecycle. Module budget карточки снижен с 22 до 19 по фактическому числу entry modules.

### PR #296 — единый документный цикл юриста

Закрыт маршрут:

`нужен → запрошен → получен → проверен / проблема`

- pure-модель выбирает один приоритетный документ: проблема, полученный для проверки, просроченный запрос, обязательный документ к задатку или сделке;
- показаны сторона, причина, влияние на этап сделки, ответственный, контрольный срок, последнее изменение и проблема/комментарий;
- юрист получает одно главное действие, а полный список раскрывается по запросу;
- mutation выполняется существующим `nav_v2_update_document_workflow`;
- после reload серверное событие подтверждает результат и модель выбирает следующий документ;
- lawyer queue ведёт проблемные, просроченные и ожидаемые документы прямо в `#lawyerDocumentCycleV2`;
- hook использует загруженные `documents/participants/events` без дополнительного read RPC;
- прежний module budget карточки сохранён: 19 entry modules.

Новых RPC, migrations, grants и production mutations при deploy нет.

## Проверки PR #294/#296

- dedicated semantic regression: PASS;
- новый static contract: PASS;
- полный Navigator v2 static suite: PASS;
- JavaScript syntax: PASS;
- совместимые deal-card/action-focus/BAZA/risk/SPN save contracts: PASS;
- public desktop/mobile Playwright: 30/30 PASS;
- review threads: 0;
- authenticated job: `skipped`, не считается evidence.

Для PR #296 дополнительно прошли dedicated lawyer document semantic/static workflow, lawyer focus, SPN rework, action focus, BAZA, manager/remediation и все автоматически затронутые совместимые workflows — 17/17 success.

Локальный Playwright не стартовал из-за пустого Chromium-архива, но обязательный GitHub job установил Chromium и прошёл desktop/mobile полностью.

## Production smoke после PR #296

GitHub Pages отдаёт актуальные release-маркеры:

- `deal-card-v2.html` → `nav-v2-lawyer-document-cycle.css?v=20260715-01`;
- lifecycle mapping → `deal-card-recheck-alert-v2.js?v=20260715-14`;
- lifecycle содержит `applyLawyerDocumentCycle`;
- новый hook содержит `nav_v2_update_document_workflow` и server-confirmed completion;
- lawyer queue ведёт в `lawyerDocumentCycleV2`;
- новый CSS содержит desktop/mobile layout.

Supabase после frontend-only merge:

- Deals: 23;
- Tasks: 98;
- Risks: 53;
- Documents: 198;
- Events: 118;
- Documents `needed/requested/received/checked/problem`: `182/0/12/4/0`;
- открытых просроченных документов: 125;
- `document_workflow_updated`: 0;
- `returned_to_spn_rework`: 0;
- `spn_rework_submitted`: 0;
- latest live migration: `20260714125054`;
- `nav_v2_get_deal_card` и `nav_v2_update_document_workflow`: `authenticated=true`, `anon=false`.

Schema, grants, functions, Auth users и рабочие строки PR #296 не менял.

В production есть 3 карточки `need_info`, но исторических rework events нет. UI честно показывает автора возврата как `не зафиксировано` и строит fallback по текущим пробелам. Будущие возвраты сохраняют роль автора и категории внутри существующего team comment.

## Security и release state

- latest migration совпадает с baseline: `20260714125054`;
- live → canonical alias: `20260714125054` → `20260714130000`;
- canonical source blob: `cd6c0962b7f3bfcce5bc3b51fe717fbfca100a14`;
- connector-equivalent evidence: `docs/NAV_V2_LIVE_VERIFICATION_20260714.md`;
- ручной workflow `navigator-production-readonly` с `allow_drift=false` ещё не запускался;
- Advisor whitelist: 48/48, missing 0, unexpected 0;
- leaked-password protection заблокирована до isolated authenticated E2E.

## Ручные gates — проверены один раз 15 июля

### Exact duplicate cleanup

- issue #273 без owner decision;
- удаление/объединение дублей запрещено.

### Operational pilot

- шесть файлов от owner decision до responsible acknowledgement не предоставлены;
- pilot mutation запрещена.

### Responsibility correction

- четыре evidence-файла не предоставлены;
- не менять `seller_spn_id`, `buyer_spn_id`, `manager_id`.

### Production-readonly workflow

- ручной запуск с `allow_drift=false` не предоставлен;
- не подменять его локальной проверкой.

### Isolated authenticated E2E

- issue #282 без точного cost approval;
- не вызывать `confirm_cost`, не создавать branch/Auth users/secrets.

## UX_NEXT_WORK_QUEUE

Не добавлять новые отчёты. Следующий безопасный продуктовый slice:

1. Общий completion evidence после выполнения главного действия: что изменено, кем, когда и какой серверный факт подтверждает результат.
2. Автоматически показывать следующий шаг без поиска по вкладкам после закрытия задачи, документа или риска.
3. Затем — менеджерский контроль фактически подтверждённых результатов, а не только открытого backlog.
4. Мобильный первый экран: одно главное действие и не более 2–3 контекстных кнопок.
5. UX-метрики: клики до действия, доля подтверждённых результатов, возвраты СПН, время повторной проверки и изменение просроченного backlog.

## NEXT_WORK_QUEUE

- P1 UX — общий completion evidence/next step после закрытия главной задачи.
- P1 UX — мобильный первый экран: одно действие и не более 2–3 контекстных кнопок.
- P1 UX — менеджерский контроль фактически подтверждённых результатов.
- P0 MANUAL — owner duplicate decision #273.
- P0 MANUAL — шесть pilot-файлов.
- P0 MANUAL — четыре responsibility evidence-файла.
- P0 MANUAL — production-readonly workflow `allow_drift=false`.
- P0 MANUAL COST APPROVAL — issue #282.

## DO NOT REPEAT без новой причины

- общий технический аудит;
- dashboard/list/deal-card/manager action-first UX PR #288/#290/#291/#292;
- SPN rework lifecycle PR #294;
- lawyer document lifecycle PR #296;
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

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #296. Один раз проверь ручные gates. Если они не изменились, не повторяй SPN rework и lawyer document cycle. Начни общий completion evidence: после выполнения главного действия показать серверно подтверждённый результат, автора, время и автоматически выбрать следующий шаг без поиска по вкладкам. Сначала переиспользуй текущие task/document/risk events и card payload, добавь pure-модель/explicit hook/semantic regression, не меняй рабочие данные и не создавай платную Supabase branch без точного approval #282. Заверши branch → PR → CI → merge → production smoke → handoff.`
