# Supabase security deployment — manual review required

`supabase-security-review.sql` is a proposal only. It has not been applied to
production by this hardening branch.

## Mandatory order

1. Export and verify a current Supabase backup.
2. Create a separate staging Supabase project with the same `app_state` shape.
3. Find the manager's `auth.users.id` in the Supabase dashboard. Do not paste it
   into Git.
4. Review every statement in `supabase-security-review.sql`.
5. In staging, add `owner_id`, set it on the `main` row to the manager UUID, and
   verify it is not null.
6. Apply the remaining RLS policies and RPC functions in staging.
7. Test as:
   - anonymous browser: direct `app_state` SELECT/INSERT/UPDATE/DELETE denied;
   - manager session: only its owned row is readable and writable;
   - valid cleaner UUID + 32-hex token: only the limited task DTO is returned;
   - invalid/expired/cancelled token: no task data is returned;
   - cleaner patch containing an unknown key: rejected;
   - two concurrent cleaner task updates: neither task is lost.
8. Only after staging acceptance, schedule a maintenance window and repeat the
   reviewed sequence in production.
9. Deploy `cleaner.html` and the manager frontend only after the RPC functions
   exist. Deploying the frontend first will intentionally make the cleaner page
   unavailable, because it no longer has direct `app_state` access.

## Important limits

- `STATE_ROW_ID = main` is not an authorization boundary. `owner_id` plus RLS is.
- The browser uses only the publishable Supabase key. Never add `service_role`.
- The RPCs are `SECURITY DEFINER`; their allowlists, `search_path`, grants, token
  validation, and row lock must remain intact.
- The current JSON `app_state` architecture forces the server RPC to lock and
  update the state row internally. The cleaner browser never receives that row.
  A future normalized `cleaning_task_access` table would allow smaller database
  writes, native per-task RLS, token hashing, and easier rate limiting.
- Database-level rate limiting is not included. Add gateway/Edge Function rate
  limiting before exposing this flow to high-volume untrusted traffic.
