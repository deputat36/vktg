# Navigator v2 — task role matrix rehearsal

Дата: 17 июля 2026 года.

Статус: cost-free mocked role matrix rehearsal. Это бесплатная browser/DTO-репетиция, а не реальная authenticated проверка Supabase.

## Причина

Issue #282 запрещает создавать платную Supabase preview branch без нового явного решения владельца.

Разрешены:

- static/source contracts;
- public desktop/mobile smoke;
- fixtures;
- mocked RPC;
- локальная или CI-изолированная проверка без оплачиваемой cloud branch.

Поэтому этот slice проверяет application wiring и role-scoped DTO contract, не создавая облачную среду и технические аккаунты.

## Матрица

Проверяются сценарии:

- owner;
- admin;
- manager;
- spn assigned;
- lawyer assigned;
- broker assigned;
- viewer;
- spn unassigned.

### Legacy action

DTO `can_change_status=true` разрешает routed legacy action через единственный authoritative handler.

Ожидаемый payload:

```text
nav_v2_update_task_status({
  p_task_id: "task-role-legacy",
  p_status: "done"
})
```

Viewer и unassigned SPN не получают action.

### Bounded completion

Assigned/privileged scenario может получить `can_complete=true`.

Handler:

- принимает action;
- валидирует task UUID, client request UUID и evidence UUID;
- показывает deployment-gate сообщение;
- не вызывает bounded mutation RPC.

### Terminal outcome decision

`can_decide_terminal_outcome=true` моделируется только для:

- owner;
- admin;
- manager.

SPN, lawyer, broker и viewer не получают decision action.

## Authoritative handler

Рабочий runtime остаётся однозначным:

- `deal-card-v2.js` только рендерит task controls;
- `task-action-guard-v2.js` владеет click в capture phase;
- synthetic base `onclick` существует только в fixture как regression trap;
- его счётчик обязан оставаться равным нулю.

## Bounded transport

`BOUNDED_TRANSPORT_ENABLED = false` не меняется.

Browser regression требует:

- ноль `nav_v2_start_bounded_task` calls;
- ноль `nav_v2_complete_bounded_task` calls;
- ноль active outcome calls;
- ноль terminal proposal/decision calls;
- bounded reopen disabled.

## Не доказывает

Этот rehearsal не доказывает:

- реальный Supabase Auth login;
- JWT claims;
- RLS;
- database grants;
- Edge Function authorization;
- production или preview deployment;
- корректность реальных назначений сотрудников.

Зелёный результат нельзя называть authenticated application E2E.

## Production boundary

Не выполняются:

- создание Supabase branch;
- database migrations;
- Auth user creation;
- Edge Function deployment;
- изменения RLS/grants;
- изменения task rows;
- mass backfill;
- оценка сотрудников.

Используется только synthetic session в fixture и mocked role-scoped RPC response.

## CI

Workflow выполняет:

1. source contract checker;
2. Python и JavaScript syntax checks;
3. Chromium desktop rehearsal;
4. Chromium mobile rehearsal;
5. upload Playwright evidence.

## Следующий gate

Реальный authenticated E2E остаётся заблокирован решением Issue #282.

После отдельного approval необходимо:

1. повторно проверить стоимость branch;
2. создать disposable non-production branch;
3. создать только technical users/data;
4. запустить ручную role matrix;
5. сохранить artifacts;
6. удалить branch и подтвердить cleanup.

## Rollback

Rollback repository-only:

- удалить contract JSON;
- удалить fixture/spec/checker/workflow;
- удалить этот документ.

Production rollback не требуется, потому что production state не меняется.
