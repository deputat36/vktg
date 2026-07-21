# Navigator v2 — deployment decision package v1

Обновлено: 21 июля 2026 года.

## Текущее состояние

Repository-only structural work завершён:

- versioned catalog: 25 supported / 0 unsupported;
- governed PostgreSQL 17 lifecycle: доказан;
- exact production-like schema: доказана на 25 fixtures;
- privacy-aligned quality replacement: доказан в repository;
- legacy quality cleanup planner: доказан, но owner option не выбран;
- actor identity и bounded tasks: доказаны в repository;
- deterministic CI-only rehearsal bundle assembler: доказан;
- Edge identity/action runtime подключён в исходниках за выключенным feature flag.

Это не deployment readiness. Production остаётся на legacy runtime.

Текущее Edge состояние:

- `edge_runtime_source_integrated=true`;
- `edge_runtime_enabled=false`;
- `actor_aware_sql_deployed=false`;
- `edge_deployed=false`;
- `frontend_transport_enabled=false`.

## Актуальный cost snapshot

21 июля 2026 года через read-only Supabase cost lookup получена стоимость preview branch для организации проекта `Lider`:

- тип: branch;
- стоимость: `0.01344` в час;
- шестичасовой ceiling: `0.08064`;
- валюта connector-ответом не возвращена;
- план организации: free.

Этот snapshot пригоден только для решения владельца. Он не является согласием на расходы и не разрешает создание branch.

Текущее состояние:

- `branch_cost_rechecked=true`;
- `explicit_owner_cost_approval=false`;
- `cost_confirmation_id=null`;
- `branch_creation_allowed=false`.

Непосредственно перед `confirm_cost` и созданием branch стоимость нужно проверить повторно.

## Owner options

### authenticated_e2e_only — рекомендованный следующий шаг

Создать только disposable non-production branch, synthetic Auth users и data. Выполнить role matrix, rollback и удалить branch. Этот вариант не разрешает production merge.

Для выполнения требуется явный выбор этого варианта, повторная проверка стоимости непосредственно перед запуском и отдельное подтверждение расходов владельцем.

### staged_production_pilot_after_e2e

Допускается только после успешного authenticated E2E и отдельного deployment approval. Cleanup не выполняется автоматически.

### remain_repository_only

Оставить production без изменений и не создавать платную ветку.

`selected_deployment_option=null`.

## Ordered rollout

0. Read-only preflight: main SHA, production counts, absence prototype objects, migration head.
1. Current cost snapshot, explicit owner approval, execution-time cost recheck и `cost_confirmation_id`.
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
2. Bounded task contract и actor identity SQL.
3. Governed intake ledger и full 25-rule mapper.
4. Edge identity/action route deployment с JWT verification.
5. Frontend transport с выключенным по умолчанию feature flag и ограниченным pilot.
6. Optional owner-approved legacy cleanup.

## Mandatory STOP

Работу нельзя переводить к созданию preview branch, пока отсутствует хотя бы одно:

- выбранный deployment option;
- explicit cost approval;
- execution-time cost recheck;
- `cost_confirmation_id`;
- готовый deployment bundle;
- утверждённый срок автоматического удаления branch.

Даже source-integrated Edge route нельзя включать, пока отсутствует хотя бы одно:

- actor-aware SQL deployment;
- approved grants;
- Edge deployment attestation;
- authenticated role matrix;
- rollback evidence;
- frontend pilot approval.

Работу нельзя переводить к production, пока отсутствует хотя бы одно:

- authenticated E2E evidence;
- отдельное production deployment approval;
- pilot scope;
- rollback attestation.

Cleanup дополнительно требует `selected_cleanup_option` и отдельное approval.

## Границы пакета

Пакет:

- выполнил только read-only Supabase cost lookup;
- не вызывал `confirm_cost`;
- не создаёт branch;
- не создаёт technical accounts;
- не добавляет migration;
- не деплоит Edge;
- не включает Edge feature flag;
- не меняет Auth/RLS/grants;
- не включает frontend transport;
- не закрывает legacy tasks;
- не выбирает решение за владельца.
