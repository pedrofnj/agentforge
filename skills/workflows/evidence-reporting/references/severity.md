# Severity rubric

Rate the realistic worst case, then adjust for preconditions.

| Factor         | Raises severity                       | Lowers severity                           |
| -------------- | ------------------------------------- | ----------------------------------------- |
| Access needed  | None or any user account              | Admin, local or physical access           |
| Reachability   | Exposed entry point, default config   | Dead code, test-only, disabled by default |
| Impact         | Code execution, data breach, takeover | Information about internals only          |
| Scope          | All users or tenants                  | Single user, own data only                |
| Exploitability | Deterministic, no user interaction    | Race, guessing, victim interaction needed |

Edge cases:

- Hardcoded secrets: High if the secret grants production access; Medium if scope is unknown;
  Low for obvious placeholders (still report placement).
- Missing hardening with no exploit path (headers, flags): Low or Info.
- Vulnerable dependency: rate by whether the vulnerable function is reachable; if unknown, use
  status `likely` with low confidence, or needs investigation when the advisory is unverified.
- Several Low issues that chain into a real attack: report the chain as one finding at the
  chained severity and list each link as a location.
