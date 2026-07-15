# Navigator v2: release минимизации клиентских идентификаторов

Дата: 2026-07-15.

## Репозиторий

- implementation PR: #338;
- merged main: `1c5b0064f9baf7326c1159c25d8dc28b4abd6f08`;
- канонический fresh-install source: `supabase/migrations/20260715224500_nav_v2_minimize_client_identifiers.sql`;
- production timestamp: `20260715203126`;
- live → canonical mapping зарегистрирован в `config/nav-v2-release-migration-aliases.json`.

## Что включено

- новые browser drafts очищаются от ФИО и телефонов клиентов;
- новые сделки сохраняются через публичный sanitizing wrapper;
- проверенная legacy-логика генерации задач, документов и рисков сохранена в private implementation;
- table trigger минимизирует каждую новую сделку;
- на исторических строках очищаются только identity/JSON-поля, которые явно меняются текущей операцией;
- обычное изменение ориентира объекта не выполняет скрытую очистку старых данных;
- `nav_v2_update_deal_parties` сохраняет совместимость, но игнорирует ФИО/телефоны и обновляет только нейтральный ориентир;
- idempotency fingerprint не зависит от клиентских имён и телефонов.

## Контроль истории

До и после миграции совпали агрегированные показатели:

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
- прямые идентификаторы удалены, рабочий признак оплаты сохранён, заголовок стал нейтральным;
- public wrapper и private legacy implementation присутствуют в нужных схемах;
- authenticated имеет EXECUTE на public wrapper;
- private legacy не имеет grant для authenticated;
- trigger установлен только на identity и JSON-поля, без address/object_type;
- static, semantic, idempotency и desktop/mobile browser tests зелёные;
- public smoke зелёный;
- authenticated smoke пропущен и не считается ролевой матрицей;
- security/performance advisors выполнены после DDL;
- новых advisor-проблем, связанных с этой миграцией, не обнаружено.

## Следующий этап

1. Минимизировать отображение исторических идентификаторов на read-layer без удаления данных.
2. Добавить безопасные structured reasons и локальные предупреждения для свободного текста.
3. Ограничить срок хранения browser draft.
4. Подготовить read-only preview возможной исторической очистки без вывода значений.
