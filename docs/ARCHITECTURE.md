# Архитектура проекта

Проект: Навигатор сделки СПН.

Текущая стабильная версия: `v7.4.0-stable`.

## Назначение

Инструмент помогает специалисту по недвижимости подготовиться к сделке:

- выбрать сценарий сделки;
- заполнить данные объекта, сторон, расчетов и документов;
- получить рекомендации, риски и стоп-факторы;
- сформировать карточку юристу;
- сохранить сделку в Supabase;
- передать задачу юристу, брокеру или менеджеру;
- вести решения и задачи по сделке.

## Основные файлы

```text
index.html
assets/css/style.css
assets/js/app.js
assets/js/core/utils.js
assets/js/core/data.js
assets/js/core/storage.js
assets/js/core/engine.js
assets/js/ui/form.js
assets/js/ui/render.js
```

## Данные

```text
data/office_settings.json
data/staff.json
data/scenarios.json
data/dictionaries.json
data/documents.json
data/rules.json
data/banks.json
data/client_messages.json
data/local_borisoglebsk.json
```

## Supabase

Используются отдельные таблицы с префиксом `nav_`:

```text
nav_profiles
nav_deals
nav_deal_comments
nav_deal_tasks
nav_deal_reviews
```

Это сделано, чтобы не конфликтовать с другим проектом в том же Supabase.

## Интеграционные модули

```text
assets/js/integrations/supabase.js
```

Собственный минимальный клиент Supabase REST/Auth. Используется вместо `@supabase/supabase-js`, чтобы не зависеть от стороннего CDN.

```text
assets/js/integrations/supabaseDeals.js
```

Открытие и обновление сохраненных сделок.

```text
assets/js/integrations/cloudAutoPatch.js
```

Связь текущего интерфейса с открытой сделкой Supabase.

```text
assets/js/integrations/reviews.js
assets/js/integrations/reviewPanel.js
```

Решения юриста, брокера, менеджера и админа.

```text
assets/js/integrations/tasks.js
assets/js/integrations/taskPanel.js
```

Задачи по сделке.

```text
assets/js/integrations/loginFix.js
```

Понятное состояние входа и запасной обработчик авторизации.

```text
assets/js/integrations/financeRestore.js
```

Временный модуль восстановления полей сторон, комиссий и расходов.

```text
assets/js/integrations/auditAndPatches.js
```

Временный модуль проверки системы и добавления финансов в карточку юристу.

```text
assets/js/integrations/testSuite.js
```

Браузерные тесты интерфейса и сценариев.

## Главный архитектурный долг

`financeRestore.js` и `auditAndPatches.js` должны быть постепенно разобраны:

- поля сторон и финансов перенести в основную форму;
- финансовую сводку и блок юристу перенести в `ui/render.js`;
- `auditAndPatches.js` оставить только для проверки, без рабочей бизнес-логики.

## Рекомендуемая следующая структура

```text
pages/deals.html или deals.html
assets/js/pages/deals.js
assets/js/modules/deal-status.js
assets/js/modules/auto-tasks.js
assets/js/modules/print.js
```

## Правило разработки

Перед каждым крупным изменением:

1. Проверить вкладку «Проверка».
2. Проверить вкладку «Тесты».
3. Сохранить сделку в Supabase.
4. Открыть сделку из Supabase.
5. Проверить восстановление полей сторон и финансов.
