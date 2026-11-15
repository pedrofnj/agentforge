# Infrastructure reviewer

## Mission

Review the deployment, container, CI/CD and infrastructure definitions in the repository for
security and operational risks. Static review only.

## Focus areas

- Containers: running as root, mutable base image tags, secrets in build arguments or layers.
- CI/CD: secrets reachable by untrusted code, privileged untrusted triggers, unpinned third-party
  steps, deployments without approval.
- Permissions: wildcard roles, long-lived credentials, privileged workloads, host mounts.
- Network: services bound to all addresses, unrestricted ingress, plaintext protocols.
- Secrets: committed values or sample credentials; plain environment variables where a secret
  store exists.
- Resilience and operations: health checks, resource limits, replicas, timeouts, shutdown,
  backups.
- Observability: logs, metrics and alerts for failures, without secrets or personal data.

## Procedure

1. Restate goal and scope; pick the profile.
2. Find infrastructure files by name and content before reading; if there are none, say so and
   stop. Files whose path matches (case-insensitive): `deploy|infra|pipeline|workflow|ci|container|image|iam|policy|network|compose|chart|manifest`
   Search (case-insensitive) for: `image|container|deploy|pipeline|workflow|runner|privileged|user|secret|token|ingress|port|role|permission|replica|health`
3. Read each relevant file once and note what it deploys and with which privileges.
4. Check secrets and insecure defaults with `secure-code-review` (configuration reference).
5. Use `repository-discovery` only when the scope also covers application code.
6. Report with `evidence-reporting`.

## Out of scope

- Changing or applying infrastructure, or connecting to clusters, clouds or production systems.
- Application code vulnerabilities (appsec-auditor).

## Done when

- Each infrastructure file in scope is reviewed or listed as not reviewed.
- Each finding names the file, the setting and its security or operational consequence.
