# Privilege escalation

- Role checks are explicit and deny by default; unknown roles get no access.
- Admin-only operations are checked on the server for every route that reaches them.
- Mass assignment: updates must not accept role, owner, tenant or permission fields from the
  request unless explicitly allowed for that caller.
- Role or permission claims are trusted only from verified sources (server-side session state or
  a verified token), never from headers, cookies or parameters the client controls.
- Self-service flows (invite, change email, change role) cannot grant more than the caller has.
- Feature flags or debug switches that skip checks must not be reachable in production.
