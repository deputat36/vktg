# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 2026-07-15.
- Текущий `main`: `902910f09a65fa5c186d39bfdded44ebdf8c85b8` — merge PR #302.
- Supabase project: `ofewxuqfjhamgerwzull`.
- Последняя подтверждённая production migration: `20260714125054_nav_v2_exact_duplicate_review_pack`.
- Public operational report version: 8.
- Supabase branches: только production `main` по последнему подтверждённому snapshot.
- Isolated authenticated target: не создан.
- `authenticated-smoke=skipped` не является authenticated PASS.
- Дублирующий PR #303 закрыт без merge в пользу более глубоко интегрированного PR #302.

## Завершённая продуктовая UX-цепочка

### PR #288–#292 — action-first основа

- рабочий стол показывает объяснимые приоритеты;
- список сделок работает через role-aware режимы;
- карточка выбирает одно главное действие;
- менеджерские маршруты ведут сразу в задачи, риски, документы или ответственность;
- demo и точные повторы не мешают рабочему набору.

### PR #294 — единый цикл доработки СПН

Закрыт маршрут:

`замечание → раздел исправления → сохранение → повторная отправка → подтверждение`

- один структурированный возврат;
- достоверное `исправлено / не исправлено`;
- обязательный комментарий СПН;
- server-confirmed результат после reload;
- существующие `nav_v2_return_spn_rework` и `nav_v2_submit_spn_rework`;
- без новых RPC, migrations, grants и production mutations.

### PR #296 — единый документный цикл юриста

Закрыт маршрут:

`нужен → запрошен → получен → проверен / проблема`

- один приоритетный документ;
- сторона, причина, влияние, ответственный и срок;
- существующий `nav_v2_update_document_workflow`;
- серверное подтверждение и автоматический выбор следующего документа;
- без нового read RPC и без новых production mutations.

### PR #298 — подтверждение результата и следующий шаг

Закрыт маршрут:

`сохранить → подтвердить сервером → показать результат → выбрать следующий шаг`

- выполненная задача, проверенный документ, устранённый риск или переход сделки вперёд;
- audit event принимается только при совпадении с текущим состоянием сущности;
- no-op, обратные, повторно открытые и старше семи дней события отбрасываются;
- показаны автор или роль, время и понятный серверный факт;
- action-first модель выбирает следующий шаг, владельца, срок и критерий результата.

### PR #300 — менеджерский контроль подтверждённых результатов

Менеджер видит две независимые картины:

1. что требует решения;
2. что фактически завершено и подтверждено сервером.

Блок показывает результат, автора/роль, время, серверный факт, следующего владельца, срок и критерий готовности. Режим `Сегодня` использует календарный день `Europe/Moscow`, а не последние 24 часа.

### PR #302 — мобильный операционный первый экран

На ширине 360–430 px dashboard, список сделок, карточка и кабинет менеджера перестроены вокруг одного ближайшего действия.

#### Dashboard

- первый объяснимый приоритет находится выше профиля и агрегатов;
- на первом экране остаётся одна основная кнопка карточки;
- дополнительные приоритеты доступны через `Ещё приоритеты`;
- desktop продолжает показывать полный набор.

#### Список сделок

- ближайший шаг первой сделки располагается раньше KPI, фильтров и остальных карточек;
- дополнительные сделки и режимы доступны через progressive disclosure;
- основная кнопка `Продолжить работу` занимает доступную ширину;
- desktop список остаётся развёрнутым.

#### Карточка сделки

Приоритет первого экрана:

1. активный rework/document lifecycle;
2. серверно подтверждённый результат;
3. текущее главное действие.

- вторичные метрики и mutation toolboxes расположены ниже;
- metadata подтверждённого результата раскрывается отдельно;
- role-aware controls и mutation handlers не изменены;
- используется уже загруженный card payload.

#### Кабинет менеджера

- первая сделка очереди решений выводится перед readiness, workload и историей подтверждённых результатов;
- у карточки сохраняется одно главное действие и ограниченный набор контекстных переходов;
- остальные строки и агрегаты доступны через раскрытие;
- desktop остаётся полнофункциональным.

## Архитектура PR #302

- pure policy: `assets/js/nav-v2/mobile-first-screen-model-v2.js`;
- explicit disclosure hook: `assets/js/nav-v2/mobile-first-screen-v2.js`;
- общий responsive слой: `assets/css/nav-v2-mobile-first-screen.css`;
- lifecycle интеграция внутри существующих dashboard/deals/card/manager modules;
- нет `MutationObserver`, отдельного data fetch, browser storage или нового RPC;
- мобильный breakpoint: `max-width: 430px`;
- desktop disclosure автоматически остаётся раскрытым.

Основные release-маркеры:

- `dashboard-v2.html` → `dashboard-v2.js?v=20260715-01`;
- `deals-v2.html` → `deals-v2.js?v=20260715-01`;
- `deal-card-v2.html` → `deal-card-v2.js?v=20260715-02`;
- `manager-v2.html` → `manager-v2.js?v=20260715-02`;
- все четыре страницы подключают `nav-v2-mobile-first-screen.css?v=20260715-01`.

## Проверки PR #302

- dedicated mobile semantic contract: PASS;
- dedicated mobile static contract: PASS;
- JavaScript syntax: PASS;
- полный Navigator v2 static suite: PASS, 52/52 команд;
- dashboard priority: PASS;
- deals work modes: PASS;
- deal action focus: PASS;
- completion evidence: PASS;
- SPN rework cycle: PASS;
- lawyer document cycle: PASS;
- manager action routes: PASS;
- manager confirmed results: PASS;
- BAZA и совместимые operational contracts: PASS;
- public desktop/mobile Playwright: PASS;
- browser evidence uploaded: PASS;
- review threads: 0;
- authenticated job: `skipped`, не считается authenticated evidence.

## Post-merge source smoke

Канонический `main` после merge содержит:

- mobile CSS release marker на dashboard, deals, deal card и manager page;
- новые cache-busting версии четырёх runtime modules;
- pure `PAGE_POLICIES` для четырёх поверхностей;
- `applyMobileFirstScreenDisclosure` с `matchMedia('(max-width: 430px)')`;
- progressive disclosure через native `details`;
- dashboard lifecycle с первым приоритетом и раскрываемыми дополнительными приоритетами.

Прямое независимое чтение развёрнутой GitHub Pages из текущего рабочего окружения не использовалось как evidence. Фактический public desktop/mobile browser smoke выполнен GitHub Actions на merge-кандидате и завершён успешно.

## Supabase и рабочие данные

PR #302 frontend-only:

- schema не менялась;
- migrations не добавлялись;
- RPC definitions и grants не менялись;
- Auth users не создавались;
- Edge Functions не менялись;
- production rows не менялись;
- preview branch не создавалась;
- service-role secret не использовался.

Последний сохранённый production baseline:

- Deals: 23;
- Tasks: 98;
- Risks: 53;
- Documents: 198;
- Events: 118;
- latest live migration: `20260714125054`.

Это baseline предыдущего read-only цикла, а не новая post-PR #302 live-проверка.

## Security и release state

- latest migration baseline: `20260714125054`;
- live → canonical alias: `20260714125054` → `20260714130000`;
- canonical source blob: `cd6c0962b7f3bfcce5bc3b51fe717fbfca100a14`;
- connector-equivalent evidence: `docs/NAV_V2_LIVE_VERIFICATION_20260714.md`;
- ручной workflow `navigator-production-readonly` с `allow_drift=false` ещё не запускался;
- Advisor whitelist: 48/48, missing 0, unexpected 0;
- leaked-password protection заблокирована до isolated authenticated E2E.

## Ручные gates — проверены один раз 15 июля

### Exact duplicate cleanup

- issue #273 без owner decision;
- удаление, объединение и архивирование дублей запрещено.

### Operational pilot

- шесть файлов от owner decision до responsible acknowledgement не предоставлены;
- pilot mutation запрещена.

### Responsibility correction

- четыре evidence-файла не предоставлены;
- не менять `seller_spn_id`, `buyer_spn_id`, `manager_id`.

### Production-readonly workflow

- ручной запуск с `allow_drift=false` не предоставлен;
- не подменять его source или локальной проверкой.

### Isolated authenticated E2E

- issue #282 без точного cost approval;
- generic-команда `продолжай` не является cost approval;
- не вызывать `confirm_cost`;
- не создавать branch, Auth users, secrets или synthetic target.

## UX_NEXT_WORK_QUEUE

Не добавлять новый отчёт до появления достоверных сигналов. Следующий безопасный slice — измеримый UX event contract без изменения рабочих данных.

1. Определить небольшой словарь событий:
   - открытие главного действия;
   - раскрытие дополнительных приоритетов/сделок;
   - переход к следующему шагу после подтверждённого результата;
   - возврат СПН и повторная отправка;
   - открытие менеджером причины контроля.
2. Отправлять события через единый frontend event bus без `localStorage`, cookies и сетевой отправки по умолчанию.
3. Не включать ФИО, телефон, email, адрес, UUID сделки или свободный текст.
4. Добавить semantic/static/browser contracts, которые проверяют название события, поверхность, роль, тип действия и отсутствие персональных данных.
5. Только после отдельного решения определить допустимый способ агрегирования и хранения.

После event contract можно подготовить read-only метрики на уже существующих серверных audit events:

- доля подтверждённых результатов;
- количество возвратов СПН;
- время между возвратом и повторной отправкой;
- изменение просроченного backlog;
- время между подтверждённым результатом и следующим серверным действием.

## NEXT_WORK_QUEUE

- P1 UX — privacy-safe frontend UX event contract без persistence/network по умолчанию.
- P1 ANALYTICS — read-only определения метрик на существующих audit events.
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
- completion evidence/automatic next step PR #298;
- manager confirmed results PR #300;
- mobile first-screen PR #302;
- закрытый дублирующий PR #303;
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

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #302. Один раз проверь ручные gates. Если они не изменились, не повторяй action-first, SPN rework, документный цикл, completion evidence, manager confirmed results и mobile first-screen. Начни privacy-safe UX event contract: единый frontend event bus для главного действия, progressive disclosure, next step после подтверждённого результата, возврата/повторной отправки СПН и менеджерского контроля. Без localStorage, cookies, network, PII, UUID сделки, свободного текста, новых RPC и production mutations. Добавь pure model, explicit hooks, semantic/static/public browser regressions. Заверши branch → PR → CI → merge → source smoke → handoff.`
