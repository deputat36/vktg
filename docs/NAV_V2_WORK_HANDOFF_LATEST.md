# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 2026-07-16.
- Репозиторий: `deputat36/vktg`.
- Текущий `main`: `0a4d15189be6522e6542a754f0643f4b6c37cda2` — merge PR #342.
- Supabase project: `ofewxuqfjhamgerwzull`.
- Последний подтверждённый статус проекта: `ACTIVE_HEALTHY`.
- Последняя подтверждённая production migration: `20260715203158_nav_v2_minimize_client_identifiers`.
- Канонический fresh-install source: `20260715224500_nav_v2_minimize_client_identifiers.sql`.
- Edge Functions в последних privacy-волнах не менялись.
- Открытых PR после merge #342 не было до подготовки этого handoff.

## Что завершено после полного аудита

### PR #333 — автономный план исполнения

- зафиксированы волны развития, допустимая автономия и ручные gates;
- основной процесс сформулирован как `факт → требование → действие → ответственный → результат → подтверждение → переход сделки`;
- production cleanup, роли, платные ресурсы и юридические решения оставлены за владельцем.

### PR #334 — task permission/action feedback

- первый клик ожидает permission snapshot и автоматически продолжает действие;
- отказ объясняет ответственную роль;
- task mutation использует существующий RPC и точный payload;
- busy/success/error отображаются через shared live feedback;
- completion и reopen проверены на desktop/mobile.

### PR #336–#337 — retirement роли viewer

- `viewer` убран из новых назначений в UI;
- активное назначение блокируется на границе таблицы и административных RPC;
- enum и legacy workspace сохранены только для совместимости;
- production migration: `20260715195732_nav_v2_retire_viewer_assignment`;
- активных viewer-профилей в production нет.

### PR #338–#339 — минимизация новых сделок

- мастер перестал собирать клиентские ФИО и телефоны;
- browser draft и wizard payload очищаются;
- публичный save wrapper минимизирует данные до legacy implementation;
- private legacy implementation недоступна authenticated;
- table trigger защищает INSERT и точечно изменяемые identity/JSON-поля;
- исторические строки не очищались;
- production migration: `20260715203158_nav_v2_minimize_client_identifiers`.

### PR #340 — защита свободного ввода

- локально распознаются явные email, российские телефоны, паспорт, СНИЛС и Luhn-valid номера карт;
- сохранение блокируется до исправления текста;
- суммы, даты, кадастровые ориентиры и рабочие числа не блокируются;
- ввод не передаётся внешним сервисам и не записывается в telemetry/storage.

### PR #341 — централизованная read-layer minimization

- каждый RPC-ответ минимизируется до кэширования, поиска и рендера;
- structured client identifiers удаляются рекурсивно;
- названия сделок заменяются нейтральной ссылкой: тип объекта, ориентир без квартиры/офиса и короткий код;
- вложенные `deal_title` / `dealTitle` нейтрализуются;
- ФИО и телефоны сотрудников, task/document/risk titles и рабочие факты сохраняются;
- префикс `ДЕМО:` сохраняется.

### PR #342 — historical free-text redaction

- явные чувствительные значения в существующих комментариях, заметках, описаниях, рекомендациях, следующих шагах и handoff маскируются при чтении;
- оригинальные строки в Supabase не обновляются и не удаляются;
- рабочие данные сотрудников, суммы, даты и объектные ориентиры сохраняются;
- произвольные ФИО в свободном тексте эвристически не маскируются, чтобы не скрывать имена сотрудников и не создавать ложные срабатывания.

## Последний production baseline

- Profiles: 5;
- Viewer profiles: 0;
- Deals: 23;
- Tasks: 98;
- Documents: 198;
- Risks: 53;
- production trigger `nav_v2_deals_guard_client_identifiers`: включён.

Counts могут изменяться от реальной работы пользователей. Не откатывать данные только из-за изменения counts.

## Проверки последних privacy-волн

Зелёные фактически выполненные проверки:

- основной static suite;
- общий JavaScript syntax;
- task action feedback;
- client data minimization semantic/source;
- sensitive free-text semantic/source;
- read-layer minimization semantic/source;
- desktop/mobile browser regressions;
- input guard regressions;
- public guest smoke;
- review threads: 0 перед merge.

`authenticated-smoke` завершался со статусом `skipped`. Это не authenticated evidence и не подтверждение полной ролевой матрицы.

## Ручные ограничения

- Issue #273: duplicate cleanup запрещён без решения владельца.
- Operational pilot mutation запрещена без полного evidence-пакета.
- Не менять `seller_spn_id`, `buyer_spn_id`, `manager_id` в рабочих строках без подтверждённого evidence и решения владельца.
- Исторические ФИО, телефоны и свободные тексты физически не очищать автоматически.
- Изолированную Supabase branch для authenticated E2E не создавать без отдельного явного согласования стоимости.
- Не считать пропущенный authenticated job доказательством безопасности ролей.
- Не менять production grants/RPC/Auth/Edge Functions в рамках следующего slice.
- Legacy decommission и удаление enum/экранов выполнять только отдельным решением.

## Следующий безопасный продуктовый slice

P1 privacy architecture — read-only инвентаризация серверных RPC-ответов и repository-only контракт server-side minimization.

Цель:

`RPC source → фактически возвращаемые поля → классификация данных → риск экспозиции → безопасный wrapper contract → порядок rollout`

Требования:

1. Проинвентаризировать высокочастотные read RPC:
   - `nav_v2_get_deals_list`;
   - `nav_v2_get_dashboard`;
   - `nav_v2_get_deal_card`;
   - `nav_v2_get_deal_card_lite`;
   - manager operational readiness;
   - lawyer queue/review summary;
   - broker queue;
   - operational reports и responsibility snapshots.
2. Для каждого JSON-поля указать одну категорию:
   - рабочий факт;
   - идентификатор сотрудника;
   - структурированный клиентский идентификатор;
   - чувствительный свободный текст;
   - технический идентификатор/permission metadata.
3. Не читать и не публиковать сами production-значения; использовать определения функций и агрегаты.
4. Подготовить машинно-читаемый registry и source-backed отчёт.
5. Добавить static/semantic проверку, которая запрещает нерегистрируемую выдачу клиентских identifier keys в ключевых read RPC.
6. Подготовить repository-only SQL/wrapper design без production deploy.
7. Не менять публичные RPC signatures, роли, grants и RLS в этом slice.
8. Предложить rollout order по уровню риска и зависимости экранов.
9. Production deploy возможен только после authenticated regression или отдельного решения владельца.

## После RPC-инвентаризации

- определить срок хранения browser draft и migration path для старых локальных drafts;
- подготовить агрегированный preview возможной исторической очистки без вывода значений;
- вернуться к authenticated role matrix при появлении одобренной изолированной среды;
- продолжить operational task lifecycle и pilot только в рамках существующих gates.

## Не повторять без новой причины

- общий аудит проекта;
- task permission/action feedback;
- retirement viewer assignment;
- сбор ФИО/телефонов в мастере;
- client input guard;
- frontend structured read-layer masking;
- historical free-text read masking;
- production cleanup без решения владельца.

## Команда следующего запуска

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #342. Начни read-only инвентаризацию серверных RPC-ответов и repository-only contract server-side minimization. Не выводи production-значения, не меняй signatures, roles, grants, RLS, Auth, Edge Functions или рабочие строки.`
