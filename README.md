# Навигатор сделки СПН

Репозиторий полностью переведен под проект подготовки сделок специалистов по недвижимости.

## Структура

```text
index.html
assets/css/style.css
assets/js/app.js
data/*.json
config/supabase.js
supabase/schema.sql
```

## Что редактировать без изменения кода

- `data/office_settings.json` — офис, тарифы, юрист, менеджер, брокер.
- `data/staff.json` — сотрудники.
- `data/scenarios.json` — быстрые сценарии.
- `data/dictionaries.json` — справочники полей.
- `data/rules.json` — стоп-факторы и предупреждения.
- `data/client_messages.json` — сообщения клиентам.
- `data/local_borisoglebsk.json` — локальная специфика Борисоглебска.

## GitHub Pages

Включить: `Settings → Pages → Deploy from branch → main / root`.

## Supabase

1. Создать проект Supabase.
2. Выполнить `supabase/schema.sql` в SQL Editor.
3. Заполнить `config/supabase.js` публичными ключами.
4. Secret key и service_role key в браузерный код не вставлять.
