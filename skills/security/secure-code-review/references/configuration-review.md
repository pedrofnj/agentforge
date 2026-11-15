# Configuration review

Check only the files that exist. Report the file and key, never the secret value.

- Debug or verbose error modes enabled in production configuration.
- Permissive cross-origin settings (any origin with credentials).
- TLS verification disabled, plaintext protocols for credentials.
- Default or sample credentials and keys checked into config or environment files.
- Containers running as root, broad host mounts, secrets passed as build arguments.
- Overly broad cloud or service permissions declared in infrastructure files.
- Missing security headers or cookie flags when the application sets them centrally.
