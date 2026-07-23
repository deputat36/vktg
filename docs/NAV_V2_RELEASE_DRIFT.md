# Navigator v2 — release drift gate

## Назначение

Workflow `.github/workflows/nav-v2-release-drift.yml` формирует read-only отчёт о соответствии GitHub и production Supabase.

Он проверяет:

- repository migrations против remote migration history;
- наличие утверждённой Navigator migration в production;
- approved aliases между live timestamps и каноническими repository migrations;
- наличие двух Navigator Edge Functions;
- live version, status, `verify_jwt` и bundle SHA-256;
- Git blob SHA исходников функций в проверяемом ref;
- отсутствие незарегистрированных live Navigator Edge Functions.

Supabase project общий для Navigator и `leader_*`. Поэтому approved Navigator migration должна присутствовать в production, но не обязана быть глобально последней migration всего проекта. Более новые repository-known migrations общего проекта сами по себе не являются drift Навигатора.

Workflow работает **без автоматического deploy**. Он не выполняет:

- `supabase db push`;
- `supabase functions deploy`;
- migration repair;
- изменение secrets;
- SQL mutations;
- изменение production данных.

## GitHub Environment

Создайте Environment:

`navigator-production-readonly`

Рекомендуемые настройки:

1. Добавить required reviewer владельца проекта.
2. Ограничить deployment branches веткой `main` и доверенными release refs.
3. Добавить encrypted secrets:
   - `SUPABASE_ACCESS_TOKEN`;
   - `SUPABASE_DB_PASSWORD`.
4. Не хранить access token или пароль базы в repository variables, workflow YAML, issue или artifact.

Project ref не является секретом и читается из:

`config/nav-v2-release-baseline.json`

## Запуск

Откройте GitHub Actions → `Navigator v2 release drift report` → `Run workflow`.

Параметры:

- `checkout_ref` — проверяемый commit, tag или branch;
- `allow_drift=false` — workflow завершится ошибкой при расхождении;
- `allow_drift=true` — отчёт сохранится, но drift временно не заблокирует запуск.

Для release gate используйте `allow_drift=false`.

## Артефакты

Workflow сохраняет на 30 дней:

- `release-drift.json` — машиночитаемый результат;
- `release-drift.md` — отчёт для release summary;
- `migration-list.txt` — вывод Supabase CLI;
- `functions.json` — live metadata Edge Functions.

Markdown также добавляется в GitHub Step Summary.

## Approved baseline

Файл:

`config/nav-v2-release-baseline.json`

содержит подтверждённое production-состояние:

- последнюю утверждённую Navigator migration;
- версии Edge Functions;
- `verify_jwt`;
- live bundle hashes;
- Git blob SHA исходников.

Для общего Supabase-проекта применяется семантика:

`required_present_not_global_latest`

Контракт:

`config/nav-v2-release-drift-shared-project-v1.json`

Evaluator:

`scripts/check_nav_v2_release_drift_shared_project.py`

Baseline нельзя менять только для того, чтобы сделать CI зелёным.

Обновлять его допустимо после следующей последовательности:

1. PR с migration или Edge source прошёл CI.
2. Изменение применено владельцем через контролируемый release-процесс.
3. Live migration version или Edge version/hash получены из Supabase после deploy.
4. Post-deploy smoke прошёл.
5. Migration alias связывает live timestamp с каноническим source blob, если timestamps отличаются.
6. Baseline обновлён фактическими live значениями.
7. Release drift workflow с `allow_drift=false` завершился PASS.

## Интерпретация drift

### Repository migrations missing in production

В GitHub есть migration, которой нет в remote history и которая не покрыта approved repository-only mapping. Не выполнять migration repair вслепую. Сначала подтвердить, должна ли migration быть применена.

### Production migrations missing in repository

В production есть migration version, отсутствующая в GitHub и не покрытая approved live alias. Нужно найти исходный SQL и восстановить историю репозитория. Не создавать пустой файл с нужным timestamp.

### Approved Navigator baseline migration absent

Утверждённая Navigator migration отсутствует в remote history. Это блокирующий drift даже при наличии более новых migrations общего проекта.

### Later migrations in the shared project

Более новая migration не является drift только потому, что её timestamp больше baseline Navigator. Она всё равно обязана иметь repository source или approved alias. Неизвестная remote-only migration остаётся блокирующей.

### Edge live metadata differs from baseline

Проверить:

- был ли контролируемый deploy;
- совпадает ли function slug;
- включён ли `verify_jwt`;
- соответствует ли live version ожидаемой;
- совпадает ли bundle SHA-256.

### Repository source differs from baseline

Исходник Edge Function в проверяемом ref изменён после последнего подтверждённого deploy. До обновления baseline требуется контролируемый deploy и post-deploy verification.

## Локальная и CI-проверка

Без production credentials:

```bash
python3 scripts/check_nav_v2_release_drift.py --self-test
python3 scripts/check_nav_v2_release_drift.py --baseline-only
python3 scripts/check_nav_v2_release_drift_aliases.py --self-test
python3 scripts/check_nav_v2_release_drift_aliases.py --baseline-only
python3 scripts/check_nav_v2_release_drift_shared_project.py --self-test
python3 scripts/check_nav_v2_release_drift_shared_project.py --baseline-only
python3 -m unittest tests/unit/test_nav_v2_release_drift_shared_project_v1.py
python3 scripts/check_nav_v2_release_drift_workflow.py
```

Эти команды проверяют parser, baseline, approved aliases, shared-project semantics, Git source blobs и read-only workflow contract.
