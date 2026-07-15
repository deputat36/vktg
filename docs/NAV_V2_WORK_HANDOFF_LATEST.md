# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 2026-07-15.
- Текущий `main`: `ce2d91ef09b20e4e21693b5f2362dbd38184f740` — merge PR #306.
- Репозиторий: `deputat36/vktg`.
- Supabase project: `ofewxuqfjhamgerwzull`.
- Последняя production migration: `20260714125054_nav_v2_exact_duplicate_review_pack`.
- Supabase branches: только production `main`.
- Isolated authenticated target: не создан.
- `authenticated-smoke=skipped` внутри PR browser workflow не является authenticated evidence.
- Рабочие данные, Auth users, schema, grants, RPC и Edge Functions в PR #306 не менялись.

## Завершённая продуктовая цепочка

### PR #288 — dashboard «Что делать сейчас»

- три объяснимых приоритета;
- role-aware действия;
- рабочие KPI без demo и точных повторов;
- шесть последних рабочих сделок;
- pure priority model и semantic CI.

### PR #290 — рабочие режимы списка сделок

- demo скрыты по умолчанию;
- точные повторы объединены в рабочем режиме;
- role-aware быстрые режимы;
- полный исходный список доступен через расширенный фильтр;
- используется существующий `nav_v2_get_deals_list`.

### PR #291 — action-first карточка

- один блок `Главное действие сейчас`;
- ответственный, срок и критерий результата;
- точный переход в нужный раздел;
- без нового read RPC.

### PR #292 — прямые маршруты менеджера

- задачи → `#tasks`;
- риски → `#risks`;
- документы → `#docs`;
- ответственность → `manager-source-remediation-v2.html`;
- используется read-only preview операционной готовности.

### PR #294 — единый цикл доработки СПН

Закрыт маршрут:

`замечание → где исправить → сохранить → повторно отправить → увидеть серверное подтверждение`

- структурированный возврат;
- достоверное `исправлено / не исправлено`;
- обязательный комментарий СПН;
- server-confirmed результат после reload;
- используются существующие `nav_v2_return_spn_rework` и `nav_v2_submit_spn_rework`.

### PR #296 — документный цикл юриста

Закрыт маршрут:

`нужен → запрошен → получен → проверен / проблема`

- один приоритетный документ;
- сторона, причина, влияние, ответственный и срок;
- существующий `nav_v2_update_document_workflow`;
- server-confirmed результат и следующий документ;
- без дополнительного read RPC.

### PR #298 — подтверждение результата и следующий шаг

Закрыт маршрут:

`сохранить → подтвердить сервером → показать результат → выбрать следующий шаг`

- завершённая задача, проверенный документ, устранённый риск или переход сделки;
- audit event принимается только при совпадении с текущим состоянием сущности;
- no-op, обратные, повторно открытые и старше семи дней события отбрасываются;
- показаны автор/роль, время и серверный факт;
- автоматически выбираются следующий шаг, ответственный, срок и критерий.

### PR #300 — менеджерский контроль подтверждённых результатов

Менеджер видит отдельно:

1. что требует решения;
2. что действительно завершено и подтверждено сервером.

- режимы `Сегодня` и `За 7 дней`;
- календарный день рассчитывается в `Europe/Moscow`;
- максимум 40 карточек и 4 параллельных read-запроса;
- manager module остаётся read-only.

### PR #302 — мобильный операционный первый экран

На ширине 360–430 px:

- dashboard показывает первый приоритет до профиля и KPI;
- список показывает следующую работу первой сделки до агрегатов;
- карточка поднимает доработку, документный цикл, подтверждённый результат или action focus;
- manager показывает первую сделку очереди решений до отчётных блоков;
- дополнительная информация доступна через progressive disclosure;
- desktop-содержимое остаётся раскрытым;
- page module budgets не увеличены.

### PR #306 — privacy-safe UX measurement contract

Добавлен минимальный измерительный слой без collector и без хранения.

Browser runtime:

- использует локальный `CustomEvent` `nav-v2:ux-measurement`;
- фиксирует только открытие главного действия и первое раскрытие дополнительного контекста;
- содержит только enum-поля: поверхность, viewport, тип действия, позиция и диапазон времени;
- работает на dashboard, deals, deal card и manager page;
- подключён через существующий `mobile-first-screen-v2.js`, поэтому page entry-module budgets не выросли;
- import maps направляют старый mobile lifecycle URL на cache-busted `20260715-02`.

Pure server measurement model:

- переиспользует `buildDealCompletionEvidence`;
- определяет server-confirmed результат задачи, документа, риска или статуса;
- находит возврат СПН, более позднюю повторную отправку и более позднее решение проверки;
- выдаёт только диапазоны времени `возврат → отправка` и `отправка → решение`;
- не подключён к browser transport и ничего не отправляет.

Privacy contract:

- нет `fetch`, `sendBeacon`, WebSocket, RPC или Supabase transport;
- нет `localStorage`, `sessionStorage`, IndexedDB или cookies;
- нет UUID, URL сделки, адресов, ФИО, телефонов, email, комментариев, документов, стоимости и точных server timestamps;
- роль пользователя не отправляется браузером;
- click не считается результатом;
- неизвестные поля отбрасываются enum-моделью;
- запрещены персональные рейтинги;
- управленческий разрез не допускается при выборке менее пяти завершённых циклов;
- текущий контракт не разрешает таблицу telemetry, collector, retention или новый отчёт.

Параллельный PR #307 закрыт без merge, потому что добавлял `sessionStorage`, отдельный отчётный экран и увеличивал module budgets до утверждения measurement policy.

## Проверки PR #306

Финальный head: `7aead3ad901f25cc913277798d97b332558b385f`.

- privacy-safe semantic Node regression: PASS;
- Python static privacy contract: PASS;
- JavaScript и Python syntax: PASS;
- page module budgets: PASS без увеличения лимитов;
- полный Navigator v2 static suite: PASS;
- dashboard priority: PASS;
- deals work modes: PASS;
- deal action focus: PASS;
- SPN rework cycle: PASS;
- lawyer document cycle: PASS;
- completion evidence: PASS;
- manager action routes: PASS;
- manager confirmed results: PASS;
- mobile first screen: PASS;
- BAZA checks: PASS;
- synthetic Playwright desktop/mobile: PASS;
- browser evidence uploaded: PASS;
- public guest gates: PASS;
- review threads: 0.

Первый CI-запуск выявил два инфраструктурных дефекта реализации теста:

1. отдельный entry script превысил module budget — runtime перенесён в общий mobile lifecycle, лимиты не увеличивались;
2. synthetic fixture не содержал стандартный `#app` — исправлен только fixture.

После исправлений все запущенные workflows завершились успешно.

## Post-merge source smoke после PR #306

Канонический `main` содержит:

- `assets/js/nav-v2/ux-measurement-model-v2.js` со schema version 1 и закрытыми enum;
- `assets/js/nav-v2/ux-measurement-v2.js` с локальным `CustomEvent` и marker `event-only-v1`;
- `assets/js/nav-v2/ux-server-measurement-model-v2.js` с server-confirmed outcome/rework definitions;
- `assets/js/nav-v2/mobile-first-screen-v2.js` импортирует UX runtime;
- четыре рабочих HTML remap mobile lifecycle `20260715-01` → `20260715-02`;
- `docs/NAV_V2_UX_MEASUREMENT_CONTRACT.md` с privacy, sampling и backend guardrails;
- dedicated semantic/static/browser workflow.

Прямое независимое чтение GitHub Pages из текущего рабочего окружения не выполнялось из-за сетевой политики среды. Это не подменено source-проверкой: public desktop/mobile browser evidence получено в GitHub Actions на merge-кандидате.

## Supabase и рабочие данные

PR #306 frontend/docs/tests-only:

- migrations не добавлялись;
- schema не менялась;
- RPC и grants не менялись;
- Auth users не создавались;
- Edge Functions не менялись;
- production rows не менялись;
- preview branch не создавалась;
- service-role secret не использовался.

Последний подтверждённый read-only baseline до PR #306:

- Deals: 23;
- Tasks: 98;
- Risks: 53;
- Documents: 198;
- Events: 118;
- latest live migration: `20260714125054`.

PR #306 не выполнял production read/write и не претендует на новый live baseline.

## Ручные gates — проверены один раз 15 июля

### Exact duplicate cleanup

- issue #273 открыт;
- owner decision по четырём группам не предоставлен;
- удаление, объединение и архивирование запрещено.

### Operational pilot

- шесть evidence-файлов от owner decision до responsible acknowledgement не предоставлены;
- pilot mutation запрещена.

### Responsibility correction

- четыре evidence-файла не предоставлены;
- не менять `seller_spn_id`, `buyer_spn_id`, `manager_id`.

### Production-readonly workflow

- ручной запуск `navigator-production-readonly` с `allow_drift=false` не предоставлен;
- source/browser smoke не подменяет этот workflow.

### Isolated authenticated E2E

- issue #282 без точного cost approval;
- generic-команда `продолжай` не является cost approval;
- не вызывать `confirm_cost`;
- не создавать Supabase branch, Auth users, secrets или synthetic target.

## Следующий безопасный продуктовый slice

P1 UX — keyboard/focus/accessibility continuity для action-first экранов.

1. Проверить dashboard, deals, deal card и manager page клавиатурой на desktop и mobile viewport.
2. Главное действие должно быть первым логичным интерактивным элементом рабочего блока.
3. После раскрытия progressive disclosure фокус не должен теряться или перескакивать в скрытую область.
4. После перехода во вкладку карточки фокус должен попадать на заголовок/рабочий блок, а не оставаться на исчезнувшей кнопке.
5. Все primary/context actions должны иметь различимые accessible names и видимый focus state.
6. Не менять role-aware права, mutation handlers, Supabase или рабочие данные.
7. Добавить semantic/static и public Playwright keyboard regressions.

Measurement backend остаётся заблокирован до отдельного решения, где утверждены:

- управленческое решение, которое меняется от метрики;
- denominator и дедупликация;
- минимальная выборка;
- retention;
- доступы;
- запрет идентификаторов и свободного текста;
- privacy review.

## NEXT_WORK_QUEUE

- P1 UX — keyboard/focus/accessibility continuity четырёх action-first экранов.
- P1 MANUAL MEASUREMENT — решение о необходимости collector/aggregation, denominator, retention и access policy.
- P0 MANUAL — owner duplicate decision #273.
- P0 MANUAL — шесть pilot evidence-файлов.
- P0 MANUAL — четыре responsibility evidence-файла.
- P0 MANUAL — production-readonly workflow `allow_drift=false`.
- P0 MANUAL COST APPROVAL — issue #282.

## DO NOT REPEAT без новой причины

- общий технический аудит;
- dashboard/list/deal-card/manager action-first PR #288/#290/#291/#292;
- SPN rework PR #294;
- lawyer document lifecycle PR #296;
- completion evidence PR #298;
- manager confirmed results PR #300;
- mobile first-screen PR #302;
- privacy-safe event schema/contract PR #306;
- новый UX report, collector, session storage или telemetry backend без отдельного решения;
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

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #306. Один раз проверь ручные gates. Если они не изменились, не повторяй action-first, SPN rework, документный цикл, completion evidence, manager confirmed results, mobile first-screen и privacy-safe measurement contract. Начни keyboard/focus/accessibility continuity slice для dashboard, deals, deal card и manager page: логичный порядок фокуса, видимый focus state, сохранение фокуса при раскрытии и точный focus target после переходов. Добавь semantic/static/public desktop-mobile keyboard regressions. Не создавай UX collector/report/storage/backend без отдельного решения о denominator, retention, доступах и privacy. Не меняй рабочие данные и не создавай платную Supabase branch без точного approval #282. Заверши branch → PR → CI → merge → post-merge smoke → handoff.`
