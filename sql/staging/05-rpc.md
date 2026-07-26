# RPC stage

Run only the clearly labelled `05-rpc` section from
`supabase-security-review.sql`. It includes:

- strict photo/issue normalization helpers;
- limited `cleaner_get_task`;
- optimistic-concurrency `cleaner_update_task`;
- removal of the obsolete three-argument update function.

The section remains in one reviewed transaction bundle with its grants to avoid
deploying a partially defined public RPC.

