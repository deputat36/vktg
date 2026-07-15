# Navigator v2 — техническое приложение

Дата: 15 июля 2026 года

## Проверенная база

- `main`: `bbb82b51adb59b0235824a221e6fa5668103be58`, после PR #329;
- production Supabase: `ofewxuqfjhamgerwzull`;
- статус: `ACTIVE_HEALTHY`;
- регион: `eu-west-1`;
- PostgreSQL 17.6;
- development branches отсутствуют;
- последняя migration: `20260714125054_nav_v2_exact_duplicate_review_pack`;
- production в рамках аудита не изменялся.

## Frontend

Module budgets достигли 18 entry modules для SPN wizard и 19 для deal card. Бюджет защищает от дальнейшего роста, но показывает предел текущей архитектуры.

Сильные стороны мастера СПН:

- адаптивный маршрут;
- условные шаги продавца, покупателя, денег, задатка и условий;
- readiness и risk summary;
- duplicate/idempotency/save guards.

Проблемы:

- несколько модулей читают один localStorage draft;
- DOM патчится после основного render;
- используются MutationObserver, intervals и глобальные listeners;
- поведение зависит от порядка enhancements;
- cache-bust markers попали в static contracts.

Цель: один store, один renderer, declarative step registry, pure routing/validation и минимум observers.

## Черновик сделки

`nav_deal_draft_v2` хранится в localStorage и может включать контакты, адрес, сведения о детях и свободный текст.

Нужны:

- schema version;
- created/updated timestamps;
- TTL;
- очистка после successful save и logout;
- явная кнопка удаления;
- минимизация free text;
- отдельное решение о допустимости хранения персональных данных на клиенте.

## Production data

- deals: 23;
- tasks: 98;
- risks: 53;
- documents: 198;
- comments: 0;
- reviews: 0;
- events: 118.

Сигналы качества:

- 92 задачи открыты, 86 просрочены, 0 выполнены;
- все 53 риска открыты и блокируют процесс;
- 182 документа ещё нужны, 125 просрочены;
- 57 документов не назначены;
- `task_type` пуст у всех 98 задач;
- 18 сделок без manager_id;
- 16 сделок требуют неназначенного юриста;
- 5 сделок требуют неназначенного брокера.

Вывод: автоматическая генерация контроля опережает его завершение.

## Profiles и ответственность

Production profiles:

- owner: 1;
- lawyer: 1;
- SPN: 3;
- manager: 0;
- broker: 0;
- один активный СПН без manager_id;
- 8 Auth users, 3 без Navigator profile.

Нужно определить manager ownership, замещение, передачу сделок, назначение юриста/брокера и правила для исторических строк.

## RLS и RPC

Положительное:

- RLS включён;
- anon execute для Navigator RPC закрыт;
- private access helpers;
- self-escalation profile guard;
- active SPN manager guard;
- status, duplicate и idempotency guards;
- RPC surface registry и health checks.

Риски:

- authenticated имеет широкие direct table grants;
- Security Advisor видит большой public SECURITY DEFINER surface;
- legacy functions остаются в public schema;
- grant hardening нельзя делать без authenticated mutation matrix.

Legacy-кандидаты для отдельной проверки:

- `nav_can_create_deal`;
- `nav_can_edit_deal`;
- `nav_can_view_deal`;
- `nav_current_role`;
- `nav_is_admin`.

## Edge Functions и Auth

`nav-invite-user` использует JWT и server-side owner/admin gate. Замечания:

- CORS origin `*`;
- invite/recovery E2E не подтверждён;
- user_metadata не должен использоваться как источник авторизации;
- action link требует аккуратного доступа и журналирования.

`nav-v2-deal-api` активна и требует JWT, но deployed source connector получить не смог.

Leaked-password protection отключён.

## API logs

Видны ожидаемые 401/404 от public/internal smoke и успешные реальные RPC. Одновременно выполняются повторные вызовы profile/deal card/status.

Рекомендации:

- page-level load coordinator;
- de-duplication запросов;
- reuse loaded payload;
- отмена устаревших запросов;
- trace id без персональных данных;
- запрет контактов в URL.

## CI

PR #329 имеет зелёные static, JavaScript, BAZA, SPN rework, lawyer document, action focus, mobile, completion, document dialog, form, action dialog, lawyer handoff dialog, keyboard, screen structure и privacy checks.

Новый lawyer handoff dialog улучшает review незакрытых пунктов перед передачей юристу и сохраняет frontend-only границу.

Но `authenticated-smoke` внутри общего workflow пропущен. Green workflow не подтверждает реальные JWT/RLS/mutation flows для ролей.

Текущее количество узких workflow слишком велико. Цель:

1. static/security/architecture;
2. pure models;
3. public browser;
4. authenticated role/mutation matrix;
5. migration/schema;
6. production read-only smoke;
7. deploy.

## GitHub Pages

Deploy загружает `path: .`, то есть весь репозиторий. Следует публиковать только подготовленный public artifact.

Actions используют major tags. Для строгого supply-chain контроля рекомендуется pin на commit SHA и controlled updates.

## Rules engine

Словари покрывают значительно больше сценариев, чем formal `rules.json`, где только восемь stop-rules. Логика распределена между JS, JSON hints и SQL.

Нужен единый versioned registry с owner, source, reviewed_at, trigger facts, severity, blocking scope, evidence и resolution action.

## Технический приоритет

1. authenticated role/mutation matrix;
2. PII draft lifecycle;
3. task taxonomy и closure;
4. backlog deduplication и waiver states;
5. manager responsibility repair;
6. SPN lifecycle consolidation;
7. RPC/grants hardening;
8. CI consolidation;
9. public artifact build;
10. отдельная data boundary для Navigator.
