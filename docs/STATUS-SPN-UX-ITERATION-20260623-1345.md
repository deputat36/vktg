# SPN UX iteration 2026-06-23 13:45

## Scope

Continued SPN usability and risk-reduction work after the deals/dashboard readability iteration.

## Changes

- Supabase function `public.nav_v2_get_deals_list(integer)`:
  - Enriched the returned `profile` object with `phone`, `manager_id`, and `manager_name`.
  - Added `display_title` for each deal so clients can show readable deal names when stored titles are generic, for example:
    - `Доля / комната — пер. Ольховый 6`
    - `Доля — адрес уточняется`
    - `Дом с участком — Чкалова 4 кв 44`
  - Kept explicit RPC grants: revoked from `public` and `anon`, granted to `authenticated` and `service_role`.

- Repository migration added:
  - `supabase/migrations/20260623134500_navigator_enrich_deals_list_profile.sql`

- `deal-card-v2.html`:
  - Removed legacy `spn-task-guard-v2.js` overlay from production loading.
  - Bumped deal-card asset versions to `20260623-1345`.
  - Rationale: server-side task-status permissions are now the source of truth; removing extra overlay code reduces frontend regression risk.

## Verification

Checked with authenticated JWT simulation for Ovchinnikov Alexander Konstantinovich (`98ee4523-dacb-47c3-b458-97e524f92444`):

- `nav_v2_get_deals_list(20)` returns 3 deals.
- Returned profile includes `role`, `phone`, `manager_id`, and `manager_name`.
- Returned deal `display_title` values are readable and do not expose placeholder seller/buyer names.
- Function privileges:
  - `anon`: no execute
  - `authenticated`: execute
  - `service_role`: execute

Supabase security advisors still report the existing broad SECURITY DEFINER warning class for many public RPC functions; no new category was introduced by this iteration.