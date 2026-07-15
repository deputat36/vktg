# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 2026-07-15.
- Текущий `main`: `c1dd6f759e822965b4959775ce78965d8a38fbb6` — merge PR #300.
- Supabase project: `ofewxuqfjhamgerwzull`.
- Последняя production migration: `20260714125054_nav_v2_exact_duplicate_review_pack`.
- Public operational report version: 8.
- Supabase branches: только production `main`.
- Isolated authenticated target: не создан.
- `authenticated-smoke=skipped` не является authenticated PASS.
- Открытых PR после merge #300: 0 на момент подготовки handoff.

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
- быстрые role-aware режимы;
- полный исходный список доступен через расширенный фильтр;
- используется существующий `nav_v2_get_deals_list`.

### PR #291 — action-first карточка сделки

- один блок `Главное действие сейчас`;
- ответственный, срок и критерий готового результата;
- fallback по риску, документу или `next_action`;
- точный переход в рабочую вкладку;
- без нового read RPC.

### PR #292 — прямые маршруты менеджера

- задачи → `#tasks`;
- риски → `#risks`;
- документы → `#docs`;
- пробелы ответственности → `manager-source-remediation-v2.html`;
- используется read-only preview операционной готовности.

### PR #294 — единый цикл доработки СПН

Закрыт маршрут:

`замечание → где исправить → сохранить → отправить повторно → увидеть подтверждение принятия`

- структурированный возврат;
- достоверное `исправлено / не исправлено`;
- обязательный комментарий СПН;
- server-confirmed результат после reload;
- использованы существующие `nav_v2_return_spn_rework` и `nav_v2_submit_spn_rework`;
- новых RPC, migrations, grants и production mutations нет.

### PR #296 — единый документный цикл юриста

Закрыт маршрут:

`нужен → запрошен → получен → проверен / проблема`

- один приоритетный документ;
- сторона, причина, влияние, ответственный и срок;
- существующий `nav_v2_update_document_workflow`;
- server-confirmed результат и автоматический выбор следующего документа;
- без дополнительного read RPC;
- новых RPC, migrations, grants и production mutations нет.

### PR #298 — серверное подтверждение результата и следующий шаг

Закрыт маршрут:

`сохранить → подтвердить сервером → показать результат → выбрать следующий шаг`

- завершённая задача, проверенный документ, устранённый риск или переход сделки вперёд;
- audit event принимается только при совпадении с текущим состоянием сущности;
- no-op, обратные, повторно открытые и старше семи дней события отбрасываются;
- показаны автор/роль, время и серверный факт;
- action-first модель сразу выбирает следующий шаг, ответственного, срок и критерий готовности;
- новых RPC, migrations, grants и production mutations нет.

### PR #300 — менеджерский контроль подтверждённых результатов

Менеджер теперь видит две независимые картины:

1. что требует решения;
2. что фактически завершено и подтверждено сервером.

Новый блок `Подтверждённые результаты` показывает:

- завершённую задачу, проверенный документ, устранённый риск или переход сделки вперёд;
- сделку и результат;
- автора или достоверно определимую роль;
- точное время;
- понятный серверный факт;
- следующий шаг;
- следующего ответственного;
- контрольный срок;
- критерий готового результата;
- одну основную кнопку точного перехода.

Режимы:

- `Сегодня` — точный календарный день в `Europe/Moscow`, а не последние 24 часа;
- `За 7 дней` — только актуальные подтверждённые результаты.

Архитектура и ограничения:

- переиспользуется `nav_v2_get_operational_readiness_preview`;
- подробная карточка читается существующим `nav_v2_get_deal_card` только для сделок с недавней активностью;
- максимум 40 карточек за один цикл;
- максимум 4 параллельных read-запроса;
- pure-модель повторно использует `buildDealCompletionEvidence` из PR #298;
- manager module не вызывает `nav_v2_update_*`, `nav_v2_add_*` или `nav_v2_save_*`;
- новых migrations, RPC, grants, Auth users, Supabase branches и production mutations нет.

Основные файлы:

- `assets/js/nav-v2/manager-confirmed-results-model-v2.js`;
- `assets/js/nav-v2/manager-v2.js`;
- `assets/css/nav-v2-manager.css`;
- `scripts/check-nav-v2-manager-confirmed-results.mjs`;
- `scripts/check_nav_v2_manager_confirmed_results.py`;
- `.github/workflows/nav-v2-manager-confirmed-results.yml`.

## Проверки PR #300

- dedicated manager confirmed results semantic regression: PASS;
- dedicated static/read-only contract: PASS;
- manager action routes: PASS;
- operational readiness contract: PASS;
- полный Navigator v2 static suite: PASS;
- JavaScript syntax: PASS;
- public desktop/mobile browser smoke: PASS;
- public browser evidence uploaded: PASS;
- review threads: 0;
- authenticated job: `skipped`, не считается authenticated evidence.

Первый CI-запуск упал только потому, что старый operational readiness contract ожидал предыдущие cache-busting версии CSS/JS. Продуктовая semantic regression уже была зелёной. Контракт обновлён на фактические release-маркеры, после чего все обязательные проверки прошли.

## Post-merge source smoke после PR #300

Канонический `main` содержит актуальные release-маркеры:

- `manager-v2.html` → `nav-v2-manager.css?v=20260715-01`;
- `manager-v2.html` → `manager-v2.js?v=20260715-01`;
- `manager-v2.js` подключает `manager-confirmed-results-model-v2.js?v=20260715-01`;
- модель содержит семидневную актуальность и часовой пояс `Europe/Moscow`;
- модель повторно использует `buildDealCompletionEvidence`;
- manager UI содержит `Подтверждённые результаты`, `Сегодня`, `За 7 дней`, серверный факт и следующий ответственный шаг.

Прямое независимое чтение GitHub Pages из текущего рабочего окружения не выполнено из-за сетевого ограничения среды. Public desktop/mobile GitHub Actions smoke прошёл на merge-кандидате. При следующем запуске можно повторить live Pages smoke, не меняя данные.

## Supabase и рабочие данные

PR #300 frontend-only:

- schema не менялась;
- migrations не добавлялись;
- grants и RPC definitions не менялись;
- Auth users не создавались;
- Edge Functions не менялись;
- production rows не менялись;
- preview branch не создавалась;
- service-role secret не использовался.

Последний подтверждённый production baseline остаётся:

- Deals: 23;
- Tasks: 98;
- Risks: 53;
- Documents: 198;
- Events: 118;
- latest live migration: `20260714125054`.

Не трактовать эти числа как новую post-PR #300 live-проверку: это сохранённый baseline после предыдущего frontend-only цикла.

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
- не подменять его локальной или source-проверкой.

### Isolated authenticated E2E

- issue #282 без точного cost approval;
- generic-команда `продолжай` не является cost approval;
- не вызывать `confirm_cost`;
- не создавать branch, Auth users, secrets или synthetic target.

## UX_NEXT_WORK_QUEUE

Не добавлять новые отчёты. Следующий безопасный продуктовый slice:

1. Мобильный первый экран: одно главное действие и не более 2–3 контекстных кнопок.
2. В первую очередь проверить dashboard, список сделок, карточку сделки и кабинет менеджера на ширине 360–430 px.
3. Главный результат и следующий шаг должны быть видны без длинной прокрутки и без конкуренции нескольких primary-кнопок.
4. Сохранить desktop UX и role-aware ограничения.
5. Затем подготовить UX-метрики: клики до действия, доля подтверждённых результатов, возвраты СПН, время повторной проверки и изменение просроченного backlog.

## NEXT_WORK_QUEUE

- P1 UX — мобильный первый экран: одно действие и не более 2–3 контекстных кнопок.
- P1 UX — измеримые UX-события без изменения рабочих данных.
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

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #300. Один раз проверь ручные gates. Если они не изменились, не повторяй action-first цепочку, SPN rework, документный цикл юриста, completion evidence и manager confirmed results. Начни мобильный first-screen slice: на dashboard, списке сделок, карточке и manager page оставь одно главное действие и не более 2–3 контекстных кнопок на ширине 360–430 px, сохрани desktop UX и role-aware ограничения. Добавь semantic/static/public mobile regressions. Не меняй рабочие данные и не создавай платную Supabase branch без точного approval #282. Заверши branch → PR → CI → merge → post-merge smoke → handoff.`
