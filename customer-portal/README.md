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

Migration is intentionally staged so adding this directory cannot alter the current production runtime.
