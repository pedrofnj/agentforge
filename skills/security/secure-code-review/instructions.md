# Secure code review

## Goal

Find real, reachable vulnerabilities and prove each one with evidence.

## When to use

- Security review of a repository, directory, file set or diff.

## When not to use

- Style or general quality review with no security angle.
- Deep authentication or access-control audits: use `authentication-audit` or
  `authorization-audit` when installed; this skill only flags those issues on the way.

## Procedure

1. Scope. For a diff, review the changed code and its direct callers only. Otherwise reuse the
   repository map from this conversation, or run `repository-discovery` to build it.
2. Rank entry points that accept external input (network, CLI arguments, files, messages,
   environment). Unauthenticated and privileged paths come first.
3. Trace input to dangerous sinks with targeted searches; read only the functions on the path.
   Search (case-insensitive) for: `exec|eval|system|spawn|shell|query|sql|deserializ|template|render|redirect|upload|path`
4. Look for exposed secrets in code and configuration.
   Search (case-insensitive) for: `password|passwd|secret|api[_-]?key|token|private[_-]?key|credential`
5. For each candidate, confirm the chain: source, missing or weak validation, sink, impact. Read
   `references/vulnerability-classes.md` only for the classes you actually encounter.
6. Review configuration only if config or deployment files exist (see the configuration
   reference). Review APIs, external integrations and dependency manifests only when present
   (see `references/api-and-supply-chain.md`).
   Search (case-insensitive) for: `dependenc|requirement`
7. Stop a trace after two hops without new evidence and record it under "Needs investigation".
8. Report with `evidence-reporting`.

## Done when

- Each ranked entry point is either reviewed or listed as not reviewed.
- Every finding shows a traced path with locations; unproven patterns are marked needs investigation.
