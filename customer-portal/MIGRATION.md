# Customer Portal — Unified Repository Migration

This directory is the target location for the customer portal inside `asm114/adwaa-alsharq`.

## Safety contract
- The administration backend remains isolated from the customer-portal backend.
- Administration Supabase production: `pgdvlklpyrvmwzitsmbw`.
- Customer portal Supabase production: `ztqqdjryvecscidxxbfe`.
- Do not repoint either application to the other database.
- The existing portal repository remains the production/reference source until parity tests pass.
- No production deployment may switch to this directory until both administration and portal tests pass.

## Migration source
Current portal source: `asm114/adwaa-alsharq-customer-portal`.

## Target layout
- `customer-portal/` — customer-facing portal application
- root application — administration/bookings
- shared integration tests — verify booking-to-portal availability synchronization

The imported files are an exact copy of the source repository, except its
GitHub Pages workflow is not active here. The original repository and its
production deployment remain intact. The root application still owns the
booking synchronization; both applications use the portal database's
`customer_portal_unavailable_periods` table.

Run `node --test tests/*.test.mjs` from the repository root and `npm test`
from this directory. The imported `supabase/migrations` directory is a
historical copy for the portal database only. Never apply it to the root
administration database. In particular, its legacy cleanup migration drops
old `app_state` and `resort_bookings` tables within the portal database.

Opening the customer portal runs its existing visit-counter RPC against its
configured production database. Use an isolated portal backend for an
interactive preview; a static build alone does not establish functional parity.
