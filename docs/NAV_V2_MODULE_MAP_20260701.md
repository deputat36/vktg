# Navigator v2 module map — 2026-07-01

## Goal

Separate daily work screens from diagnostics, legacy code and future integration layers.

## Daily work screens

These screens should be clean and role-based:

- dashboard-v2.html
- deals-v2.html
- deal-card-v2.html
- lawyer-v2.html or lawyer queue screen
- SPN wizard screen
- nav-access-v2.html for admin access work

Rules:

- no raw diagnostics for normal roles;
- clear primary action;
- empty states explain what to do;
- long names and emails must not break layout.

## Diagnostic screens

These screens are for owner/admin:

- diagnostics-v2.html
- data-quality-check-v2.html
- deal-access-check-v2.html
- frontend-rpc-coverage-check-v2.html
- nav-system-check-v2.html
- operations-health-check-v2.html
- rpc-grant-check-v2.html
- security-hardening-check-v2.html
- team-profile-quality-check-v2.html

Rules:

- keep out of normal role menu;
- use clear green/yellow/red summaries;
- link to fixes or docs;
- do not mix with daily task flow.

## Core frontend modules

Important modules:

- assets/js/nav-v2/supabase-v2.js
- assets/js/nav-v2/deals-v2.js
- assets/js/nav-v2/deal-card-v2.js
- assets/js/nav-v2/deals-responsible-spn-v2.js
- assets/js/nav-v2/deal-card-spn-responsibility-v2.js
- assets/js/nav-v2/admin-v2.js
- assets/js/nav-v2/admin-profile-editor-ux-v2.js
- assets/css/nav-v2.css

Rules:

- use RPC layer, not direct table access from frontend;
- keep escaping for user-visible names and comments;
- keep cache-bust updated after visible UI changes.

## Temporary or guard modules

These modules should be reviewed later:

- timeout recovery;
- action guards;
- role menu patches;
- SPN polish modules;
- handoff overlays;
- diagnostic shortcuts.

Decision for each:

- keep;
- merge into main module;
- hide;
- archive after replacement.

## Legacy and adjacent projects

Do not change during Navigator v2 cleanup unless explicitly planned:

- leader_* database objects;
- parket_* database objects;
- old integration modules outside nav-v2;
- legacy nav screens not used by Navigator v2.

## Future BAZA layer

Future knowledge base integration must use a separate layer:

- kb_* tables or read-only endpoint;
- no client personal data in BAZA;
- Navigator card shows hints by stable knowledge IDs;
- no write actions from Navigator to BAZA in first phase.
