# Статус: СПН UX iteration 2026-06-23 14:20

## Что улучшено

В RPC `public.nav_v2_get_deal_card(uuid)` добавлено поле `can_change_status` для каждой задачи в массиве `tasks`.

Это снижает риск рассинхронизации между интерфейсом и серверными правами: карточка сделки получает не только данные задачи, но и готовое backend-решение, может ли текущий пользователь менять статус этой задачи.

## Миграция

Добавлен файл:

- `supabase/migrations/20260623142000_navigator_add_task_can_change_status_to_deal_card.sql`

Функция также явно ограничивает EXECUTE:

- `revoke all ... from public, anon`
- `grant execute ... to authenticated, service_role`

## Проверка на профиле СПН

Контекст проверки:

- role claim: `authenticated`
- sub claim: `98ee4523-dacb-47c3-b458-97e524f92444`
- профиль: Овчинников Александр Константинович, роль `spn`
- сделка: `c290477b-aef3-4523-ae25-8d29f02b9552`

Результат `nav_v2_get_deal_card(...)->tasks`:

| Задача | assigned_role | can_change_status |
| --- | --- | --- |
| Проверка банка / ипотеки / маткапитала | broker | false |
| Согласовать порядок расчетов | spn | true |
| Юридическая проверка до задатка | lawyer | false |

## Текущее состояние frontend

`assets/js/nav-v2/deal-card-v2.js` уже скрывает кнопки смены статуса для задач чужой роли и показывает пояснение. Следующий технический шаг: перевести frontend на приоритетное использование `task.can_change_status` из RPC, оставив локальную проверку только fallback для старого ответа API.
