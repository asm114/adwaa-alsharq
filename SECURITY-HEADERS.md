# Security headers deployment review

GitHub Pages does not provide repository-controlled HTTP response headers. The
HTML files therefore contain a compatible transitional CSP meta policy and a
referrer policy. A meta policy cannot enforce `frame-ancestors`, and the current
single-file application still requires `'unsafe-inline'` for its existing
inline scripts, styles, and event handlers.

For production hosting on a platform that supports response headers, review and
apply:

```text
Content-Security-Policy: default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' https://cdn.jsdelivr.net https://accounts.google.com; style-src 'self'; img-src 'self' data: blob: https:; connect-src 'self' https://pgdvlklpyrvmwzitsmbw.supabase.co wss://pgdvlklpyrvmwzitsmbw.supabase.co https://accounts.google.com https://www.googleapis.com https://*.googleapis.com; frame-src https://accounts.google.com; worker-src 'self'; manifest-src 'self'; font-src 'self' data:; media-src 'self'; upgrade-insecure-requests
Referrer-Policy: strict-origin-when-cross-origin
X-Content-Type-Options: nosniff
Permissions-Policy: camera=(self), microphone=(self), geolocation=(), payment=(), usb=()
Cross-Origin-Opener-Policy: same-origin-allow-popups
Cross-Origin-Resource-Policy: same-site
```

Before removing `'unsafe-inline'` from the deployed CSP, move all inline scripts,
styles, and event handlers to same-origin static files and test Google Identity
Services popup login. `Cross-Origin-Opener-Policy: same-origin` alone can break
OAuth popups; use `same-origin-allow-popups` for this application.

Do not add `Access-Control-Allow-Origin: *` to Supabase or backup endpoints.
