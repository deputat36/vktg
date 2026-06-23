# Статус: СПН UX, ограничение статусов сделки

Дата: 2026-06-23 15:05
Профиль проверки: Овчинников Александр Константинович, a.k.ovchinnikov@borisoglebsk.etagi.com, роль СПН
Тестовая сделка: c290477b-aef3-4523-ae25-8d29f02b9552

## Зачем

У СПН есть право редактировать рабочую подготовку сделки, но финальные статусы не должны фиксироваться с рабочего места СПН. Иначе повышается риск преждевременного закрытия, отмены или перевода сделки в этапы, которые должны подтверждать руководитель или ответственный управленец.

## Что изменено на сервере

- Добавлен внутренний helper `nav_v2_can_change_deal_status(p_deal_id, p_status, p_uid)`.
- Helper разрешает СПН, юристу и брокеру менять только рабочие статусы подготовки при наличии `can_edit_deal`.
- Финальные статусы для неуправленческих ролей закрыты: `deposit_done`, `registration`, `registered`, `closed`, `cancelled`.
- Руководитель, владелец сделки, администратор и service_role сохраняют полный доступ по статусам.
- `nav_v2_update_deal_status` теперь проверяет helper перед изменением статуса и возвращает понятную ошибку: `Этот статус доступен только руководителю или ответственному управленцу сделки`.
- Добавлен публичный для authenticated RPC `nav_v2_get_deal_status_options(p_deal_id)`, чтобы интерфейс показывал доступные и закрытые статусы без дублирования логики в JS.
- Helper оставлен внутренним: `authenticated=false`, `anon=false`, `service_role=true`.

Миграция в репозитории: `supabase/migrations/20260623150500_navigator_restrict_deal_status_by_role.sql`.

## Что изменено в интерфейсе

- Добавлен `assets/js/nav-v2/deal-status-guard-v2.js`.
- В `deal-card-v2.html` подключен guard с версией `?v=20260623-1505`.
- Guard вызывает `nav_v2_get_deal_status_options`, отключает запрещенные пункты в `#dealStatus`, блокирует быстрые кнопки `data-quick-status` и показывает пояснение для СПН.

## Проверка под Овчинниковым

Контекст JWT:

- `auth.uid() = 98ee4523-dacb-47c3-b458-97e524f92444`
- `nav_v2_my_role(auth.uid()) = spn`
- `nav_v2_can_edit_deal(...) = true`

Матрица статусов:

- Разрешены: `draft`, `need_info`, `need_lawyer`, `need_broker`, `need_documents`, `ready_for_deposit`, `preparing_deal`, `ready_for_deal`.
- Запрещены: `deposit_done`, `registration`, `registered`, `closed`, `cancelled`.

## Границы изменения

CRM `Лидер` не затрагивалась. Изменения ограничены `nav_v2_*`, карточкой сделки v2 и документацией итерации.
