# Navigator v2 — CI-only preview bundle assembler v1

Дата: 21 июля 2026 года.

## Назначение

Assembler превращает repository source manifest в deterministic временные SQL-артефакты для PostgreSQL 17 rehearsal.

Он не создаёт Supabase migration, preview branch или production rollback package.

## Выходные артефакты

Assembler принимает только явный `--output-dir` вне репозитория и создаёт:

- `01-quality-forward.sql`;
- `01-quality-rehearsal-rollback.sql`;
- `02-bounded-forward.sql`;
- `02-bounded-rehearsal-rollback.sql`;
- `03-intake-forward.sql`;
- `03-intake-rehearsal-rollback.sql`;
- `bundle-index.json`.

Каждый SQL-файл содержит source boundaries и предупреждение о запрете production apply.

`bundle-index.json` содержит:

- точный source order;
- SHA-256 каждого входного source;
- SHA-256 и размер каждого результата;
- SHA-256 source manifest и assembler config;
- отчёт об ожидаемых exact function redefinitions;
- `deployment_bundle_ready=false`;
- `production_rollback_bundle_ready=false`.

## Сегменты

### Quality

Forward:

1. privacy-aligned completeness replacement;
2. deal-creator authorship overlay.

Rollback — exact rehearsal восстановления legacy quality snapshot.

Mass backfill и закрытие legacy tasks отсутствуют.

### Bounded tasks

Forward:

1. additive bounded contract;
2. canonical governed mutations;
3. actor-aware overloads;
4. explicit lite DTO baseline;
5. bounded DTO overlay.

Rollback:

1. restore explicit DTO;
2. remove actor-aware overloads;
3. remove governed mutation overlay;
4. remove bounded base columns and constraints.

Post-rollback проверяется сохранность legacy task и отсутствие bounded columns/functions/event table.

### Intake

Canonical intake adapter рендерится во временную память из:

- `config/nav-v2-intake-contract-v1.json`;
- `supabase/prototypes/nav_v2_intake_save_adapter_v1.sql`.

Затем добавляются base integration, governed ledger/write plan, production mapper, wave1, wave2 и special overlays. Итоговый structural inventory остаётся 25/0.

Rollback объединяет существующие layered rehearsal rollback scripts в обратном порядке.

## Determinism

CI собирает bundle дважды в разных временных каталогах и требует byte-identical `diff`.

Verifier повторно проверяет:

- шесть SQL-артефактов;
- filenames и segment order;
- source order;
- file sizes и SHA-256;
- отсутствие unresolved intake markers;
- rehearsal warnings;
- ожидаемые redefinitions:
  - quality task authorship helper;
  - public lite DTO overlay;
- отсутствие неожиданных intake redefinitions.

## PostgreSQL 17 rehearsal

Три независимых jobs:

1. quality apply → assertions → rollback;
2. bounded apply → canonical/actor/DTO assertions → full rollback;
3. intake apply → base/wave/final 25-rule assertions → layered rollback.

Каждый job использует synthetic local service container и не обращается к Supabase cloud.

## Жёсткие границы

Assembler:

- отклоняет output внутри репозитория;
- отклоняет output в `supabase/migrations`;
- не вызывает Supabase API;
- не вызывает `confirm_cost`;
- не создаёт branch;
- не применяет migration;
- не деплоит Edge;
- не меняет frontend transport;
- не создаёт technical accounts;
- не выполняет cleanup;
- не утверждает deployment readiness.

Полученные rollback-файлы являются harness rehearsal rollback, а не утверждённым production rollback plan.
