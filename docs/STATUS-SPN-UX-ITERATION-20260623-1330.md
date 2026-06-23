# SPN UX iteration 2026-06-23 13:30

## Scope

Continued improvements after the SPN loading hotfix, with focus on Ovchinnikov Alexander Konstantinovich (`a.k.ovchinnikov@borisoglebsk.etagi.com`, role `spn`).

## Changes

- `assets/js/nav-v2/deals-v2.js`
  - Replaced generic list titles like `Продавец не указан / Покупатель не указан` with display titles based on object type and address.
  - Added responsible-party text for SPN-created deals when seller/buyer names are missing.
  - Adjusted SPN hero text, KPI labels, filter labels, search coverage, and empty state.
  - Added reset-filter action in the empty state.

- `deals-v2.html`
  - Bumped asset versions to `20260623-1325`.

- `assets/js/nav-v2/dashboard-v2.js`
  - Added the same readable deal-title fallback on the dashboard.
  - Added an integrated SPN profile warning when manager or phone is missing.
  - Added manager and phone rows to the dashboard profile block.
  - Adjusted SPN-specific heading and KPI label.

- `dashboard-v2.html`
  - Bumped asset versions to `20260623-1330`.

## Verification

Supabase check with authenticated JWT simulation for user `98ee4523-dacb-47c3-b458-97e524f92444`:

- role: `spn`
- manager_name: `null`
- phone: `null`
- visible deals: `3`

This confirms the profile warning is expected and the deals list data is still available.