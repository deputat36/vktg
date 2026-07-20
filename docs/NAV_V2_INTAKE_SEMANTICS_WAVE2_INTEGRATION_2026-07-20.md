# Navigator v2 — legal semantics wave 2 integration

Дата: 20 июля 2026 года.

## Результат

Repository-only effective overlay интегрирует четыре ранее квалифицированных правила:

- `bankruptcy_risk`;
- `redevelopment`;
- `after_registration`;
- `certificate`.

Effective inventory повышается только внутри repository rehearsal:

- supported: 17 → 21;
- unsupported: 8 → 4.

Базовые v1 contracts остаются 13/12, wave 1 остаётся 17/8. Production runtime не изменяется.

## Server/governed boundary

Wave 2 preview вызывает проверенный wave 1 preview, затем снимает gap только для rules с exact wave 2 qualification evidence. Governed wrapper пересчитывает blockers и не разрешает plan, если остаётся хотя бы одно unsupported rule.

Для каждого wave 2 rule повторно проверяются:

- exact risk level и deposit/deal flags;
- lawyer owner;
- non-empty resolved lawyer task;
- expected result из versioned catalog;
- document title, side, owner и status;
- qualification evidence для конкретного rule.

Production execute всегда выключен.

## Production-schema mapper rehearsal

Wave 2 mapper:

1. удаляет wave 2 tasks/risks/documents из входа;
2. передаёт оставшийся plan проверенному wave 1 mapper;
3. добавляет обратно только квалифицированные wave 2 rows;
4. сохраняет lawyer `legal_blocker` task type;
5. сохраняет source `intake_v1:<rule>`;
6. отображает seller/buyer напрямую, object/deal — в production enum `both` с `source_hint` исходного scope;
7. сохраняет risk и gate flags;
8. возвращает `production_ready=false`.

## PostgreSQL 17 evidence

Governed job проверяет:

- полную wave 1 regression;
- четыре wave 2 preview/plan/save scenarios;
- exact ledger replay;
- combined four-rule plan;
- remaining special rule fail-closed;
- missing document status fail-closed;
- injected partial failure без ledger/shadow rows;
- layered rollback.

Exact-schema job проверяет:

- прежние 13 base fixtures;
- прежние 4 wave 1 fixtures;
- новые 4 wave 2 fixtures;
- итог 21 synthetic deals;
- FK, enum, task status/type и trigger compatibility;
- seller/object/deal/buyer document scopes;
- exact replay;
- missing qualification, tampered risk/side и invalid FK fail-closed;
- полный rollback.

## Оставшиеся fail-closed semantics

- `legal_problem`;
- `partner_agency`;
- `flat_ground`;
- `house_land`.

Они требуют отдельной последней semantic wave и не включены автоматически.

## Границы

- migration отсутствует;
- production Supabase не изменяется;
- Edge и frontend не подключаются;
- authenticated E2E не считается выполненным;
- cleanup 46 legacy quality rows остаётся owner-gated;
- `production_ready=false`.
