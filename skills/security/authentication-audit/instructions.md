# Authentication audit

## Goal

Determine whether identities are verified correctly and credentials are protected.

## When to use

- The user asks how authentication works or whether it is secure.
- A security review reaches login, session, token or credential code.

## When not to use

- Questions about who may access what after login: that is authorization.
- No authentication exists in scope: say so and stop.

## Procedure

1. Reuse the repository map, or run `repository-discovery` if none exists.
2. Locate authentication code.
   Search (case-insensitive) for: `login|logout|sign_?in|sign_?up|password|passwd|credential|session|token|jwt|oauth|saml|auth|mfa|otp|reset`
3. Inventory the mechanisms present: passwords, server sessions, bearer or signed tokens, API
   keys, external identity providers, service-to-service credentials. If none, report that with
   the searched terms and stop.
4. For each mechanism present, read only its reference: stored credentials ->
   `references/credential-storage.md`; sessions or cookies -> `references/session-management.md`;
   tokens or API keys -> `references/token-validation.md`.
5. Check the flows that exist: login (brute-force protection, generic errors), registration,
   password reset (unpredictable, expiring, single-use tokens), logout (server-side
   invalidation), MFA (no bypass path).
6. Confirm credentials only travel over encrypted transport and are absent from logs and URLs.
7. Report with `evidence-reporting`.

## Done when

- Every mechanism in the inventory was checked against its reference.
- Missing mechanisms are stated as absent, not as vulnerabilities.
