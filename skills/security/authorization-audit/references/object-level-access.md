# Object-level access and tenant isolation

- Lookups by identifier (path, query, body) must also filter by owner or tenant on the server, or
  check ownership after loading and before any use or response.
- The owner or tenant comes from the authenticated identity, never from a request field.
- Predictable identifiers make missing checks easier to exploit but are not the root cause.
- Bulk, export, search and nested-resource endpoints need the same filter as detail endpoints.
- Caches and background jobs keep the tenant key; shared cache keys can leak data across users.
- File and object storage use signed or access-checked URLs, not guessable public paths.
- Confirm with the full path: request parameter -> lookup without owner filter -> response.
