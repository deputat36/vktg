# Navigator v2 — identity addendum к bounded migration storyboard

Дата: 17 июля 2026 года.

Статус: repository-only. Production migration, Edge deployment и bounded transport не разрешены.

## Причина обновления

PR #387 доказал несовместимость исходного governed prototype:

- canonical SQL берёт actor через `auth.uid()`;
- governed RPC доступны только `service_role`;
- пользовательский JWT даёт actor identity, но роль `authenticated` не имеет EXECUTE;
- service-role transport имеет EXECUTE, но пользовательский `sub` не гарантирован.

PR #389 добавил repository-only actor-aware SQL overlay и закрыл техническую часть этого конфликта в PostgreSQL 17.

## PR #389: actor-aware SQL proof

Actor-aware overloads:

- сохраняют прежние RPC names;
- добавляют обязательный `p_actor_id`;
- доступны только `service_role`;
- подтверждают активный Navigator profile;
- привязывают idempotent replay к verified actor;
- локально устанавливают actor claim;
- вызывают canonical lifecycle и authorization;
- восстанавливают предыдущий claim при успехе и ошибке;
- сохраняют actor в task fields и audit events.

PostgreSQL 17 regression подтвердил:

- полный canonical lifecycle не сломан;
- работают create/start/complete/active/propose/decide overloads;
- same-actor replay не создаёт дубли;
- cross-actor replay отклоняется;
- unrelated и inactive actors отклоняются;
- overlay rollback сохраняет canonical RPC и данные.

Merge PR #389: `5d63d490ad8f210e10cea59e0f9f14863e72b0de`.

## Actor-aware SQL и Production boundary

Repository contract теперь существует, но production Supabase не изменён:

- bounded columns отсутствуют;
- mutation event table отсутствует;
- canonical governed RPC отсутствуют;
- actor-aware overloads отсутствуют;
- actor helpers отсутствуют;
- Edge identity handler не импортирован в deployed `index.ts`;
- legacy task path продолжает работать по существующему contract.

`actor_aware_sql_contract_ready=true` означает только готовность repository prototype. Это не означает `identity_propagation_proven`, migration approval или deployment readiness.

## Актуальные STOP conditions

Future migration PR запрещён, пока одновременно не выполнены условия:

1. production structural preflight совпадает с attestation;
2. владелец утверждает final actor propagation architecture;
3. настоящий authenticated application E2E доказывает bearer user → verified actor → SQL audit chain;
4. final legacy/governed grant policy утверждена;
5. Edge integration и deployment имеют отдельный approval;
6. rollback owner, maintenance window и recovery readiness подтверждены;
7. Issue #282 cost gate снят явным решением владельца;
8. controlled pilot согласован отдельно.

## Future migration apply order

1. bounded base contract;
2. canonical governed mutations;
3. actor-aware identity overlay;
4. approved legacy RPC transition;
5. lite DTO baseline;
6. bounded DTO overlay;
7. database verification;
8. Edge integration отдельным deploy;
9. frontend transport отдельным controlled switch.

## Future rollback order

1. восстановить lite DTO v1 — proof PR #384;
2. удалить actor-aware overloads/helpers — proof PR #389;
3. удалить canonical governed mutation overlay и восстановить legacy grants — proof PR #384;
4. удалить bounded base contract — proof PR #384.

Actor-aware rollback не удаляет задачи или audit events сам по себе.

## Следующий safe slice

Repository-only Edge contract closure:

- связать detached identity handler с actor-aware overload inventory;
- изменить только repository readiness flags, не production runtime;
- доказать exact RPC/signature parity для всех шести actions;
- проверить client actor spoof rejection;
- подготовить authenticated E2E matrix и required secrets/accounts;
- не импортировать handler в `index.ts`;
- не deploy Edge;
- не включать frontend transport.

После этого следующий этап — cost/owner approval, а не автоматический deployment.

## Issue #282

Issue #282 остаётся обязательным cost gate. Generic-команда «продолжай» не разрешает платную Supabase branch, production migration или Edge deployment.

## Rollback

Для этого addendum database rollback не нужен. Repository rollback — вернуть object diff/storyboard к версии до PR #389 и удалить актуализированный addendum.
