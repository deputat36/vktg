# Navigator v2 — roadmap после аудита

Дата: 2026-07-10

## P0 — безопасность и релиз, 0–2 дня

- [x] Задеплоить `nav-invite-user` version 10.
- [x] Закрыть default privileges для новых объектов роли `postgres`.
- [x] Синхронизировать migrations с GitHub.
- [ ] Административно закрыть default privileges роли `supabase_admin`.
- [ ] Назначить менеджера существующему активному СПН.
- [ ] Пройти invite/recovery E2E в инкогнито.
- [ ] После auth QA включить leaked password protection.
- [ ] Проверить version/hash всех Navigator Edge Functions.

## P1 — управляемая архитектура, 1–2 недели

- [ ] Добавить deploy/drift workflow с GitHub environment approval.
- [ ] Добавить Playwright smoke по ролям.
- [ ] Создать `private` schema для внутренних helpers.
- [ ] Подготовить `api` schema или строгий curated public API.
- [ ] Классифицировать 47 callable SECURITY DEFINER RPC.
- [ ] Оптимизировать 23 RLS policies с row-wise `auth.uid()`.
- [ ] Добавить CSP и провести DOM/XSS audit.
- [ ] Генерировать и проверять TypeScript types схемы.

## P2 — поддерживаемость и данные, 2–6 недель

- [ ] Консолидировать deal-card patch-модули до core + 5–8 features.
- [ ] Консолидировать SPN wizard до core + steps + validators.
- [ ] Ввести единый build/version cache-bust.
- [ ] Разделить operational tasks и quality warnings.
- [ ] Разобрать 13 urgent и 35 high задач.
- [ ] Ввести менеджерскую ежедневную очередь и SLA.
- [ ] Добавить единый release health report.

## P3 — масштабирование

- [ ] Зафиксировать владельцев Leader, Navigator, Parket и Broker.
- [ ] Подготовить разделение схем или Supabase-проектов.
- [ ] Архивировать legacy только после dependency scan.
- [ ] Удалять индексы только после периода наблюдения и EXPLAIN/usage анализа.

## Целевой pipeline

PR:

1. Static checks.
2. JSON/schema validators.
3. SQL lint и migration naming.
4. Playwright smoke публичных страниц.
5. Role matrix tests против staging.

Merge в `main`:

1. Migration drift check.
2. Environment approval.
3. Применение migrations и deploy изменённых Edge Functions.
4. Проверка `verify_jwt`, version и hash.
5. Smoke основных RPC.
6. GitHub Actions Summary.

## Критерии стабильного релиза

- GitHub migrations и live history совпадают;
- Edge code и live hash совпадают;
- invite/recovery работает для нового и существующего пользователя;
- обычные роли не видят admin diagnostics;
- активных СПН без менеджера: 0;
- urgent задачи имеют владельца и срок;
- Playwright smoke зелёный;
- новые public objects не получают grants автоматически;
- Advisor warnings устранены или документированы как intentional API.
