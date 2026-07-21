# Navigator v2 — границы Supabase Advisor

Дата актуальной read-only сверки: 21 июля 2026 года.

## Зачем это нужно

Navigator v2 работает в общем Supabase project вместе с другими подсистемами. Security Advisor и Performance Advisor возвращают общий список предупреждений, поэтому `leader_*`, `parket_*`, `broker_*`, legacy `nav_*` и Navigator v2 нельзя смешивать в один backlog.

Контроль запрещает два опасных сценария:

1. массово отзывать `EXECUTE` у рабочих RPC только ради зелёного Advisor;
2. считать предупреждения других подсистем исправленными после проверки Navigator v2.

Production remains unchanged.

- DDL и DML не выполнялись;
- grants, Auth и RLS не менялись;
- preview branch не создавалась;
- cost confirmation не выполнялся;
- технические аккаунты не создавались;
- Edge Function не деплоилась;
- production data и `leader_*` не изменялись.

## Актуальный Navigator-only baseline

Read-only инвентаризация production от `2026-07-21T13:19:29.070311+00:00` показала:

- 50 RPC входят в curated public surface;
- 48 из них ожидаемо являются callable `SECURITY DEFINER` и полностью совпадают с lint `0029`;
- 2 зарегистрированных RPC являются `SECURITY INVOKER` wrappers:
  - `nav_v2_update_document_status`;
  - `nav_v2_get_frontend_coverage_health`;
- missing warnings: `0`;
- unexpected Navigator warnings: `0`;
- duplicate warnings: `0`;
- preview branches: `0`;
- `nav-e2e` Auth users: `0`;
- `[NAV E2E]` profiles: `0`;
- candidate database objects: `0`;
- Edge `nav-v2-deal-api`: v4, ACTIVE, `verify_jwt=true`;
- Edge SHA-256: `b64e3fdbc2fa22ccb4998e69232e4351308f1d9b0a7c3c2bec7093186d3e4095`.

Число 48 — контролируемый warning baseline, а не автоматическое доказательство безопасности каждой функции. Каждый RPC обязан сохранять grants и серверный role/data gate.

## Migration boundary

Read-only evidence разделяет две границы:

- latest Navigator migration: `20260716063401_nav_v2_correct_mortgage_broker_scope`;
- latest overall remote migration: `20260721122333_revoke_anon_execute_leader_internal_rpcs`.

Новая remote migration относится к `leader_*` и не меняет Navigator boundary. Navigator не получает права исправлять, переименовывать или нормализовать историю другого модуля.

## Источники правды

- `config/nav-v2-rpc-surface.json` — разрешённые browser/Edge RPC;
- `config/nav-v2-advisor-scope.json` — политика интерпретации Navigator-only warnings;
- `config/nav-v2-advisor-live-attestation.json` — свежая captured read-only attestation;
- `tests/sql/nav_v2_advisor_readonly_preflight_v1.sql` — воспроизводимый aggregate-only запрос;
- `scripts/check_nav_v2_rpc_surface.py` — запрет незарегистрированных и internal-only вызовов;
- `scripts/check_nav_v2_advisor_scope.py` — registry/policy drift;
- `scripts/check_nav_v2_advisor_live_attestation.py` — live evidence, migration, Edge и safety drift;
- `nav_v2_get_rpc_grant_health()` — runtime-проверка grants для owner/admin;
- `nav_v2_get_internal_rpc_lockdown_health()` — runtime-проверка private helpers.

## Read-only preflight

`tests/sql/nav_v2_advisor_readonly_preflight_v1.sql` выполняется внутри:

```sql
begin transaction read only;
```

Запрос возвращает только агрегаты:

- список и число callable `nav_v2_* SECURITY DEFINER` функций;
- latest remote и Navigator migration boundaries;
- отсутствие bounded/intake candidate-объектов;
- число технических identities;
- read-only и no-mutation flags.

Запрос не возвращает ФИО, email, телефоны, адреса, UUID пользователей или клиентские данные и всегда заканчивается `rollback`.

## Что проверяет CI

```bash
python3 scripts/check_nav_v2_advisor_scope.py
python3 scripts/check_nav_v2_advisor_scope.py --self-test
python3 scripts/check_nav_v2_advisor_live_attestation.py
```

CI завершится ошибкой, если:

- внешний RPC не классифицирован;
- RPC одновременно внешний и internal-only;
- `SECURITY INVOKER` exception потерян или не объяснён;
- рассчитанное число `0029` warnings отличается от 48;
- captured список не совпадает с registry;
- изменилась Navigator migration boundary;
- изменилась Edge v4 версия, JWT requirement или hash;
- появилась preview branch, candidate DB object или technical identity;
- read-only evidence утверждает DDL, DML, grant, Auth или cloud mutation;
- кто-то разрешил автоматический массовый revoke;
- leaked-password blocker потерял связь с auth E2E и cost gate.

Workflow сохраняет deterministic evidence artifact с SHA-256 всех входных контрактов.

## Сверка с полной выгрузкой Advisor

Для локальной проверки ответа Advisor:

```bash
python3 scripts/check_nav_v2_advisor_scope.py --advisor-json artifacts/security-advisor.json
```

Поддерживаются формы:

- массив lint-объектов;
- `{ "lints": [...] }`;
- `{ "result": { "lints": [...] } }`.

Предупреждения других подсистем игнорируются только в Navigator-срезе и не помечаются исправленными.

## Правило по SECURITY DEFINER

Warning принимается только при наличии всех доказательств:

1. функция зарегистрирована ровно в одной внешней категории;
2. `authenticated` имеет `EXECUTE`;
3. `anon` и `PUBLIC` не имеют `EXECUTE`;
4. frontend RPC проверяет `auth.uid()` и доступ к данным;
5. admin RPC имеет owner/admin gate;
6. demo RPC имеет owner/admin или `service_role` gate;
7. regression checks рабочего маршрута зелёные.

Без этих доказательств warning считается незакрытым.

## Leaked password protection

Security Advisor по-прежнему сообщает `auth_leaked_password_protection`.

Настройка остаётся заблокированной, а не отклонённой. Условия включения:

1. issue #16 — invite, recovery и password flow проходят на disposable аккаунтах;
2. issue #159 — authenticated role matrix проходит на isolated Supabase target;
3. issue #282 — владелец отдельно подтверждает стоимость branch и technical-account execution;
4. после включения повторно проходят приглашение, восстановление и вход;
5. Advisor больше не возвращает warning.

До выполнения этих условий production Auth автоматически не меняется.

## Что не входит в этот срез

- production DDL и изменение grants;
- Auth configuration changes;
- автоматический deploy;
- закрытие legacy `nav_*`;
- исправление `leader_*`, `parket_*`, `broker_*` warnings;
- включение leaked-password protection без authenticated E2E;
- удаление «неиспользуемых» индексов только по Advisor;
- трактовка task counts как оценки сотрудников.
