# Grants stage

Run the labelled `06-grants` section from `supabase-security-review.sql`
immediately after the RPC definitions in the same transaction. Helper functions
receive no client EXECUTE privilege; only the two limited RPCs are granted to
`anon` and `authenticated`, after explicit revocation from `PUBLIC`.

