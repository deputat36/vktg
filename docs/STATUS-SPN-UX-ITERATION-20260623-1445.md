# Статус: СПН UX/security iteration 2026-06-23 14:45

## Что сделано

### 1. Закрыт прямой доступ к helper-функции задач

Функция `public.nav_v2_can_change_task_status(uuid, uuid)` больше не доступна для прямого вызова из роли `authenticated`.

Новый режим доступа:

| Роль | EXECUTE |
| --- | --- |
| anon | false |
| authenticated | false |
| service_role | true |

Причина: frontend не должен вызывать helper напрямую. Карточка сделки получает готовое поле `task.can_change_status`, а изменение статуса выполняется через основной RPC `nav_v2_update_task_status(...)`.

Добавлена миграция:

- `supabase/migrations/20260623144500_navigator_keep_task_permission_helper_internal.sql`

### 2. Проверка под Овчинниковым

Контекст:

- JWT role: `authenticated`
- JWT sub: `98ee4523-dacb-47c3-b458-97e524f92444`
- роль профиля: `spn`
- сделка: `c290477b-aef3-4523-ae25-8d29f02b9552`

`nav_v2_get_deal_card(...)` продолжает возвращать корректные флаги задач:

| Задача | assigned_role | can_change_status |
| --- | --- | --- |
| Проверка банка / ипотеки / маткапитала | broker | false |
| Согласовать порядок расчетов | spn | true |
| Юридическая проверка до задатка | lawyer | false |

### 3. Улучшен frontend-guard документов

Файл:

- `assets/js/nav-v2/document-action-guard-v2.js`

Изменения:

- Технические роли заменены на понятные подписи: `юрист`, `СПН`, `брокер`, `менеджер`.
- Недоступные кнопки документов визуально приглушаются.
- После действия с документом guard перечитывает права через `nav_v2_get_deal_card(...)`.
- В `deal-card-v2.html` версия подключения обновлена до `document-action-guard-v2.js?v=20260623-1445`.

## Результат

Для СПН карточка стала понятнее и безопаснее:

- задачи чужих ролей остаются видимыми для контроля, но без лишних действий;
- документы юриста нельзя ошибочно отметить как `Проверен` или `Проблема` от имени СПН;
- helper-функции прав постепенно переводятся из публичной поверхности в внутренний слой RPC.

## Advisors

После закрытия `nav_v2_can_change_task_status(...)` helper больше не отображается в security advisors как прямой authenticated SECURITY DEFINER endpoint. Остались прежние общие предупреждения по рабочим RPC и настройкам Auth.
