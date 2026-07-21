# Navigator v2 — Preview Execution Package v3

Дата: 21 июля 2026 года.

## Package v3

Package v3 закрывает оставшиеся repository-only пробелы между доказанными SQL-кандидатами и будущим authenticated preview E2E.

Он не создаёт Supabase branch и не разрешает cloud execution.

Production remains unchanged.

- cost confirmation не выполнялся;
- preview branch не создавалась;
- SQL не применялся;
- Edge Function не деплоилась;
- технические аккаунты не создавались;
- Auth, RLS и grants не менялись;
- frontend bounded transport не включался;
- production data и `leader_*` не менялись;
- `preview_apply_allowed=false`;
- `production_ready=false`;
- `deployment_bundle_ready=false`;
- `production_rollback_bundle_ready=false`.

## Combined proof

PR #433 доказал единый PostgreSQL 17 lifecycle:

`privacy quality → consolidated bounded tasks → governed intake 25-rule mapper`

Подтверждены:

- forward order без duplicate sources;
- отсутствие неожиданных object/function collisions;
- quality apply и assertions;
- actor-aware bounded lifecycle;
- privacy-safe contract-aware DTO;
- governed intake ledger;
- полный 25-rule mapper;
- cross-component assertions;
- combined-safe intake rollback;
- bounded rollback;
- exact quality restoration;
- post-rollback отсутствие candidate objects;
- сохранность legacy task.

Канонический proof run: `29831435000`.

Финальный head PR #433 повторно прошёл combined lifecycle в run `29831895791`.

Package v3 фиксирует:

- `combined_apply_proven=true`;
- `combined_rollback_proven=true`;
- `exact_preview_rollback_inventory_complete=true`.

## Exact rollback

Database forward order:

1. privacy-aligned quality;
2. consolidated bounded tasks;
3. governed intake с полным 25-rule mapper.

Rollback order:

1. combined-safe intake cleanup;
2. bounded consolidated rollback;
3. quality exact restore.

Standalone intake rollback не используется, потому что он владеет и удаляет общие schemas и roles. Combined-safe chain сохраняет quality snapshot и bounded objects до их собственных rollback-этапов.

## Execution runbook

`config/nav-v2-preview-execution-runbook-v1.json` задаёт точный будущий порядок:

0. execution-time read-only preflight;
1. cost-gated создание preview branch;
2. database-first apply;
3. Edge deploy с feature flag `false`;
4. создание synthetic technical accounts только в preview;
5. authenticated role/mutation E2E;
6. обязательный cleanup и удаление branch.

Branch lifetime ограничен шестью часами.

Runbook останавливает выполнение при:

- migration/hash drift;
- неожиданном DB object;
- ошибке grants;
- неверном Edge hash/JWT/feature flag;
- role matrix failure;
- privacy exposure;
- rollback failure;
- cleanup attestation failure;
- приближении deadline удаления branch.

Runbook остаётся `execution_authorized=false`.

## Technical accounts

`config/nav-v2-preview-technical-account-lifecycle-v1.json` описывает только будущие synthetic identities.

Обязательные роли:

- admin;
- manager;
- seller SPN;
- buyer SPN;
- lawyer;
- mortgage broker;
- inactive viewer для negative-path проверки.

Owner остаётся отдельным optional opt-in.

Ограничения:

- реальные сотрудники не используются;
- production Auth не меняется;
- существующие пользователи не переиспользуются;
- приглашения на реальные или внешние email не отправляются;
- пароли и токены не коммитятся;
- credentials существуют только во время execution;
- production data не копируется.

Cleanup обязателен в порядке:

1. удалить synthetic deals и связанные rows;
2. удалить preview profiles;
3. удалить preview Auth users;
4. подтвердить ноль `nav-e2e` accounts;
5. удалить preview branch.

## Repository blockers closed

Package v3 закрывает как repository evidence:

- bounded candidate не был консолидирован;
- sequential quality/bounded/intake apply не был доказан;
- exact preview rollback inventory отсутствовал;
- preview execution runbook отсутствовал;
- technical account lifecycle plan отсутствовал.

Это не закрывает owner/cost/Auth execution gates.

## Active stops

Остаются обязательными:

- execution не авторизован;
- explicit cost approval отсутствует;
- cost confirmation id отсутствует;
- preview branch отсутствует;
- execution-time attestation не обновлена;
- технические аккаунты не созданы;
- authenticated role matrix не выполнена;
- Edge candidate не deployed;
- frontend bounded transport выключен;
- release baseline migration drift не reconciled;
- production deployment не approved;
- controlled pilot не approved;
- cleanup option не выбран.

## Next gated action

Следующее действие уже не является полностью бесплатным repository-only шагом.

Для создания Supabase preview branch необходимо отдельное явное решение владельца:

- выбрать `authenticated_e2e_only`;
- повторно проверить стоимость branch;
- явно подтвердить стоимость;
- получить `cost_confirmation_id`;
- разрешить создание только synthetic technical accounts;
- установить automatic delete deadline не более шести часов.

Generic команда `продолжай` не является таким разрешением.

До этого разрешены только read-only проверки drift и поддержание package/runbook в актуальном состоянии.

## Rollback

Repository rollback:

- удалить package v3 config;
- удалить execution runbook config;
- удалить technical account lifecycle config;
- удалить checker и workflow;
- удалить этот документ.

Production rollback не требуется: production Supabase не менялся.
