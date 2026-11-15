# APIs, external integrations and supply chain

## APIs

- Responses return only the fields the caller needs (no internal or other users' data).
- Inputs are validated against an explicit schema; unknown fields are rejected or ignored, never
  bound to internal objects (mass assignment, CWE-915).
- Rate or resource limits on expensive and authentication endpoints (CWE-770, CWE-307).
- Object and function level access: hand off to the authorization audit when checks are missing.
- Old or undocumented endpoints receive the same checks as current ones.

## External integrations

- Outbound calls use TLS with verification, timeouts and bounded retries.
- Incoming webhooks and callbacks verify a signature or shared secret.
- Data from third-party services is validated like user input before use.

## Dependencies and supply chain

- Report dependency names and versions only from lock or manifest files you read. Never claim a
  CVE without a source the user can check; when unsure, mark the item needs investigation and
  recommend the ecosystem's own audit tool (run by the user).
- Lockfiles present and committed; versions pinned or bounded for production builds.
- Install-time scripts, post-install hooks or build steps that download and run remote code.
- CI steps or images referenced by mutable tags instead of pinned versions or digests.
- Packages from untrusted registries, or names that look like typos of popular packages.
