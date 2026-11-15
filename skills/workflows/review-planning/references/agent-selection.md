# Agent selection

| Request is about                                                 | Agent                     |
| ---------------------------------------------------------------- | ------------------------- |
| Vulnerabilities, auth, access control, secrets, dependencies     | `appsec-auditor`          |
| Structure, boundaries, coupling, scalability, resilience design  | `architecture-reviewer`   |
| Bugs, error handling, races, duplication, tests, maintainability | `code-quality-reviewer`   |
| Slowness, resource use, queries, I/O, caching, concurrency cost  | `performance-auditor`     |
| Deployment, containers, CI/CD, permissions, operations           | `infrastructure-reviewer` |

Signals that justify adding a second specialist to a full review:

- Security: the map shows network entry points, authentication or stored user data.
- Infrastructure: container, deployment, CI or infrastructure-as-code files exist.
- Performance: the user reports slowness, or the map shows data-heavy paths or batch jobs.
- Architecture: several components or services, or the user is planning a change.
- Quality: almost always relevant, but run it alone only when no other area is requested.

Avoid:

- Starting all specialists by default.
- Specialists delegating to each other (cascades); the planner delegates once.
- Two agents reviewing the same files for the same concern.
