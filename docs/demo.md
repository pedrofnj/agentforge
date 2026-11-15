# Demo

A real, reproducible session: every line below is actual CLI output, recorded by
`node scripts/record-demo.mjs` (after `npm run build`) in a temporary copy of the `php-app`
benchmark fixture with an isolated home directory. Only temporary paths were shortened.

## Recorded: install one agent for Claude Code and verify

```text
$ agentforge --version
0.1.0
(exit 0)

$ agentforge list --type agent
agent architecture-reviewer@0.3.0  [claude-code, codex]  ~58 tokens (estimated)  architecture  needs: repository-discovery, evidence-reporting
agent infrastructure-reviewer@0.3.0  [claude-code, codex]  ~60 tokens (estimated)  infrastructure  needs: repository-discovery, secure-code-review, evidence-reporting
agent performance-auditor@0.3.0  [claude-code, codex]  ~63 tokens (estimated)  performance  needs: repository-discovery, evidence-reporting
agent code-quality-reviewer@0.3.0  [claude-code, codex]  ~65 tokens (estimated)  quality  needs: repository-discovery, secure-code-review, evidence-reporting
agent appsec-auditor@0.2.0  [claude-code, codex]  ~61 tokens (estimated)  appsec  needs: repository-discovery, secure-code-review, authentication-audit, authorization-audit, evidence-reporting
(exit 0)

$ agentforge install appsec-auditor --client claude --project --dry-run
Install plan (project: ~/my-app)
  Claude Code skill authentication-audit@0.2.0  create 4
  Claude Code skill authorization-audit@0.2.0  create 3
  Claude Code skill evidence-reporting@0.2.0  create 2
  Claude Code skill repository-discovery@0.3.0  create 2
  Claude Code skill secure-code-review@0.3.0  create 4
  Claude Code agent appsec-auditor@0.2.0  create 1
Warnings:
  - Claude Code / appsec-auditor: Analysis depth and profiles are guidance in the prompt; Claude Code does not enforce them.
  - Claude Code / appsec-auditor: Read-only relies on the tools allowlist and permissionMode: plan; a main session in bypassPermissions, acceptEdits or auto mode overrides permissionMode.
Dry run: no changes were made.
(exit 0)

$ agentforge install appsec-auditor --client claude --project --yes
Install plan (project: ~/my-app)
  Claude Code skill authentication-audit@0.2.0  create 4
  Claude Code skill authorization-audit@0.2.0  create 3
  Claude Code skill evidence-reporting@0.2.0  create 2
  Claude Code skill repository-discovery@0.3.0  create 2
  Claude Code skill secure-code-review@0.3.0  create 4
  Claude Code agent appsec-auditor@0.2.0  create 1
Warnings:
  - Claude Code / appsec-auditor: Analysis depth and profiles are guidance in the prompt; Claude Code does not enforce them.
  - Claude Code / appsec-auditor: Read-only relies on the tools allowlist and permissionMode: plan; a main session in bypassPermissions, acceptEdits or auto mode overrides permissionMode.
Applying 16 change(s) atomically...
Done: 16 file(s) written, 0 removed.
Installed: authentication-audit (Claude Code), authorization-audit (Claude Code), evidence-reporting (Claude Code), repository-discovery (Claude Code), secure-code-review (Claude Code), appsec-auditor (Claude Code)

Next steps:
  Claude Code: start a new session in this project and ask "Use the appsec-auditor agent to review src/ (quick profile, economy budget)".
  Check the installation any time: agentforge doctor
(exit 0)

$ agentforge doctor --project --client claude
OK   Node.js 24.16.0 (requires >= 22)
OK   Catalog <agentforge>: 11 component(s), 0 error(s)
WARN Claude Code user dir ~/.claude not found (is Claude Code installed?)
OK   project: 6 managed component(s) (state: ~/my-app/.agentforge)
(exit 0)
```

The `WARN` line is expected in the recording: the isolated home has no Claude Code installation.

## Pending recordings

These need a person at a terminal or a signed-in client, so they are not recorded yet:

1. **Interactive installer** (choosing Claude Code, Codex or both, scope and components).
   Record with a terminal recorder such as asciinema or vhs:
   `agentforge install` in an empty project, answering `1` (Claude Code), `2` (project), then the
   number of `appsec-auditor`, and confirming.
2. **Security audit in Claude Code**, in the same project:
   `Use the appsec-auditor agent to review src/ (quick profile, economy budget).`
   Ground truth for this fixture lists SQL injection and MD5 password hashing in `src/Auth.php`
   and a missing owner check in `src/Report.php` (`evals/cases/security.json`). Import the run with
   `agentforge eval import` and publish the report next to the recording, misses included.
3. **The same audit in Codex** with `codex --sandbox read-only`.

Do not edit outputs in recordings; if a run misses something, the recording should show it.
