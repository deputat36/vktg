# SPN UX iteration 2026-06-23 17:25

Scope: SPN new deal wizard safety.

## Changed

- Added `assets/js/nav-v2/spn-draft-guard-v2.js`.
- Connected it in `spn-v2.html` with cache version `20260623-1725`.
- If the browser already has a local new-deal draft, the wizard now shows a top guard panel before the form:
  - confirms that this is only a local draft, not a CRM deal;
  - summarizes the current scenario, side, stage, object and address;
  - highlights missing critical fields before saving;
  - provides a clear `Начать заново` action that removes the local draft and reloads the wizard.

## Why

A stale local draft can cause СПН to accidentally continue or save an old client scenario. The guard makes the current draft visible before the user invests time or creates a duplicate/wrong deal.

## Safety

- CRM `Лидер` was not touched.
- No Supabase schema or data changes in this iteration.
- The module only reads and clears the browser-local `nav_deal_draft_v2` key after explicit user confirmation.
