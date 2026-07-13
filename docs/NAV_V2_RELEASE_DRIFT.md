# Navigator v2 — release drift gate

## Назначение

Workflow `.github/workflows/nav-v2-release-drift.yml` формирует read-only отчёт о соответствии GitHub и production Supabase.

Он проверяет:

- repository migrations против remote migration history;
- последнюю live migration против утверждённого baseline;
- наличие двух Navigator Edge Functions;
- live version, status, `verify_jwt` и bundle SHA-256;
- Git blob SHA исходников функций в проверяемом ref;
- отсутствие незарегистрированных live Navigator Edge Functions.

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

- последнюю live migration;
- версии Edge Functions;
- `verify_jwt`;
- live bundle hashes;
- Git blob SHA исходников.

Baseline нельзя менять только для того, чтобы сделать CI зелёным.

Обновлять его допустимо после следующей последовательности:

1. PR с migration или Edge source прошёл CI.
2. Изменение применено владельцем через контролируемый release-процесс.
3. Live version/hash получены из Supabase после deploy.
4. Post-deploy smoke прошёл.
5. Baseline обновлён фактическими live значениями.
6. Release drift workflow с `allow_drift=false` завершился PASS.

## Интерпретация drift

### Repository migrations missing in production

В GitHub есть migration, которой нет в remote history. Не выполнять migration repair вслепую. Сначала подтвердить, должна ли migration быть применена.

### Production migrations missing in repository

В production есть migration version, отсутствующая в GitHub. Нужно найти исходный SQL и восстановить историю репозитория. Не создавать пустой файл с нужным timestamp.

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
python3 scripts/check_nav_v2_release_drift_workflow.py
```

Эти команды проверяют parser, baseline, Git source blobs и read-only workflow contract.
