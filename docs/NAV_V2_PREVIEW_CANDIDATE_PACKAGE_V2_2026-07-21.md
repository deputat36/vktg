# Navigator v2 — Preview Candidate Package v2

Дата исходного package: 21 июля 2026 года. Последняя read-only attestation refresh: 21 июля 2026 года, `13:19:29 UTC`.

## Package v2

Статус: repository-only review package. Не является migration, deployment bundle или разрешением на создание Supabase branch.

Production remains unchanged.

- production database не менялась;
- preview branch не создавалась;
- cost confirmation не выполнялся;
- технические пользователи не создавались;
- Edge Function не деплоилась;
- Auth, RLS и grants не менялись;
- production data и `leader_*` не изменялись;
- `preview_apply_allowed=false`;
- `deployment_bundle_ready=false`;
- `production_rollback_bundle_ready=false`.

## Consolidated bounded link

Package v1 хранил `bounded_core` и `bounded_dto` как независимые rehearsal-сегменты. PR #430 доказал единый consolidated bounded candidate без повторного применения базовых sources.

Package v2 использует:

- `01-bounded-consolidated-forward.sql`;
- `01-bounded-consolidated-rollback.sql`;
- `bounded-consolidated-index.json`.

Точный forward order:

1. bounded task contract;
2. governed task mutations;
3. actor-aware overloads;
4. explicit privacy lite DTO;
5. bounded DTO overlay.

Точный rollback order:

1. bounded DTO rollback;
2. actor-aware rollback;
3. mutation rollback;
4. base contract rollback.

Позднее PR #433 отдельно доказал общий lifecycle `quality → bounded → intake`. Package v2 сохраняет своё исходное fail-closed состояние, а актуальная execution orchestration находится в package v3.

## Component inventory

Package v2 связывает:

1. privacy-aligned quality;
2. consolidated bounded tasks;
3. governed intake с полным 25-rule mapper;
4. Edge candidate с feature flag `false`.

Каждый SQL artifact сохраняет SHA-256, byte size, exact source order и `production_executable=false`.

## Read-only preflight

`tests/sql/nav_v2_preview_readonly_preflight_v1.sql` выполняет aggregate-only чтение внутри `begin transaction read only` и заканчивается `rollback`.

Проверяются:

- PostgreSQL version;
- overall remote migration boundary;
- Navigator migration boundary;
- отсутствие bounded task columns;
- отсутствие mutation event table;
- отсутствие governed intake ledger и mapper;
- отсутствие actor-aware RPC;
- отсутствие `nav-e2e` Auth users и profiles;
- агрегированные статусы legacy tasks.

Запрос не возвращает ФИО, email, телефоны, адреса, UUID пользователей или клиентские данные.

Captured snapshot:

- project: `ofewxuqfjhamgerwzull`;
- status: `ACTIVE_HEALTHY`;
- PostgreSQL: `17.6.1.121`;
- branches: только production `main`;
- preview branches: `0`;
- technical Auth users: `0`;
- technical profiles: `0`;
- candidate DB objects: `0`;
- tasks: `88 open`, `10 cancelled`, `0 in_progress`, `0 done`;
- Edge `nav-v2-deal-api`: v4, ACTIVE, JWT required;
- Edge hash: `b64e3fdbc2fa22ccb4998e69232e4351308f1d9b0a7c3c2bec7093186d3e4095`.

Snapshot не является execution authorization и повторяется непосредственно перед любым gated cloud action.

## Migration boundary drift

Read-only evidence разделяет две границы:

- latest Navigator migration: `20260716063401_nav_v2_correct_mortgage_broker_scope`;
- latest overall remote migration: `20260721122333_revoke_anon_execute_leader_internal_rpcs`.

`config/nav-v2-release-baseline.json` содержит `20260715203158`.

Новая overall migration относится к `leader_*`. Package v2 не обновляет release baseline автоматически и не получает права изменять или нормализовать историю другого модуля.

Зафиксировано:

- Navigator boundary подтверждена и не изменилась;
- overall release baseline drift существует;
- latest remote migration явно non-Navigator;
- `release_baseline_refresh_allowed=false`;
- drift остаётся active stop до source reconciliation владельцем соответствующего модуля.

## Temporary package index

Assembler:

`scripts/assemble-nav-v2-preview-candidate-package-v2.mjs`

Он принимает deterministic preview bundle и consolidated bounded directory, а создаёт во временном каталоге только `preview-candidate-package-v2-index.json`.

Index содержит:

- hashes upstream indexes;
- exact SQL artifact hashes и source order;
- Edge file set hashes;
- read-only preflight hash;
- captured attestation hash;
- migration boundary state;
- active stops;
- fail-closed readiness flags.

Generated SQL не копируется в package output или `supabase/migrations`. CI собирает index дважды и требует побайтного совпадения.

## Edge boundary

Candidate entrypoint:

`supabase/functions/nav-v2-deal-api/index.ts`

Обязательное состояние:

`const BOUNDED_TASK_EDGE_IDENTITY_ENABLED = false;`

Production snapshot:

`supabase/functions/nav-v2-deal-api/index.production-v4.ts`

Проверяется неизменность live v4 hash, JWT requirement и отсутствие candidate route в production snapshot. Deploy запрещён.

## Active stops

Package v2 остаётся fail-closed:

- release baseline migration drift не reconciled;
- preview branch отсутствует;
- explicit cost approval отсутствует;
- cost confirmation id отсутствует;
- technical accounts отсутствуют;
- authenticated role matrix не выполнена;
- Edge feature flag выключен;
- Edge candidate не deployed;
- minimal grants не applied;
- preview apply не approved;
- production deployment не approved;
- controlled pilot не approved;
- cleanup option не выбран.

Исторический флаг `cross_component_sequential_apply_not_proven` в package v2 закрыт отдельным package v3 evidence, но не переписывается как разрешение на cloud execution.

## Rollback

Repository rollback этой attestation refresh означает возврат package v2 config, snapshot, validator и документа к предыдущей captured boundary.

Production rollback не требуется: production Supabase, Auth, RLS, grants, Edge Functions и rows не менялись.

## Текущая точка продолжения

Актуальная orchestration описана в:

- `config/nav-v2-preview-candidate-package-v3.json`;
- `config/nav-v2-preview-execution-runbook-v1.json`;
- `docs/NAV_V2_WORK_HANDOFF_LATEST.md`.

Следующий cloud шаг всё ещё запрещён без отдельного owner/cost/Auth approval по issue #282.
