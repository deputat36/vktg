# Navigator v2 — legal semantics wave 2 qualification

Дата: 20 июля 2026 года.

## Назначение

Repository-only квалификация четырёх catalog-driven правил без изменения runtime и effective support inventory:

- `bankruptcy_risk`;
- `redevelopment`;
- `after_registration`;
- `certificate`.

Базовая effective точка после wave 1 остаётся 17 supported / 8 unsupported. Этот пакет только доказывает, что server output для четырёх кандидатов соответствует versioned catalog. Promotion в 21/4 допускается только отдельной integration wave.

## Exact catalog contract

### bankruptcy_risk

- owner: lawyer;
- risk: yellow;
- blocks deposit/deal: true/true;
- request: `check_bankruptcy`;
- document: `bankruptcy_check`, seller, seller SPN.

### redevelopment

- owner: lawyer;
- risk: yellow;
- blocks deposit/deal: false/false;
- request: `check_redevelopment`;
- documents: `technical_plan`, `redevelopment_approval`, object, lead SPN.

### after_registration

- owner: lawyer;
- risk: yellow;
- blocks deposit/deal: true/false;
- request: `check_post_registration_payment`;
- document: `settlement_scheme`, deal, lead SPN.

### certificate

- owner: lawyer;
- risk: yellow;
- blocks deposit/deal: false/false;
- request: `design_safe_structure`;
- document: `certificate_terms`, buyer, buyer SPN.

## Qualification gate

Правило квалифицируется только когда одновременно подтверждены:

- server matched rule;
- fact value `yes`;
- evidence source `client` или `document`;
- exact risk level и block flags;
- exact lawyer task contract;
- полный набор required documents с известными статусами;
- exact document title, side и owner role;
- resolved lawyer UUID;
- handoff state `ready` или `urgent_incomplete`;
- отсутствие broker task для правила;
- adapter gate allowed.

Массив required documents сравнивается как нормализованный набор. Это сохраняет exact semantic contract и исключает ложный отказ из-за порядка элементов.

## PostgreSQL 17 evidence

Проверяются:

- четыре отдельные positive scenarios;
- combined scenario с seller/object/deal/buyer документами;
- неизменность effective inventory 17/8;
- zero business writes;
- no broker leakage;
- unchecked evidence;
- отсутствующий статус документа;
- unresolved lawyer;
- tampered document side;
- tampered risk;
- blocked handoff;
- invalid UUID;
- overlay rollback с сохранением base adapter и marker rows.

## Границы

- production migration отсутствует;
- Supabase production не изменяется;
- Edge и frontend не подключаются;
- wave 1 integration не расширяется;
- `production_ready=false`;
- `changes_supported_inventory=false`;
- cleanup 46 legacy quality rows остаётся owner-gated.
