# Архитектура проекта

Проект: Навигатор сделки СПН.

Текущая стабильная ветка развития: `v7.4.x`.

## Назначение

Инструмент помогает специалисту по недвижимости подготовиться к сделке:

- выбрать сценарий сделки;
- заполнить данные объекта, сторон, расчетов и документов;
- указать комиссии, расходы и распределение ответственности;
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

## Что находится в основной форме

В `index.html` теперь находятся не только базовые поля объекта, но и рабочие блоки:

```text
Основное
Стороны сделки
Объект
Финансы / комиссии / расходы
Основания, расчет, особенности
Документы
```

Блоки «Стороны сделки» и «Финансы / комиссии / расходы» больше не создаются временным патчем.

## Основная отрисовка

`assets/js/ui/render.js` отвечает за:

- сводку по сделке;
- блок «Стороны и деньги» в сводке;
- карточку юристу;
- блок «Стороны / комиссии / расходы для юриста»;
- карточку брокеру;
- документы;
- сообщения клиенту;
- локальную информацию по Борисоглебску.

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

Мост между основной страницей и открытой сделкой Supabase. Позже его желательно заменить более прямой логикой состояния приложения.

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

Теперь не восстанавливает поля формы. Отвечает только за вкладку «Финансы» и финансовую сводку.

```text
assets/js/integrations/auditAndPatches.js
```

Теперь диагностический модуль вкладки «Проверка». Не должен добавлять рабочую бизнес-логику.

```text
assets/js/integrations/testSuite.js
```

Браузерные тесты интерфейса и сценариев.

## Оставшийся архитектурный долг

- `cloudAutoPatch.js` нужно постепенно заменить нормальным состоянием приложения: `currentDealId`, `currentDealTitle`, `currentUser`.
- `loginFix.js` можно будет объединить с основным Supabase-модулем после стабилизации.
- Нужна отдельная страница `deals.html` для полноценного списка сделок.
- Нужны статусы сделки как отдельный рабочий процесс.
- Нужно связать решения юриста/брокера/менеджера с автоматическим созданием задач.
- Нужен экспорт/печать PDF для юриста, брокера и клиента.

## Рекомендуемая следующая структура

```text
deals.html
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
6. Проверить вкладки «Решения» и «Задачи».
