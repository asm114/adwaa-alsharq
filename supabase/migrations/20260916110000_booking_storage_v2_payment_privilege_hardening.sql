-- Booking storage v2 payment privilege hardening.
-- RLS already exposes only SELECT + INSERT policies for historical payment rows.
-- Remove table-level UPDATE/DELETE privileges as defense in depth so authenticated
-- clients cannot attempt to rewrite or delete the append-only ledger.

revoke update, delete on table public.payments from authenticated;
grant select, insert on table public.payments to authenticated;
