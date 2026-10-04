# Booking Storage v2 — Cutover & Rollback Runbook

> Status: pre-production only. This document does not authorize or perform Production writes.
> No migration, merge, deployment, or dual-write enablement may occur without explicit owner approval.

## Current pre-cutover baseline

- Production project: `pgdvlklpyrvmwzitsmbw`
- Legacy source of truth: `public.app_state`, row `id='main'`
- Baseline at final pre-production verification:
  - 28 bookings
  - 14 payment movements
  - booking total: 24,000 SAR
  - payment total: 6,084 SAR
  - app_state hash: `4127b366f2d09ab3368c2b0de05356e9`
- No booking-v2 schema/functions/rows are present in Production yet.
- PR #132 remains Draft and unmerged.

## Non-negotiable invariants

1. Never delete or rewrite a historical payment movement.
2. Never overwrite a newer booking revision with a stale edit.
3. Never allow two active non-cancelled bookings to occupy the same resort date.
4. Keep the exact pre-cutover `app_state/main` snapshot for audit/recovery.
5. During transition, v2 is authoritative for booking writes; the existing `persist()` path keeps `app_state` as a rollback-compatible mirror.
6. Do not use legacy full-state backup restore while v2 dual-write is enabled. It bypasses v2 and could diverge financial history.
7. Do not drop v2 tables/functions during rollback. Rollback is an application-routing operation plus a guarded reconciliation of `app_state.bookings`.

## Cutover sequence

### Gate 0 — explicit approval

Stop. Obtain explicit owner approval before the first Production write.

### Gate 1 — final read-only baseline

Immediately before migration:

- read `app_state/main` and record `updated_at` + md5 hash;
- recount bookings and payment movements;
- recalculate booking/payment totals;
- export a fresh human-readable backup if the baseline changed since the previous export;
- verify there is still no partial v2 migration residue;
- verify active booking date-overlap pairs = 0.

If any value is unexpected, stop and investigate before writing anything.

### Gate 2 — apply schema/backfill only

Apply PR #132 migrations in order. Do **not** enable the application bridge yet.

Expected effects:

- create immutable migration snapshot(s);
- extend normalized reservation/payment storage;
- backfill one normalized reservation per legacy booking;
- backfill one ledger row per payment movement;
- install revision protection, append-only financial protections, date-overlap protection, grant hardening, and soft delete support.

Legacy `app_state/main` remains untouched as the running application source at this point.

### Gate 3 — immediate database parity

Before any deployment/bridge activation, require all of the following:

- legacy bookings = v2 bookings;
- legacy payments = v2 payments;
- missing bookings = 0;
- extra bookings = 0;
- `legacy_payload` mismatches = 0;
- booking total matches the final baseline;
- payment total matches the final baseline;
- migration snapshot contains the exact baseline booking count/hash;
- no active date overlaps;
- payment UPDATE/DELETE privileges remain revoked for `authenticated`;
- reservation hard DELETE remains revoked for `authenticated`.

Any failure => stop. The existing Production application is still on `app_state`, so no application rollback is needed yet.

### Gate 4 — real manager Auth/PostgREST preflight

This is the remaining test that cannot be represented by the management SQL connector because it cannot assume the normal `authenticated` PostgREST role.

Using the real manager browser session:

1. confirm manager can read normalized reservations;
2. confirm manager can invoke the revision-checked save RPC;
3. confirm a non-manager/anonymous session cannot read/write v2 booking data;
4. create one clearly identified non-conflicting migration-preflight booking on a remote future date;
5. read it back;
6. modify it with the correct revision;
7. verify stale revision rejection;
8. append a test payment and confirm retry does not duplicate it;
9. soft-delete the preflight booking and confirm the payment history remains preserved;
10. confirm the soft-deleted date is reusable.

The preflight booking must never be mirrored into the live legacy booking list before the bridge is enabled.

Any failure => stop; keep legacy application authoritative.

### Gate 5 — deploy helper code, still inert

Deploy the PR code with the v2 helper scripts present but **without** calling:

`__adwaaBookingV2DualWrite.install({enable:true})`

Confirm the current application still loads and operates normally from `app_state`.

### Gate 6 — preflight comparison and enable dual-write

From the authenticated manager application:

1. call the v2 bridge `preflight()`;
2. require exact legacy/v2 parity;
3. only if parity is exact, explicitly enable the bridge;
4. the bridge then serializes `persist()` calls, writes booking changes to v2 first, verifies them, and only then runs the existing `app_state` persist path.

No automatic enablement is permitted in source code.

### Gate 7 — controlled live smoke test

Perform one controlled booking workflow from the real application:

- open an existing booking without changing it;
- create a clearly identified test booking on a safe future date;
- verify read-back;
- edit it and verify revision increase;
- append a small test payment movement only if explicitly acceptable for the test record;
- verify payment row identity survives another booking edit;
- verify an overlapping booking is rejected;
- soft-delete the test booking;
- verify the date becomes available again;
- verify `app_state.bookings` mirrors the active v2 booking set after the normal persist path.

Do not delete historical payment rows during cleanup; the test booking remains soft-deleted audit history.

### Gate 8 — operational acceptance

For an initial observation window:

- keep v2 authoritative for bookings;
- keep `app_state.bookings` mirrored by the existing persist path;
- keep the immutable pre-cutover snapshot;
- monitor revision conflicts, save/read-back errors, portal synchronization, and payment integrity;
- keep legacy full-state restore guarded while dual-write is enabled.

Only after stable operation should a later PR consider removing the booking dependency on `app_state`. That is outside PR #132.

## Emergency rollback after dual-write has been enabled

### Step R1 — freeze booking writes

Stop booking edits briefly so the rollback mirror cannot change while reconciliation runs.

### Step R2 — reconcile v2 back into `app_state.bookings`

Run the reviewed manual script:

`scripts/booking-v2-rollback-reconcile.sql`

The script:

- locks `app_state/main` for the transaction;
- snapshots the current legacy state again;
- rejects structurally invalid active v2 bookings;
- rejects any payment count/hash/paid-total mismatch;
- excludes soft-deleted bookings;
- replaces **only** the `bookings` key of `app_state.data`;
- leaves expenses, settings, audit, cleaning data, subscriptions, and other keys unchanged;
- verifies final active booking counts before commit;
- never deletes or modifies v2 reservation/payment history.

If any check fails, the transaction aborts. Do not deploy the old application until the discrepancy is resolved.

### Step R3 — verify rollback mirror

Require:

- active v2 booking count = `app_state.bookings` count;
- every active booking payload/payment set matches;
- payment row count/total is unchanged;
- non-booking `app_state` hash is unchanged from immediately before reconciliation.

### Step R4 — disable v2 application routing

Disable/uninstall the v2 dual-write bridge or deploy the last stable pre-v2 application revision.

### Step R5 — keep v2 intact

Do **not** drop normalized tables, payment ledger, snapshots, constraints, or soft-deleted audit rows. They remain the forensic/recovery source if later investigation is required.

## What rollback does not mean

Rollback does not mean restoring the original day-zero snapshot over current data. That would discard legitimate bookings/payments created after cutover. The rollback path always reconciles the **latest authoritative v2 state** into `app_state.bookings` first, then switches the application back to the legacy read/write route.
