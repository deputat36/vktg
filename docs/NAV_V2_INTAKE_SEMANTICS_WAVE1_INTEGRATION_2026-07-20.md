# Navigator v2 — intake semantics wave 1 integration

Дата: 20 июля 2026 года.

Статус: repository-only integration rehearsal. Production Supabase не изменён.

## Результат

Четыре правила, квалифицированные в PR #412, включены в отдельный effective integration overlay:

- `spouse`;
- `seller_absent`;
- `encumbrance`;
- `inheritance`.

Effective repository inventory:

- supported — 17;
- unsupported — 8.

Базовые v1-функции и config остаются 13/12. Overlay не подменяет исторические доказательства и не объявляет production deployment.

## Слои

1. Canonical intake adapter пересчитывает facts, legal passport и work plan.
2. Legacy preview сохраняет trusted actor/owner context и base unsupported inventory.
3. Wave1 qualifier проверяет exact catalog semantics.
4. Effective parity wrapper вычитает только фактически qualified wave rules.
5. Governed wrapper снимает `unsupported_rule_semantics` только при успешной qualification.
6. Production-schema mapper wrapper повторно проверяет risk/task/document rows и добавляет их поверх проверенного 13-rule mapper.

## Защита от ложной qualification

Наличия `qualified_rule_ids` недостаточно. Mapper независимо проверяет:

- exact risk level и block flags;
- lawyer ownership;
- resolved `owner_id`;
- exact expected decision;
- task gate impact;
- required documents;
- document side;
- known document status.

Tampered plan получает `22023`.

## Effective unsupported rules

Остаются fail-closed:

- `bankruptcy_risk`;
- `redevelopment`;
- `after_registration`;
- `legal_problem`;
- `partner_agency`;
- `flat_ground`;
- `house_land`;
- `certificate`.

## PostgreSQL 17 server/governed evidence

Отдельный job обязан доказать:

- base preview продолжает считать wave1 rules unsupported;
- effective preview квалифицирует только точные сценарии;
- governed plan становится allowed только после qualification;
- owner, side, documents, risk и lawyer tasks сохраняются;
- exact request replay возвращает ledger result;
- partial failure откатывает ledger и все shadow rows;
- combined four-rule plan даёт 17/8;
- оставшееся правило и missing document status остаются blocked;
- base 13 regression сохраняется.

## PostgreSQL 17 exact-schema evidence

Второй независимый job обязан:

- сначала прогнать прежние 13 production-schema fixtures;
- затем записать четыре wave1 fixtures;
- получить ровно 17 synthetic deals;
- пройти production-like FK, enum, task-type, status и trigger constraints;
- сохранить seller/object document scope;
- преобразовать object scope в enum `both` с `source_hint`;
- создать только lawyer `legal_blocker` tasks;
- сохранить red/yellow risk и gate flags;
- доказать exact replay;
- отклонить remaining unsupported, missing qualification, tampered risk и invalid FK;
- выполнить layered rollback.

## Production blockers

Даже при зелёном rehearsal остаются обязательны:

- privacy-aligned quality replacement deployment;
- authenticated role matrix;
- owner/deployment approval;
- approved migration и Edge rollout;
- cleanup owner option;
- controlled pilot.

`production_ready=false`, production execute отсутствует, файл migration не создаётся.
