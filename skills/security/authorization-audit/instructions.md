# Authorization audit

## Goal

Verify that every sensitive operation checks that the caller may perform it on that resource.

## When to use

- The user asks who can access or change what, or about roles, tenants or permissions.
- A security review reaches handlers that read or modify protected data.

## When not to use

- Verifying identity itself (login, sessions, tokens): that is authentication.
- Single-user tools with no notion of other users or roles: say so and stop.

## Procedure

1. Reuse the repository map, or run `repository-discovery` if none exists.
2. Find the access-control model and where it is enforced.
   Search (case-insensitive) for: `role|permission|policy|authoriz|admin|owner|tenant|acl|scope|forbidden|guard|middleware`
3. List protected operations: handlers that read or change user-owned data, and admin actions.
   For each, note where the check happens (a central layer or the handler).
4. For each operation, check: caller authenticated; allowed for the action; resource ownership
   or tenant verified on the server against the caller, never taken from client input.
   Read `references/object-level-access.md` when resources are fetched by identifier.
5. Look for bypasses: default-allow, unchecked alternate routes (bulk, export, older API
   versions), client-side-only checks, role or owner fields settable by the user, list and detail
   endpoints enforcing different rules. Read `references/privilege-escalation.md` when roles
   exist.
6. Report with `evidence-reporting`.

## Done when

- Each protected operation is listed with its enforcement point, or marked as unchecked.
- Every gap shows the request path that reaches the resource without a valid check.
