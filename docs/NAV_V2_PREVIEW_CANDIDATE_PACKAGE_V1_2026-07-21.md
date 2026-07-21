# Navigator v2 — preview candidate package v1

Дата: 21 июля 2026 года.

## Статус

Review candidate, not executable deployment.

Пакет делает существующие rehearsal-артефакты обозримыми как единый review contract, но не превращает их в migration bundle и не разрешает применение в Supabase.

Зафиксировано:

- `review_candidate_ready=true`;
- `preview_apply_allowed=false`;
- `preview_branch_created=false`;
- `deployment_bundle_ready=false`;
- `production_rollback_bundle_ready=false`;
- `edge_deployed=false`;
- `production_applied=false`.

## Зачем нужен пакет

CI-only assembler уже доказывает каждый SQL-сегмент отдельно. До этого не было отдельного артефакта, который:

- связывает forward и rollback по именам;
- связывает каждый сегмент с preflight и post-apply assertions;
- фиксирует exact hash policy через `bundle-index.json`;
- показывает, какие rehearsal-артефакты нельзя применять последовательно;
- описывает Minimal grants candidate;
- фиксирует Edge file set;
- перечисляет обязательные Active stops.

Новый package contract не скрывает разрыв между «rehearsal проходит» и «preview deployment разрешён».

## Состав

Канонический файл:

`config/nav-v2-preview-candidate-package-v1.json`

Он ссылается на:

- `config/nav-v2-preview-bundle-assembler-v1.json`;
- `config/nav-v2-preview-deployment-bundle-manifest-v1.json`;
- `config/nav-v2-preview-minimal-grants-candidate-v1.json`;
- deterministic `bundle-index.json`, создаваемый только во временном каталоге CI.

## Сегменты

### Quality

- forward: `01-quality-forward.sql`;
- rollback: `01-quality-rehearsal-rollback.sql`;
- отдельный synthetic setup;
- post-apply assertions;
- самостоятельный apply/assert/rollback rehearsal.

### Bounded core

- forward: `02-bounded-core-forward.sql`;
- rollback: `02-bounded-core-rehearsal-rollback.sql`;
- task contract;
- governed mutations;
- actor-aware overloads;
- service-role-only actor transport.

### Bounded DTO

- forward: `03-bounded-dto-forward.sql`;
- rollback: `03-bounded-dto-rehearsal-rollback.sql`;
- explicit privacy DTO;
- contract-aware task fields;
- role and permission assertions.

### Intake

- forward: `04-intake-forward.sql`;
- rollback: `04-intake-rehearsal-rollback.sql`;
- rendered canonical adapter;
- governed save boundary;
- production-like mapping;
- wave1, wave2 и special semantics;
- final effective catalog 25/0.

## Bounded overlap

`bounded_core` и `bounded_dto` являются независимыми harness-артефактами.

Они повторяют:

- `nav_v2_bounded_task_contract.sql`;
- `nav_v2_bounded_task_mutations.sql`.

Поэтому их запрещено применять последовательно как deployment.

Перед любым preview apply требуется отдельный consolidated bounded forward:

1. bounded task contract;
2. bounded mutations;
3. actor-aware mutations;
4. explicit lite DTO;
5. bounded task DTO overlay.

И отдельный consolidated rollback в обратном порядке.

В v1:

- consolidated forward не создан;
- consolidated rollback не создан;
- preview apply заблокирован.

## Exact hashes

Candidate package не хранит вручную скопированные hashes, которые быстро устаревают.

Политика:

1. deterministic assembler создаёт bundle во временном каталоге;
2. `bundle-index.json` содержит exact SHA-256, byte size и source order;
3. semantic validator повторно читает каждый файл;
4. пересчитывает artifact SHA-256;
5. пересчитывает source SHA-256;
6. сравнивает exact source order с assembler contract;
7. создаёт `candidate-package-report.json`.

Generated SQL не коммитится и не попадает в `supabase/migrations`.

## Minimal grants candidate

`config/nav-v2-preview-minimal-grants-candidate-v1.json` фиксирует review-only policy:

- private actor helpers недоступны `public`, `anon`, `authenticated`;
- actor-aware RPC overloads недоступны `public`, `anon`, `authenticated`;
- actor-aware RPC доступны только `service_role`;
- legacy `nav_v2_update_task_status` не меняется;
- caller surface `nav_v2_get_deal_card_lite` не меняется до authenticated E2E;
- service-role key запрещён во frontend;
- actor id запрещено принимать из client action payload.

Validator сверяет policy с фактическими `revoke` и `grant` в actor-aware SQL source.

Никакие grants не применяются.

## Edge file set

Candidate Edge set:

- `supabase/functions/nav-v2-deal-api/index.ts`;
- `task-action-contract-v2.js`;
- `task-action-edge-identity-v2.js`;
- `task-action-edge-runtime-v2.js`.

Production snapshot:

- `supabase/functions/nav-v2-deal-api/index.production-v4.ts`.

Проверяется:

- candidate flag остаётся `false`;
- candidate route source-integrated;
- production snapshot не содержит candidate route;
- `verify_jwt` обязателен;
- deploy не разрешён;
- hashes всех Edge files входят в validation report.

## Active stops

Обязательными остаются:

- bounded full forward не консолидирован;
- bounded full rollback не консолидирован;
- preview branch отсутствует;
- explicit cost approval отсутствует;
- technical account lifecycle не выполнен;
- authenticated role matrix не запущена;
- Edge feature flag выключен;
- Edge не деплоился;
- minimal grants не применялись;
- preview apply не утверждён;
- production deployment не утверждён;
- cleanup option не выбран.

## CI

Workflow:

`.github/workflows/nav-v2-preview-candidate-package-v1.yml`

Он:

- проверяет source contract;
- компилирует Python checker;
- проверяет Node syntax;
- запускает deterministic assembler во временный каталог;
- проверяет exact hashes и source order;
- создаёт `candidate-package-report.json`;
- доказывает отсутствие generated migration;
- загружает только review evidence.

Изменение assembler config также запускает существующий PostgreSQL 17 matrix для quality, bounded core, bounded DTO и intake.

## Rollback

Repository rollback:

- удалить candidate package config;
- удалить minimal grants candidate;
- удалить новые validators/workflow/doc;
- вернуть assembler active stops.

Production rollback отсутствует, потому что:

- Supabase branch не создавалась;
- migration не применялась;
- Edge не деплоился;
- Auth/RLS/grants не менялись;
- production rows не изменялись.

## Следующий шаг

Следующий безопасный slice после v1:

- создать consolidated bounded forward/rollback как отдельные temporary candidate artifacts;
- доказать их apply/assert/rollback на PostgreSQL 17;
- не применять в Supabase;
- не менять deployment readiness до authenticated E2E и owner approvals.
