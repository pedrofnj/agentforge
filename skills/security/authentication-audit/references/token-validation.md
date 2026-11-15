# Token validation

- Signature: always verified with the expected algorithm and key; unsigned tokens and algorithm
  switching are rejected; decoding without verification is a finding.
- Claims: issuer, audience, expiry and not-before are checked; clock skew is small.
- Lifetime: short-lived access tokens; refresh tokens rotated and revocable.
- Client storage: not where injected scripts can read it when avoidable; never in URLs.
- API keys: high entropy, scoped, revocable, hashed at rest when the server stores them.
- Revocation: logout or compromise can invalidate tokens before expiry when required.
- Trust: identity or role is taken from a token only after verification, never from unsigned
  headers or request fields.
