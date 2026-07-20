# Navigator v2 — deployment decision package v1

Дата: 20 июля 2026 года.

## Текущее состояние

Repository-only structural work завершён:

- versioned catalog: 25 supported / 0 unsupported;
- governed PostgreSQL 17 lifecycle: доказан;
- exact production-like schema: доказана на 25 fixtures;
- privacy-aligned quality replacement: доказан в repository;
- legacy quality cleanup planner: доказан, но owner option не выбран;
- actor identity и bounded tasks: доказаны в repository.

Это не deployment readiness. Production остаётся на legacy runtime.

## Owner options

### authenticated_e2e_only — рекомендованный следующий шаг

Создать только disposable non-production branch, synthetic Auth users и data. Выполнить role matrix, rollback и удалить branch. Этот вариант не разрешает production merge.

Перед созданием branch обязательны новый cost lookup и явное подтверждение стоимости владельцем. Snapshot из issue #282 устарел для исполнения.

### staged_production_pilot_after_e2e

Допускается только после успешного authenticated E2E и отдельного deployment approval. Cleanup не выполняется автоматически.

### remain_repository_only

Оставить production без изменений и не создавать платную ветку.

`selected_deployment_option=null`.

## Ordered rollout

0. Read-only preflight: main SHA, production counts, absence prototype objects, migration head.
1. Current cost lookup и explicit owner approval с шестичасовым ceiling.
2. Disposable non-production branch без production data.
3. Branch-only ordered migration/Edge bundle, transport flag выключен, rollback scripts готовы.
4. Synthetic roles: admin, manager, SPN, lawyer, broker, viewer; owner — только opt-in.
5. Authenticated matrix: allowed/forbidden deals, broker mortgage-only, viewer read-only, cross-actor replay rejection, identity chain.
6. Полный rollback, удаление branch и проверка его отсутствия.
7. Отдельное production decision с новой attestation.
8. Controlled production pilot только после approval.
9. Optional legacy cleanup только после live privacy replacement и отдельного owner cleanup approval.

## Production order после будущего approval

1. Privacy-aligned quality replacement.
2. Bounded task contract и actor identity.
3. Governed intake ledger и full 25-rule mapper.
4. Edge identity/action routes.
5. Frontend transport с выключенным по умолчанию feature flag и ограниченным pilot.
6. Optional owner-approved legacy cleanup.

## Mandatory STOP

Работу нельзя переводить к production, пока отсутствует хотя бы одно:

- выбранный deployment option;
- current branch cost;
- explicit cost approval;
- готовый deployment bundle;
- authenticated E2E evidence;
- отдельное production deployment approval;
- pilot scope;
- rollback attestation.

Cleanup дополнительно требует `selected_cleanup_option` и отдельное approval.

## Границы пакета

Пакет:

- не вызывает Supabase cost API;
- не создаёт branch;
- не создаёт technical accounts;
- не добавляет migration;
- не деплоит Edge;
- не меняет Auth/RLS/grants;
- не включает frontend transport;
- не закрывает legacy tasks;
- не выбирает решение за владельца.
