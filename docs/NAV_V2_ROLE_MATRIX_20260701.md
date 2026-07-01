# Navigator v2 role matrix — 2026-07-01

## Purpose

Make Navigator v2 clear for each office role. Every role should see its own daily work, not the full technical system.

## Roles

### owner

Needs:
- office status;
- data quality;
- risky deals;
- team load;
- access and security checks.

Should see:
- all deals;
- all responsible users;
- diagnostics;
- team editor;
- quality dashboard.

Should not be overloaded with:
- raw technical logs on the main screen.

### admin

Needs:
- users;
- roles;
- managers;
- active/inactive profiles;
- access diagnostics.

Should see:
- team editor;
- invite/access tools;
- profile quality warnings;
- audit pages.

Should not decide business risk unless also owner/manager.

### manager

Needs:
- team deals;
- weak preparation points;
- missing SPN, lawyer, broker;
- overdue tasks;
- handoff quality.

Should see:
- deals of the team;
- responsible SPN names;
- blockers;
- data quality summary for team.

Should not see low-level security checks by default.

### spn

Needs:
- own deals;
- what to fill;
- what documents to request;
- what blocks handoff;
- lawyer rework comments.

Should see:
- own responsibility zone;
- seller/buyer side;
- tasks;
- documents;
- rework status;
- knowledge hints later.

Should not see admin diagnostics.

### lawyer

Needs:
- queue;
- documents;
- legal risks;
- who prepares the deal;
- rework history.

Should see:
- legal queue;
- deal card;
- seller SPN and buyer SPN;
- blockers;
- review actions.

Should not edit team profiles.

### broker

Needs:
- mortgage-related deals;
- bank status;
- client and deal blockers;
- deadlines.

Should see:
- assigned broker deals;
- mortgage tasks;
- related documents;
- comments and status.

Should not see unrelated admin panels.

### viewer

Needs:
- safe read-only learning mode.

Should see:
- allowed deals or demo examples;
- instructions;
- knowledge hints.

Should not edit data.

## UI rule

Main screens must be role-based. Diagnostics stay available only for owner/admin or explicit diagnostic pages.
