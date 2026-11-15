# Security policy

## Reporting a vulnerability

Please **do not** open a public issue. Report privately through GitHub:

**Security → Report a vulnerability** on
[github.com/pedrofnj/agentforge](https://github.com/pedrofnj/agentforge/security/advisories/new)
(GitHub private vulnerability reporting).

Include the affected version, your OS and Node.js version, steps to reproduce and the impact you
expect. Reports in English or Portuguese are welcome. You should get an acknowledgment within a
few days; fixes are released as patch versions and credited in the changelog unless you prefer
otherwise.

## Supported versions

Only the latest `0.x` release receives security fixes while the project is pre-1.0.

## Scope

In scope: the CLI and installer (path handling, symlinks, overwrites, rollback, state files),
the files it generates, and the evaluation importers (handling of untrusted input files).

Out of scope: vulnerabilities in Claude Code or Codex themselves, model behavior that ignores
instructions, and the intentionally vulnerable code under `evals/fixtures/` (benchmark data that
is never executed and is not part of the npm package).

## What the project guarantees, and what it does not

- The installer never executes scripts, has no runtime dependencies and no install-time npm
  scripts, never writes client settings, hooks, permissions or instruction files, never follows
  symbolic links inside client directories, and never overwrites or deletes a file it cannot
  prove it installed (SHA-256 recorded at install time).
- Agents are configured read-only where the client supports it (Claude Code tool allowlist and
  plan mode). Codex agents inherit the session sandbox; use `--sandbox read-only` for audits.
- Agent and skill instructions are guidance to a model, not a security boundary. An audit is not
  proof that a codebase is free of vulnerabilities.
