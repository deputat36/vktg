# Navigator v2: release минимизации клиентских идентификаторов

Дата: 2026-07-15.

## Репозиторий

- implementation PR: #338;
- release-sync PR: #339;
- read-layer PR: #341;
- historical free-text redaction PR: #342;
- канонический fresh-install source: `supabase/migrations/20260715224500_nav_v2_minimize_client_identifiers.sql`;
- подтверждённый production timestamp: `20260715203158`;
- live → canonical mapping зарегистрирован в `config/nav-v2-release-migration-aliases.json`.

## Что включено

- новые browser drafts очищаются от ФИО и телефонов клиентов;
- новые сделки сохраняются через публичный sanitizing wrapper;
- проверенная legacy-логика генерации задач, документов и рисков сохранена в private implementation;
- table trigger минимизирует каждую новую сделку;
- на исторических строках очищаются только identity/JSON-поля, которые явно меняются текущей операцией;
- обычное изменение ориентира объекта не выполняет скрытую очистку старых данных;
- `nav_v2_update_deal_parties` сохраняет совместимость, но игнорирует ФИО/телефоны и обновляет только нейтральный ориентир;
- idempotency fingerprint не зависит от клиентских имён и телефонов;
- RPC-ответы минимизируются до кэширования, поиска и рендера;
- исторические явные чувствительные значения в рабочих текстах маскируются только при чтении;
- оригинальные исторические строки в Supabase не изменялись.

## Контроль истории

До и после production migration совпали агрегированные показатели:

- всего сделок: 23;
- имя продавца: 0;
- имя покупателя: 6;
- телефон продавца: 7;
- телефон покупателя: 12;
- имя покупателя в snapshot: 6;
- телефон продавца в snapshot: 7;
- телефон покупателя в snapshot: 12.

Исторические сделки не очищались и не удалялись.

## Проверки

- sanitizer и trigger проверены на временной таблице внутри транзакции с `ROLLBACK`;
- прямые идентификаторы удалены, рабочие признаки сохранены, заголовок стал нейтральным;
- public wrapper и private legacy implementation присутствуют в нужных схемах;
- authenticated имеет EXECUTE на public wrapper;
- private legacy не имеет grant для authenticated;
- production trigger `nav_v2_deals_guard_client_identifiers` включён;
- trigger установлен только на identity и JSON-поля, без address/object_type;
- static, semantic, idempotency и desktop/mobile browser tests зелёные;
- read-layer и historical text redaction проверены отдельными desktop/mobile наборами;
- public smoke зелёный;
- authenticated smoke пропущен и не считается ролевой матрицей;
- security/performance advisors выполнены после DDL;
- новых advisor-проблем, связанных с этой migration, не обнаружено.

## Следующий этап

1. Провести read-only инвентаризацию полей высокочастотных серверных RPC.
2. Разделить RPC-ответы на рабочие факты, структурированные клиентские идентификаторы и чувствительный свободный текст.
3. Подготовить repository-only контракт server-side minimization без production deploy.
4. Определить порядок rollout wrappers после authenticated regression или отдельного решения владельца.
5. Отдельно спроектировать срок хранения browser draft.
6. Любую историческую очистку готовить только как агрегированный preview без вывода значений и без автоматического применения.
