# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 2026-07-15.
- Текущий продуктовый `main`: `0a127e4990a14b52d9d0ba040a84fe317af35365` — merge PR #309.
- Репозиторий: `deputat36/vktg`.
- Supabase project: `ofewxuqfjhamgerwzull`.
- Последняя production migration: `20260714125054_nav_v2_exact_duplicate_review_pack`.
- Supabase branches: только production `main`.
- Isolated authenticated target: не создан.
- `authenticated-smoke=skipped` не является authenticated evidence.
- PR #309 frontend/tests-only: рабочие данные, Auth users, schema, grants, RPC и Edge Functions не менялись.
- Открытых PR после merge #309 не было на момент подготовки handoff.

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

Добавлен минимальный измерительный слой без collector и хранения.

- локальный `CustomEvent` `nav-v2:ux-measurement`;
- только enum-поля: поверхность, viewport, тип/позиция действия и диапазон времени;
- нет UUID, URL сделки, адресов, ФИО, телефонов, email, комментариев, стоимости или точных timestamps;
- нет network transport, RPC, browser storage или backend;
- click не считается подтверждённым результатом;
- pure server model определяет только категории подтверждённых результатов и диапазоны длительности доработки СПН;
- персональные рейтинги запрещены;
- управленческие разрезы запрещены при выборке менее пяти завершённых циклов.

### PR #309 — keyboard/focus continuity

Закрыт следующий accessibility-маршрут:

`клавиатурное действие → обновление интерфейса → фокус остаётся в понятной рабочей точке`

Общий слой работает на dashboard, deals, deal card и manager page:

- primary CTA получает проверяемое accessible name;
- общий `:focus-visible` показывает контрастный outline;
- forced-colors использует системный `CanvasText`;
- summary получает `aria-controls` и актуальный `aria-expanded`;
- если disclosure закрывается, пока фокус находится внутри, фокус возвращается на summary;
- после клавиатурного перехода во вкладку карточки фокус попадает на активную рабочую panel;
- прямое открытие карточки с `#tasks`, `#docs`, `#risks` и другими рабочими hash направляет фокус в точную panel;
- активная вкладка получает `aria-pressed`;
- положительный `tabindex` запрещён;
- pointer navigation не перехватывается принудительным focus jump;
- prefers-reduced-motion отключает плавное прокручивание для focus transition.

Архитектура:

- pure model: `assets/js/nav-v2/focus-continuity-model-v2.js`;
- delegated DOM runtime: `assets/js/nav-v2/focus-continuity-v2.js`;
- runtime подключён через существующий `mobile-first-screen-v2.js`;
- четыре HTML remap mobile lifecycle на `20260715-03`;
- page entry-module budgets не увеличены;
- role-aware права и mutation handlers не менялись.

## Проверки PR #309

Финальный head: `1c2e69452281f4f21a2e796703edd3923b19dfe3`.

Все 15 запущенных workflow завершились успешно:

- keyboard focus semantic regression: PASS;
- Python static focus contract: PASS;
- JavaScript и Python syntax: PASS;
- public Playwright desktop/mobile: PASS;
- browser focus evidence uploaded: PASS;
- полный Navigator v2 static suite: PASS;
- page module budgets: PASS;
- mobile first screen: PASS;
- privacy-safe UX measurement: PASS;
- dashboard priority: PASS;
- deals work modes: PASS;
- deal action focus: PASS;
- SPN rework cycle: PASS;
- lawyer document cycle: PASS;
- completion evidence: PASS;
- manager action routes: PASS;
- manager confirmed results: PASS;
- BAZA checks: PASS;
- public guest gates: PASS;
- review threads: 0.

Authenticated workflow:

- `public-smoke`: PASS;
- `authenticated-smoke`: skipped;
- skipped не является authenticated PASS.

В процессе browser-проверки были исправлены только тестовые ожидания:

- disclosure приводится к состоянию, соответствующему viewport;
- тест проверяет реальный focus marker рабочей panel;
- cache-bust shared lifecycle синхронизирован со static contracts.

## Post-merge source smoke после PR #309

Канонический `main` содержит:

- `focus-continuity-model-v2.js` с закрытым списком вкладок, понятными названиями panel и policy без положительного tabindex;
- `focus-continuity-v2.js` с keyboard modality, focus restore для disclosure и hash/tab focus transition;
- `mobile-first-screen-v2.js` импортирует UX measurement и focus continuity, затем применяет оба hook после disclosure sync;
- `nav-v2-mobile-first-screen.css` содержит общий focus-visible, forced-colors и scroll-margin для рабочей panel;
- dashboard, deals, deal card и manager remap mobile lifecycle на cache-busted `20260715-03`;
- dedicated semantic/static/browser workflow;
- существующие mobile-first и privacy-safe contracts обновлены на новый release marker.

Прямое независимое чтение GitHub Pages из текущего рабочего окружения не выполнялось из-за сетевой политики среды. Это не подменяется source smoke: desktop/mobile browser evidence получено в обязательных GitHub Actions jobs.

## Supabase и рабочие данные

PR #309 frontend/tests-only:

- migrations не добавлялись;
- schema не менялась;
- RPC и grants не менялись;
- Auth users не создавались;
- Edge Functions не менялись;
- production rows не менялись;
- preview branch не создавалась;
- service-role secret не использовался.

Последний подтверждённый read-only baseline до PR #309:

- Deals: 23;
- Tasks: 98;
- Risks: 53;
- Documents: 198;
- Events: 118;
- latest live migration: `20260714125054`.

PR #309 не выполнял production read/write и не претендует на новый live baseline.

## Ручные gates — без изменений

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

P1 UX — accessible live status и recovery continuity для четырёх action-first экранов.

Цель: после загрузки, успешного действия или ошибки пользователь должен понять, что произошло и что делать дальше, включая работу со screen reader.

1. Проверить dashboard, deals, deal card и manager page на loading, empty, success, warning и error messages.
2. Динамические нейтральные обновления должны использовать `role="status"` или `aria-live="polite"`.
3. Ошибки, которые блокируют продолжение, должны использовать `role="alert"` без повторного объявления при каждом rerender.
4. Сообщение должно описывать пользовательское действие и следующий шаг; UUID, RPC, JWT, Supabase и технические stack details не выводить в рабочий экран.
5. После неуспешного действия фокус не должен пропадать: сохранить его на доступной кнопке повторения или перевести на единственный actionable recovery control.
6. Не считать локальное success-сообщение результатом сделки; подтверждённый результат по-прежнему требует server event и совпадения текущего состояния.
7. Не добавлять telemetry, storage, RPC, migration или production mutation.
8. Добавить pure policy, static contract и public Playwright desktop/mobile regressions.

Measurement backend остаётся заблокирован до отдельного решения, где утверждены:

- управленческое решение, которое меняется от метрики;
- denominator и дедупликация;
- минимальная выборка;
- retention;
- доступы;
- запрет идентификаторов и свободного текста;
- privacy review.

## DO NOT REPEAT без новой причины

- общий продуктовый аудит;
- action-first dashboard/list/card/manager chain PR #288/#290/#291/#292;
- SPN rework PR #294;
- lawyer document cycle PR #296;
- completion evidence PR #298;
- manager confirmed results PR #300;
- mobile operational first screen PR #302;
- privacy-safe event contract PR #306;
- keyboard/focus continuity PR #309;
- public guest/no-JWT/private-helper smoke;
- risk lifecycle;
- operational readiness/task taxonomy/broker/viewer/lawyer previews;
- owner/admin IA;
- adoption/comparison/remediation;
- responsibility и pilot scaffolding;
- exact duplicate trigger/review pack;
- isolated E2E cost scaffold;
- Edge observability и Advisor attestation.

## Команда следующего запуска

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #309. Один раз проверь ручные gates. Если они не изменились, не повторяй action-first, SPN rework, документный цикл, completion evidence, manager results, mobile first-screen, privacy-safe measurement и keyboard/focus continuity. Начни accessible live status/recovery continuity для dashboard, deals, deal card и manager: корректные role=status/alert, отсутствие повторных объявлений, понятный следующий шаг после ошибки и сохранение фокуса на recovery control. Не выводи технические идентификаторы и не выдавай локальное success-сообщение за server-confirmed результат. Не добавляй telemetry, storage, RPC/migration и не меняй рабочие данные. Не создавай платную Supabase branch без точного approval #282. Заверши branch → PR → CI → merge → post-merge smoke → handoff.`
