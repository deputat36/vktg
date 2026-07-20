# Navigator v2 — special semantics qualification

Дата: 20 июля 2026 года.

## Назначение

Repository-only qualification четырёх оставшихся fail-closed правил:

- `legal_problem`;
- `partner_agency`;
- `flat_ground`;
- `house_land`.

Effective baseline остаётся 21 supported / 4 unsupported. Пакет не выполняет promotion и не подключает runtime.

## Отличие от fact rules

Эти правила нельзя квалифицировать через искусственный `fact=yes`:

- `legal_problem` срабатывает по `stage=legal_problem`;
- `partner_agency` срабатывает по `representation=partner_agency`;
- `flat_ground` срабатывает по `objectType=flat_ground`;
- `house_land` срабатывает по `objectType=house_land`.

Qualifier повторно сверяет trigger kind/value с server-prepared draft.

## Exact catalog contract

### legal_problem

- owner: lawyer;
- risk: red;
- blocks deposit/deal: true/false;
- request: `assess_urgent_case`;
- expected decision: первый безопасный шаг и перечень необходимых данных;
- required documents: пустой набор;
- task evidence: `structured_legal_decision`.

Пустой document set является самостоятельным контрактом. Любой document candidate, помеченный `legal_problem`, считается tamper.

### partner_agency

- owner: lawyer;
- risk: yellow;
- blocks deposit/deal: false/false;
- request: `check_partner_deal`;
- document: `partner_responsibility_note`, deal, lead SPN.

### flat_ground

- owner: lawyer;
- risk: yellow;
- blocks deposit/deal: true/false;
- request: `design_safe_structure`;
- documents: `land_status`, `object_title_basis`, object, lead SPN.

### house_land

- owner: lawyer;
- risk: yellow;
- blocks deposit/deal: false/false;
- request: `check_document_package`;
- documents: `house_title_basis`, `land_title_basis`, `boundary_status`, object, lead SPN.

## Qualification gate

Для matched rule обязательны:

- exact non-fact trigger;
- exact risk, block flags и required-document set;
- lawyer-only task;
- exact evidence type и expected result;
- exact document title/side/owner/status либо explicit empty set;
- resolved lawyer UUID;
- handoff state `ready` или `urgent_incomplete`;
- adapter gate allowed;
- отсутствие broker leakage.

## PostgreSQL 17 evidence

Проверяются:

- четыре отдельные positive scenarios;
- `legal_problem` с urgent-incomplete handoff без required documents;
- partner deal document scope;
- flat/house object document scopes;
- два composite scenarios, потому что `flat_ground` и `house_land` взаимоисключающие object types;
- union composite coverage всех четырёх rules;
- trigger tamper;
- unexpected document у `legal_problem`;
- missing partner/house document statuses;
- tampered flat document side;
- unresolved lawyer;
- broker leakage;
- blocked handoff;
- invalid UUID;
- zero business writes;
- overlay и base rollback.

## Границы

- support inventory остаётся 21/4;
- production migration отсутствует;
- Supabase production не изменяется;
- Edge и frontend не подключаются;
- final 25/0 integration требует отдельного PR;
- authenticated E2E и owner deployment approval остаются обязательными;
- cleanup 46 legacy quality rows остаётся owner-gated.
