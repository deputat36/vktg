# Navigator v2 — intake semantics wave 1 qualification

Дата: 20 июля 2026 года.

Статус: repository-only qualification. Это не расширение production support и не юридическое решение.

## Цель

Проверить, что четыре текущих fail-closed правила уже имеют достаточный точный server contract для будущего structural mapping:

- `spouse`;
- `seller_absent`;
- `encumbrance`;
- `inheritance`.

Все значения берутся только из `config/nav-v2-intake-contract-v1.json`. Новые юридические требования не добавляются.

## Exact catalog contract

| Rule | Risk | Deposit | Deal | Owner | Документы |
|---|---|---:|---:|---|---|
| `spouse` | yellow | нет | нет | lawyer | `spouse_consent_status` |
| `seller_absent` | yellow | да | да | lawyer | `participation_plan`, `power_of_attorney` |
| `encumbrance` | red | да | да | lawyer | `encumbrance_extract`, `release_terms` |
| `inheritance` | yellow | да | нет | lawyer | `inheritance_certificate` |

Expected decision и lawyer request type также сравниваются дословно с versioned catalog.

## Qualification gates

Правило квалифицируется только одновременно при выполнении всех условий:

1. Rule сопоставлен server adapter, а не клиентом.
2. Fact имеет `value=yes`.
3. Evidence source равен `client` или `document`, но не `unchecked`.
4. Legal passport содержит exact risk level, owner и block flags.
5. Work plan содержит exact lawyer task с action, evidence и expected result.
6. Все required documents присутствуют в side-aware plan.
7. Каждый документ имеет известный безопасный status.
8. Document title, side, owner role и rule link совпадают с catalog.
9. Lawyer owner разрешён trusted server context.
10. Lawyer handoff имеет состояние `ready` или `urgent_incomplete`.
11. Adapter gate разрешён.
12. Ни одно wave rule не попадает в broker scope.

Любой gap оставляет правило fail-closed.

## Что qualification не делает

- не меняет hardcoded support list из 13 правил;
- не уменьшает фактический unsupported inventory 12;
- не меняет production mapper;
- не меняет legacy integration preview;
- не создаёт migration;
- не создаёт RPC или Edge route;
- не пишет deal/document/risk/task rows;
- не принимает юридическое решение вместо юриста.

Поле `candidate_unsupported_after_future_integration` показывает только математический результат будущей интеграции при успешной квалификации. Поле `base_unsupported_inventory` остаётся 12, а `changes_supported_inventory=false`.

## PostgreSQL 17 evidence

Ephemeral harness использует canonical rendered server adapter и проверяет:

- отдельный positive scenario для каждого правила;
- combined scenario для всех четырёх правил;
- exact risk и gate flags;
- side-aware document contract;
- lawyer-only task ownership;
- отсутствие broker leakage;
- отсутствие business writes;
- qualification-only status;
- `unchecked` evidence fail-closed;
- missing document/status fail-closed;
- unresolved lawyer owner fail-closed;
- tampered risk fail-closed;
- invalid lawyer UUID fail-closed;
- rollback удаляет только wave overlay и сохраняет base adapter.

## Следующий шаг после зелёной qualification

Отдельный repository-only integration PR должен:

1. изменить legacy parity inventory с 13/12 на 17/8;
2. обновить governed plan blocker logic;
3. расширить production-schema mapper allowlist;
4. прогнать все прежние 13 fixtures и четыре новые fixtures;
5. доказать replay, owner, side, risk, FK/status compatibility и rollback;
6. сохранить `production_ready=false` до authenticated/deployment approval.
