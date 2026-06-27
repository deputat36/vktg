# SPN UX iteration: overdue age in next actions

Date: 2026-06-27 03:00.

## Scope

Improved the SPN next-actions block in the deal card.

## Change

Overdue task/document due-date pills now show the age of the delay, not only the due date.

Example:

`просрочено 2 дня: 25.06.2026`

## Why

For SPN users, a plain overdue date is not enough for fast triage. Showing the number of overdue days makes it clearer which items need immediate escalation and reduces the chance that an old blocker is treated as a fresh one.

## Files

- `assets/js/nav-v2/spn-next-actions-v2.js`
- `deal-card-v2.html`

## Version

`spn-next-actions-v2.js?v=20260627-0300`

## Verification target

Profile:

- Овчинников Александр Константинович
- `a.k.ovchinnikov@borisoglebsk.etagi.com`
- role: `spn`

Deal:

`145c4a05-0a84-41ce-8e2c-65ddc25b7e06`

Expected for documents due on 2026-06-25 when current date is 2026-06-27:

- SPN overdue documents: `4`
- control overdue documents: `7`
- max overdue age: `2` days
- control role: `lawyer`

## Boundaries

CRM «Лидер» was not changed.
