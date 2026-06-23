# Статус: СПН UX iteration 2026-06-23 14:35

## Контекст

Продолжена доработка карточки сделки для роли СПН на примере профиля:

- Овчинников Александр Константинович
- a.k.ovchinnikov@borisoglebsk.etagi.com
- role: spn
- user id: 98ee4523-dacb-47c3-b458-97e524f92444

Цель итерации: снизить риск ошибочной проверки документов не тем специалистом. СПН должен иметь возможность фиксировать получение документа, но юридическую проверку юридических документов должен выполнять юрист.

## Backend

Добавлена функция:

- `public.nav_v2_can_change_document_status(p_document_id uuid, p_status text, p_uid uuid default auth.uid())`

Правила:

- `owner`, `admin`, `service_role` могут менять статусы.
- `manager` может менять статусы, если может редактировать сделку.
- Назначенный пользователь может менять статус своего документа.
- Ответственная роль может менять статус своего документа.
- `spn` с правом редактирования сделки может ставить безопасные статусы `needed`, `missing`, `requested`, `received` даже по документам другой роли.
- Для юридических документов СПН не может ставить `checked` и `problem`.

Обновлены RPC:

- `public.nav_v2_update_document_workflow(...)` теперь проверяет `nav_v2_can_change_document_status(...)` перед изменением статуса.
- `public.nav_v2_get_deal_card(uuid)` теперь возвращает для каждого документа флаги:
  - `can_change_status`
  - `can_mark_received`
  - `can_mark_checked`
  - `can_mark_problem`

Прямой `EXECUTE` для `authenticated` у helper-функции закрыт follow-up миграцией. Helper остается внутренним для основных SECURITY DEFINER RPC и доступен `service_role`.

## Frontend

Добавлен файл:

- `assets/js/nav-v2/document-action-guard-v2.js`

Подключен в:

- `deal-card-v2.html`

Поведение:

- Модуль читает `nav_v2_get_deal_card(...)`.
- Отключает кнопки документа, если соответствующий `can_mark_*` флаг равен `false`.
- Для недоступных действий добавляет пояснение: проверку и проблемные замечания фиксирует ответственный специалист, СПН может отметить получение документа.

## Проверка на Овчинникове

Контекст:

- JWT role: `authenticated`
- JWT sub: `98ee4523-dacb-47c3-b458-97e524f92444`
- сделка: `c290477b-aef3-4523-ae25-8d29f02b9552`

Юридические документы:

| Документ | responsible_role | can_mark_received | can_mark_checked | can_mark_problem |
| --- | --- | --- | --- | --- |
| Выписка ЕГРН | lawyer | true | false | false |
| Документ-основание права собственности | lawyer | true | false | false |
| Паспорт покупателя / всех покупателей | lawyer | true | false | false |
| Паспорт продавца / всех продавцов | lawyer | true | false | false |

Документы СПН:

| Документ | responsible_role | can_mark_received | can_mark_checked | can_mark_problem |
| --- | --- | --- | --- | --- |
| Адресная справка / сведения о зарегистрированных | spn | true | true | true |
| СНИЛС покупателя / всех покупателей | spn | true | true | true |

## Advisors

После follow-up миграции `nav_v2_can_change_document_status` не отображается как прямой authenticated SECURITY DEFINER RPC. Остались прежние общие WARN/INFO по существующим RPC, RLS/performance и leaked password protection.
