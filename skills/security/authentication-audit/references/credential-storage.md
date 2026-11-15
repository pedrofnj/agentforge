# Credential storage

- Passwords: stored with a slow, salted, purpose-built password hash (memory- or
  iteration-hard). Fast general-purpose hashes, unsalted hashes, reversible encryption or
  plaintext are findings.
- Comparison: secrets compared in constant time; plain equality on secrets is a finding when
  timing is observable remotely.
- Hash parameters: cost factors not lowered for convenience; an upgrade path for old hashes.
- Keys and API secrets: loaded from a secret store or the environment at runtime, not committed.
  Report the location only; never copy values.
- Recovery data: security answers and reset tokens stored hashed, not in plaintext.
- Logs and errors: no passwords, hashes or tokens written.
