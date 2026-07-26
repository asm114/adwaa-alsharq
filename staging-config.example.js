// Copy locally to staging-config.js, which is ignored by Git.
// Use a dedicated Supabase Staging project and publishable/anon key only.
// Never place service_role, database passwords, or production values here.
window.ADWAA_STAGING_CONFIG = Object.freeze({
  supabaseUrl: 'https://<STAGING_PROJECT_REF>.supabase.co',
  publishableKey: '<STAGING_PUBLISHABLE_KEY>'
});

