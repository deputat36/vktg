# Navigator v2 — identity addendum к bounded migration storyboard

Дата: 17 июля 2026 года.

Статус: repository-only. Production migration, Edge deployment и bounded transport не разрешены.

## Причина обновления

PR #387 доказал несовместимость текущего governed prototype:

- SQL берёт actor через `auth.uid()`;
- governed RPC доступны только `service_role`;
- пользовательский JWT даёт actor identity, но роль `authenticated` не имеет EXECUTE;
- service-role transport имеет EXECUTE, но пользовательский `sub` не гарантирован.

Поэтому зелёные PR #384 и #386 сами по себе недостаточны для database/Edge deployment.

## Новые STOP conditions

Future migration PR запрещён, пока одновременно не выполнены условия:

1. PR #387 identity propagation gate остаётся зелёным;
2. владелец утверждает final actor propagation architecture;
3. governed SQL получает actor-aware contract;
4. actor-aware PostgreSQL 17 lifecycle/ACL/idempotency regression зелёный;
5. client payload не может передать `actor_id`, `p_actor_id`, `user_id` или `p_user_id`;
6. actor формируется только из успешной проверки bearer token;
7. SQL повторно подтверждает активный Navigator profile и полномочия actor;
8. authenticated application E2E доказывает реальную identity chain;
9. Edge deployment и frontend transport разрешаются отдельными решениями.

## Candidate contract

Текущий repository candidate:

`bearer token → verified actor UUID → Edge validation → p_actor_id injection → service-role-only actor-aware RPC`

Candidate пока не является production решением. Canonical governed RPC signatures не содержат `p_actor_id` и остаются deployment-blocked.

## Следующий safe slice

Создать отдельный repository-only actor-aware SQL prototype:

- без изменений текущего production SQL;
- без файла в `supabase/migrations`;
- без изменения существующего bounded prototype до прохождения regression;
- с отдельными actor-aware RPC signatures;
- с active-profile и role/deal authorization;
- с idempotency и audit actor preservation;
- с PostgreSQL 17 lifecycle/ACL/rollback assertions;
- с точным mapping из detached Edge identity handler;
- без Edge import/deploy и без frontend transport.

## Production boundary

Production Supabase после PR #387 не изменён:

- bounded columns отсутствуют;
- mutation event table отсутствует;
- governed RPC отсутствуют;
- Edge identity handler не импортирован в deployed `index.ts`;
- legacy task path продолжает работать по существующему contract.

Issue #282 остаётся обязательным cost gate.

## Rollback

Для этого addendum database rollback не нужен. Repository rollback — удалить addendum и вернуть storyboard config к версии до identity gate.
