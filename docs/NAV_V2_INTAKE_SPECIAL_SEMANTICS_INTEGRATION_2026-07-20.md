# Navigator v2 — final special semantics integration

Дата: 20 июля 2026 года.

## Результат

Repository-only overlay интегрирует `legal_problem`, `partner_agency`, `flat_ground` и `house_land`.

Effective catalog inventory внутри rehearsal:

- supported: 25;
- unsupported: 0.

Базовые 13/12, wave1 17/8 и wave2 21/4 contracts сохраняются. Production runtime не изменяется.

## Контракт

Final preview снимает special gap только при exact qualification. Final governed plan допускается только при пустом unsupported array. Mapper повторно проверяет risk, lawyer task, documents и qualification evidence.

Особенности:

- `legal_problem` не создаёт document rows и сохраняет red risk;
- partner document имеет deal scope;
- flat/house documents имеют object scope;
- все tasks остаются lawyer `legal_blocker` с source `intake_v1:<rule>`;
- production execute всегда выключен;
- `production_ready=false`.

## PostgreSQL 17 evidence

Governed job проверяет четыре single scenarios, два compatible composite scenarios, exact ledger replay, missing status, injected failure и layered rollback.

Exact-schema job сохраняет прежние 21 fixtures, добавляет четыре special fixtures и подтверждает итог 25. Также проверяются FK, enums, status/task type, document scopes, replay, missing qualification, unexpected legal document, tampered risk/side, invalid FK и rollback.

`flat_ground` и `house_land` взаимоисключающие object types; общий catalog coverage доказывается inventory из 25 независимых fixtures, а не искусственным payload с двумя object types.

## Границы

25/0 означает structural repository coverage, но не deployment readiness. До production обязательны authenticated E2E, owner/cost/deployment approval, privacy-aligned quality deployment, controlled pilot и отдельное owner decision по cleanup 46 legacy quality rows.
