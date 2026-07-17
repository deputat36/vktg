# Navigator v2 — authenticated E2E readiness package

Дата: 17 июля 2026 года.

Статус: repository-only readiness package. Облачная ветка, технические аккаунты и authenticated browser run не созданы.

## Цель

Подготовить однозначный пакет для будущего настоящего authenticated E2E, чтобы после отдельного cost approval не определять роли, secrets, synthetic fixtures и evidence вручную.

Этот пакет не является authenticated E2E и не разрешает платные действия.

## Уже закрытые repository proofs

- PR #381 — cost-free mocked role matrix;
- PR #384 — bounded database apply/rollback readiness;
- PR #387 — identity conflict и verified actor candidate;
- PR #389 — actor-aware SQL lifecycle/replay/audit/rollback;
- PR #390 — migration storyboard v2;
- PR #391 — exact detached Edge-to-SQL parameter parity.

Эти проверки не доказывают реальный Auth login, JWT, RLS, deployed Edge или production authorization.

## Cost gate

Issue #282 остаётся обязательным.

Историческая цена branch от 14 июля 2026 года не является актуальной для запуска. Перед созданием disposable branch необходимо:

1. повторно запросить текущую стоимость;
2. показать её владельцу;
3. получить явное подтверждение;
4. получить одноразовый cost confirmation ID;
5. использовать confirmation только для согласованной branch;
6. назначить ответственного за немедленное удаление.

Generic-команда «продолжай» не является cost approval.

## Обязательные роли

Технические аккаунты:

- admin;
- manager;
- spn;
- lawyer;
- broker;
- viewer.

Owner необязателен и требует отдельного opt-in.

SPN должен иметь synthetic manager. Используются только email с префиксом `nav-e2e` и profile names с префиксом `[NAV E2E]`.

## GitHub Environment

Environment: `navigator-e2e`.

### Variables

- `NAV_E2E_SUPABASE_URL`;
- `NAV_E2E_SUPABASE_PROJECT_REF`;
- `NAV_E2E_SPN_ALLOWED_DEAL_ID`;
- `NAV_E2E_SPN_FORBIDDEN_DEAL_ID`.

Project ref обязан отличаться от production `ofewxuqfjhamgerwzull`.

### Secrets

- `NAV_E2E_SUPABASE_PUBLISHABLE_KEY`;
- email/password для admin;
- email/password для manager;
- email/password для spn;
- email/password для lawyer;
- email/password для broker;
- email/password для viewer.

### Запрещено

- production URL/project ref;
- service-role key;
- database password;
- Supabase access token;
- access/refresh token пользователя;
- реальные credentials сотрудников.

Browser workflow использует только publishable key и technical account credentials.

## Synthetic data

Минимум две сделки:

1. allowed deal, назначенный technical SPN и его manager;
2. forbidden deal, недоступный тому же SPN.

Нужны synthetic entities:

- legacy task;
- document request bounded task;
- legal decision bounded task;
- mortgage financial bounded task;
- appointment bounded task;
- evidence source entity;
- terminal proposal task;
- synthetic documents/risks только для permission visibility.

Запрещены реальные клиенты, адреса, телефоны, документы, комментарии и сделки.

## Role matrix

### Admin

- видит synthetic deal;
- подтверждает terminal outcome;
- verified actor проходит до audit event;
- client actor spoof отклоняется.

### Manager

- видит deal своей synthetic команды;
- подтверждает terminal outcome;
- unrelated team deal недоступен.

### SPN

- создаёт selected bounded tasks на allowed deal;
- завершает document task только с evidence;
- forbidden deal не читается и не мутируется;
- отсутствие evidence отклоняется.

### Lawyer

- работает только с назначенной legal task;
- предлагает terminal outcome;
- не может самостоятельно принять manager-only terminal decision.

### Broker

- работает с назначенной mortgage financial task;
- broker actor сохраняется в audit;
- маткапитал без ипотеки не маршрутизируется брокеру.

### Viewer

- получает только read-only view;
- все task mutations отклоняются;
- audit event не создаётся.

### Cross-actor replay

Manager или другой actor не может повторно использовать `client_request_id`, созданный SPN. Новый task/event не создаётся.

## Identity chain

Для каждой успешной mutation доказать:

1. Auth user ID получен после реального login;
2. Edge verified actor равен Auth user ID;
3. client payload не содержит actor fields;
4. actor-aware RPC получает тот же `p_actor_id`;
5. task actor field совпадает, когда применимо;
6. audit `actor_id` совпадает;
7. audit `actor_role` совпадает с profile role;
8. один `client_request_id` создаёт один audit event;
9. response и browser artifacts не содержат service secret.

Достаточно только итоговых IDs/roles и synthetic references. Пароли, JWT и ключи в artifacts не сохраняются.

## STOP conditions

Остановить подготовку или run, если:

- стоимость не перепроверена;
- явное cost approval отсутствует;
- branch project ref равен production;
- обнаружена копия production data;
- отсутствует обязательная роль;
- environment неполон;
- найден запрещённый secret;
- technical identity не соответствует prefix policy;
- identity chain не совпадает;
- service-role key доступен browser workflow;
- branch живёт шесть часов;
- cleanup не подтверждается.

Cleanup failure — P0. До его закрытия новую branch не создавать.

## Evidence package

Обязательные материалы:

- свежий cost snapshot и approval timestamp;
- confirmation ID без secret content;
- branch ID и non-production project ref;
- creation/deletion timestamps;
- synthetic fixture manifest;
- role-by-role PASS/FAIL;
- identity-chain result по успешным mutations;
- negative authorization results;
- workflow URL;
- traces/screenshots/videos при failure;
- финальное подтверждение удаления branch;
- ноль оставшихся technical Auth users и active profiles.

## Текущее состояние

- repository readiness package: готов;
- свежая стоимость: отсутствует;
- explicit cost approval: отсутствует;
- disposable branch: отсутствует;
- technical accounts: отсутствуют;
- GitHub Environment evidence: отсутствует;
- production database migration: не разрешена;
- Edge deployment: отсутствует;
- authenticated E2E: не выполнен;
- cleanup evidence: отсутствует.

## Следующий разрешённый шаг

Без cost approval разрешено только поддерживать этот contract, fixtures и static CI.

После явного approval разрешается выполнить последовательность из `NAV_V2_AUTH_E2E_TARGET_RUNBOOK.md`. Создание branch, production migration и Edge deployment остаются разными решениями.

## Rollback

Repository rollback:

- удалить readiness contract;
- удалить role matrix fixture;
- удалить semantic/source checkers и workflow;
- удалить этот документ.

Production rollback не требуется: production state не меняется.
