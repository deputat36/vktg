# Navigator v2 — Preview Candidate Package v2

Дата: 21 июля 2026 года.

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

Package v2 использует только:

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

Consolidated PostgreSQL 17 lifecycle уже доказал apply, canonical assertions, actor identity, replay protection, DTO permissions, ALWAYS ROLLBACK и post-rollback cleanup.

## Component inventory

Package v2 связывает три SQL-компонента и Edge candidate:

1. privacy-aligned quality — existing deterministic rehearsal artifacts;
2. consolidated bounded tasks — validated consolidated artifacts;
3. governed intake с полным 25-rule mapper — existing deterministic rehearsal artifacts;
4. Edge candidate file set с feature flag `false`.

Каждый SQL artifact сохраняет:

- точный SHA-256;
- byte size;
- exact source order;
- ссылку на исходный upstream index;
- `production_executable=false`.

Последовательное применение quality → bounded → intake одной транзакционной цепочкой пока не доказано. Поэтому component inventory остаётся review-only.

## Read-only preflight

`tests/sql/nav_v2_preview_readonly_preflight_v1.sql` выполняет только aggregate-only чтение внутри `begin transaction read only`.

Он проверяет:

- PostgreSQL version;
- общую remote migration boundary;
- последнюю Navigator migration;
- отсутствие bounded task columns;
- отсутствие mutation event table;
- отсутствие governed intake ledger;
- отсутствие actor-aware RPC;
- отсутствие `nav-e2e` Auth users и profiles;
- агрегированные статусы legacy tasks.

Запрос не возвращает ФИО, email, телефоны, адреса, UUID пользователей или клиентские данные.

Captured snapshot:

- project: `ofewxuqfjhamgerwzull`;
- status: `ACTIVE_HEALTHY`;
- PostgreSQL: `17.6`;
- branches: только production `main`;
- preview branches: `0`;
- technical Auth users: `0`;
- technical profiles: `0`;
- candidate DB objects: `0`;
- tasks: `88 open`, `10 cancelled`, `0 in_progress`, `0 done`;
- Edge `nav-v2-deal-api`: v4, ACTIVE, JWT required;
- live Edge hash: `b64e3fdbc2fa22ccb4998e69232e4351308f1d9b0a7c3c2bec7093186d3e4095`.

Snapshot не является execution authorization. Его нужно повторить непосредственно перед любым gated cloud action.

## Migration boundary drift

Read-only Supabase evidence показывает две разные границы:

- latest Navigator migration: `20260716063401_nav_v2_correct_mortgage_broker_scope`;
- latest overall remote migration: `20260720201701_leader_public_lead_health_view_v1`.

`config/nav-v2-release-baseline.json` пока содержит `20260715203158`.

Package v2 не маскирует расхождение и не обновляет baseline автоматически, потому что более поздние migrations относятся к `leader_*`, а как минимум один remote source отсутствует в Navigator repository inventory.

Зафиксировано:

- Navigator boundary подтверждена;
- overall release baseline drift существует;
- `release_baseline_refresh_allowed=false`;
- Navigator не получает права изменять или нормализовать историю `leader_*`;
- drift остаётся active stop до отдельного source reconciliation владельцем соответствующего модуля.

## Temporary package index

Assembler:

`scripts/assemble-nav-v2-preview-candidate-package-v2.mjs`

Входы:

- deterministic preview bundle directory;
- consolidated bounded directory;
- caller-supplied output directory вне репозитория.

Выход:

`preview-candidate-package-v2-index.json`

Index содержит:

- hashes обоих upstream indexes;
- exact SQL artifact hashes и source order;
- Edge file set hashes;
- read-only preflight hash;
- captured attestation hash;
- migration boundary state;
- active stops;
- все fail-closed readiness flags.

Generated SQL не копируется в package output. В output находится только один JSON index.

CI собирает index дважды и требует побайтного совпадения.

## Edge boundary

Candidate entrypoint:

`supabase/functions/nav-v2-deal-api/index.ts`

Обязательное состояние:

`const BOUNDED_TASK_EDGE_IDENTITY_ENABLED = false;`

Production snapshot:

`supabase/functions/nav-v2-deal-api/index.production-v4.ts`

Проверяется:

- candidate route присутствует только в candidate entrypoint;
- production snapshot не содержит candidate route;
- JWT остаётся обязательным;
- live v4 hash соответствует read-only attestation;
- deploy запрещён.

## Active stops

После merge package v2 остаются:

- release baseline migration drift не reconciled;
- combined quality → bounded → intake lifecycle не доказан;
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

## Rollback

Repository rollback:

- удалить package v2 config;
- удалить read-only attestation snapshot;
- удалить read-only SQL preflight;
- удалить package assembler и validator;
- удалить package v2 workflow;
- удалить этот документ.

Production rollback не требуется: production Supabase, Auth, RLS, grants, Edge Functions и rows не менялись.

## Следующий безопасный шаг

После зелёного CI разрешено repository-only:

1. подготовить combined quality → bounded → intake PostgreSQL 17 lifecycle;
2. проверить общие object/function redefinitions между компонентами;
3. доказать единый ALWAYS ROLLBACK;
4. сохранить `preview_apply_allowed=false`;
5. не создавать Supabase branch без отдельного cost approval;
6. не исправлять `leader_*` migration drift в рамках Navigator.
