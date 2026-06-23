# SPN hotfix 2026-06-23

## Incident

User reported that when signing in as Ovchinnikov Alexander Konstantinovich (`a.k.ovchinnikov@borisoglebsk.etagi.com`, role `spn`) the deals list did not load and the new deal flow was not available.

## Actions

- Removed the new SPN polish overlay from `deals-v2.html` to restore the stable deals list boot path.
- Removed the new profile warning overlay from `dashboard-v2.html` to restore the stable dashboard boot path.
- Removed production loading of `spn-test-mode-banner-v2.js` and `spn-test-save-guard-v2.js` from `spn-v2.html`; those scripts are test-only and must not block real SPN deal creation.
- Bumped page asset query versions to `20260623-1315` on the affected pages to force browsers to fetch a consistent bundle.
- Kept the server-side task permission fix from `20260623130000_navigator_restrict_task_status_by_role.sql`; it is unrelated to loading deals or creating deals.

## Verification

Checked Supabase with an authenticated JWT simulation for user `98ee4523-dacb-47c3-b458-97e524f92444`:

- `nav_v2_get_my_profile()` returns the Ovchinnikov SPN profile.
- `nav_v2_get_deals_list(20)` returns 3 deals.
- `nav_v2_save_wizard_result(...)` accepts a valid new-deal payload and returns a draft deal result inside a rollback transaction.

No real test deal was persisted.