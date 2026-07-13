# Navigator v2 — границы Supabase Advisor

Дата фиксации baseline: 2026-07-13.

## Зачем это нужно

Navigator v2 работает в общем Supabase project вместе с другими подсистемами. Security Advisor и Performance Advisor возвращают единый список предупреждений для всей базы, поэтому предупреждения `leader_*`, `parket_*`, `broker_*`, legacy `nav_*` и Navigator v2 нельзя смешивать в один backlog.

Цель этого контроля — не скрыть предупреждения, а отделить Navigator v2 и запретить два опасных сценария:

1. массово отзывать `EXECUTE` у рабочих RPC только ради зелёного Advisor;
2. считать предупреждения других подсистем исправленными после проверки Navigator v2.

## Текущий Navigator-only baseline

Read-only инвентаризация production на 2026-07-13:

- 66 функций с префиксом `nav_v2_` в схемах `public` и `nav_v2_private`;
- 48 функций входят в curated public RPC surface;
- у `anon` нет `EXECUTE` на Navigator v2 RPC;
- 46 публичных RPC ожидаемо реализованы как `SECURITY DEFINER` и поэтому попадают в lint `0029`;
- 2 зарегистрированных RPC являются `SECURITY INVOKER` wrappers:
  - `nav_v2_update_document_status`;
  - `nav_v2_get_frontend_coverage_health`;
- private helpers не входят в browser RPC surface и контролируются отдельным internal-lockdown health check.

Число 46 — контролируемый baseline, а не доказательство безопасности каждой функции. Каждый RPC по-прежнему обязан пройти проверку grants и серверного gate.

## Источники правды

- `config/nav-v2-rpc-surface.json` — какие RPC разрешены browser/Edge слоям;
- `config/nav-v2-advisor-scope.json` — как интерпретировать Navigator-only Advisor warnings;
- `scripts/check_nav_v2_rpc_surface.py` — запрещает незарегистрированные и internal-only вызовы;
- `scripts/check_nav_v2_advisor_scope.py` — запрещает drift между RPC registry и Advisor baseline;
- `nav_v2_get_rpc_grant_health()` — runtime-проверка grants для owner/admin;
- `nav_v2_get_internal_rpc_lockdown_health()` — runtime-проверка private helpers.

## Что проверяет CI

```bash
python3 scripts/check_nav_v2_advisor_scope.py
python3 scripts/check_nav_v2_advisor_scope.py --self-test
```

Проверка завершится ошибкой, если:

- новый внешний RPC не классифицирован;
- RPC одновременно попал во внешнюю и внутреннюю категории;
- `SECURITY INVOKER` exception не зарегистрирован или не имеет объяснения;
- рассчитанное число ожидаемых `0029` warnings изменилось;
- кто-то разрешил автоматический массовый revoke;
- leaked-password blocker потерял связь с auth E2E issues #16 и #159.

## Сверка с выгрузкой Advisor

Сохраните ответ Advisor в JSON и запустите:

```bash
python3 scripts/check_nav_v2_advisor_scope.py --advisor-json artifacts/security-advisor.json
```

Поддерживаются формы:

- массив lint-объектов;
- `{ "lints": [...] }`;
- `{ "result": { "lints": [...] } }`.

Проверка:

- требует полный ожидаемый набор Navigator v2 lint `0029`;
- отклоняет новый незарегистрированный Navigator v2 warning;
- не выдаёт предупреждения других подсистем за исправленные;
- отдельно сообщает состояние leaked-password protection.

## Правило по `SECURITY DEFINER`

Warning может быть принят только при наличии всех доказательств:

1. функция зарегистрирована ровно в одной внешней категории;
2. `authenticated` имеет `EXECUTE`;
3. `anon` и `PUBLIC` не имеют `EXECUTE`;
4. frontend RPC проверяет `auth.uid()` и доступ к сделке/данным;
5. admin RPC имеет owner/admin gate;
6. demo RPC имеет owner/admin или `service_role` gate;
7. regression checks для рабочего маршрута остаются зелёными.

Без этих доказательств warning считается незакрытым.

## Leaked password protection

На 2026-07-13 настройка остаётся заблокированной, а не отклонённой.

Условия включения:

1. issue #16: invite, recovery и password flow проходят на disposable аккаунтах;
2. issue #159: authenticated role matrix проходит на isolated Supabase target;
3. после включения повторно проходят приглашение, восстановление и вход;
4. Security Advisor больше не возвращает `auth_leaked_password_protection`.

До выполнения условий production Auth настройки автоматически не меняются.

## Что не входит в этот срез

- DDL и изменение production grants;
- автоматический deploy;
- закрытие legacy `nav_*`;
- исправление предупреждений `leader_*`, `parket_*`, `broker_*`;
- включение leaked-password protection без auth E2E;
- удаление «неиспользуемых» индексов только по Advisor.
