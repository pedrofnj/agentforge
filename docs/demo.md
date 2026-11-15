# Demo

Real, reproducible sessions: every line below is actual CLI output. Temporary paths were
shortened and the OS and Node.js versions replaced with placeholders; nothing else was edited.

## Interactive wizard

Recorded by `node scripts/record-wizard.mjs` (after `npm run build`): the real CLI and its
arrow-key prompter run in a temporary project with an isolated home, fed by scripted keystrokes
(enter, enter, down x3, space, down, space, enter, enter, y). The transcript is the final
terminal screen with colors removed. On a real terminal the prompts are redrawn in place, the
highlighted item shows its description, and a progress bar runs while files are written.

```text
$ agentforge install
╭──────────────────────────────────────────────────────────────╮
│ ◆ AgentForge v0.2.0                                          │
│ Read-only review agents and skills for Claude Code and Codex │
╰──────────────────────────────────────────────────────────────╯

Environment
  System       <your OS>
  Node.js      <your Node.js>
  Directory    ~/my-app (repository root)
  Claude Code  ✔ config found ~/.claude (not on PATH)
  Codex        ▲ not detected (files can still be installed)
  Global       nothing installed
  Project      nothing installed

✔ Which client do you want to configure? → Claude Code
✔ Install globally or in the current project? → Project  ~/my-app
✔ Which agents do you want to install? → Code quality reviewer, AppSec auditor
● Skills included automatically: authentication-audit, authorization-audit, evidence-reporting, repository-discovery, secure-code-review (5)
✔ Add standalone skills? (optional, enter to skip) → none

Preview
Install plan (project: ~/my-app)
  Claude Code skill authentication-audit@0.2.0  create 4
  Claude Code skill authorization-audit@0.2.0  create 3
  Claude Code skill evidence-reporting@0.2.0  create 2
  Claude Code skill repository-discovery@0.3.0  create 2
  Claude Code skill secure-code-review@0.3.0  create 4
  Claude Code agent appsec-auditor@0.2.0  create 1
  Claude Code agent code-quality-reviewer@0.3.0  create 1
Warnings:
  - Claude Code / appsec-auditor: Analysis depth and profiles are guidance in the prompt; Claude Code does not enforce them.
  - Claude Code / appsec-auditor: Read-only relies on the tools allowlist and permissionMode: plan; a main session in bypassPermissions, acceptEdits or auto mode overrides permissionMode.
  - Claude Code / code-quality-reviewer: Analysis depth and profiles are guidance in the prompt; Claude Code does not enforce them.
  - Claude Code / code-quality-reviewer: Read-only relies on the tools allowlist and permissionMode: plan; a main session in bypassPermissions, acceptEdits or auto mode overrides permissionMode.
Files: 17 new, 0 updated, 0 removed, 0 unchanged, 0 kept (local edits), 0 conflicts
✔ Apply these changes? → Yes
Applying 17 change(s) atomically...
Done: 17 file(s) written, 0 removed.
Installed: authentication-audit (Claude Code), authorization-audit (Claude Code), evidence-reporting (Claude Code), repository-discovery (Claude Code), secure-code-review (Claude Code), appsec-auditor (Claude Code), code-quality-reviewer (Claude Code)

╭───────────────────────────────────────╮
│ ✔ Installed 2 agent(s) and 5 skill(s) │
│ Clients  Claude Code                  │
│ Scope    project                      │
│ Paths    ~/my-app/.claude/agents      │
│          ~/my-app/.claude/skills      │
╰───────────────────────────────────────╯

Next steps:
  Claude Code: start a new session in this project and ask "Use the appsec-auditor agent to review src/ (quick profile, economy budget)".
  Check the installation any time: agentforge doctor
(exit 0)
```

## Non-interactive commands

Recorded by `node scripts/record-demo.mjs` (after `npm run build`) in a temporary copy of the
`php-app` benchmark fixture with an isolated home directory.

```text
$ agentforge --version
0.2.0
(exit 0)

$ agentforge list --type agent
agent architecture-reviewer@0.3.0  [claude-code, codex]  ~58 tokens (estimated)  architecture  needs: repository-discovery, evidence-reporting
agent infrastructure-reviewer@0.3.0  [claude-code, codex]  ~60 tokens (estimated)  infrastructure  needs: repository-discovery, secure-code-review, evidence-reporting
agent performance-auditor@0.3.0  [claude-code, codex]  ~63 tokens (estimated)  performance  needs: repository-discovery, evidence-reporting
agent code-quality-reviewer@0.3.0  [claude-code, codex]  ~65 tokens (estimated)  quality  needs: repository-discovery, secure-code-review, evidence-reporting
agent appsec-auditor@0.2.0  [claude-code, codex]  ~61 tokens (estimated)  appsec  needs: repository-discovery, secure-code-review, authentication-audit, authorization-audit, evidence-reporting
(exit 0)

$ agentforge install appsec-auditor --provider claude --scope project --dry-run
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
Files: 16 new, 0 updated, 0 removed, 0 unchanged, 0 kept (local edits), 0 conflicts
Dry run: no changes were made.
(exit 0)

$ agentforge install appsec-auditor --provider claude --scope project --yes
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
Files: 16 new, 0 updated, 0 removed, 0 unchanged, 0 kept (local edits), 0 conflicts
Applying 16 change(s) atomically...
Done: 16 file(s) written, 0 removed.
Installed: authentication-audit (Claude Code), authorization-audit (Claude Code), evidence-reporting (Claude Code), repository-discovery (Claude Code), secure-code-review (Claude Code), appsec-auditor (Claude Code)

Next steps:
  Claude Code: start a new session in this project and ask "Use the appsec-auditor agent to review src/ (quick profile, economy budget)".
  Check the installation any time: agentforge doctor
(exit 0)

$ agentforge status --project

Project  ~/my-app/.agentforge
  Claude Code agent appsec-auditor@0.2.0                     up to date
  Claude Code skill authentication-audit@0.2.0               up to date
  Claude Code skill authorization-audit@0.2.0                up to date
  Claude Code skill evidence-reporting@0.2.0                 up to date
  Claude Code skill repository-discovery@0.3.0               up to date
  Claude Code skill secure-code-review@0.3.0                 up to date
(exit 0)

$ agentforge doctor --project --provider claude
OK   Node.js 24.16.0 (requires >= 22)
OK   Catalog <agentforge>: 11 component(s), 0 error(s)
WARN Claude Code user dir ~/.claude not found (is Claude Code installed?)
WARN claude executable not found on PATH
OK   project: 6 managed component(s) (state: ~/my-app/.agentforge)
(exit 0)

$ agentforge uninstall --scope project --all --dry-run
Uninstall plan (project: ~/my-app)
  Claude Code agent appsec-auditor@0.2.0  remove 1
  Claude Code skill authentication-audit@0.2.0  remove 4
  Claude Code skill authorization-audit@0.2.0  remove 3
  Claude Code skill evidence-reporting@0.2.0  remove 2
  Claude Code skill repository-discovery@0.3.0  remove 2
  Claude Code skill secure-code-review@0.3.0  remove 4
Files: 0 new, 0 updated, 16 removed, 0 unchanged, 0 kept (local edits), 0 conflicts
Dry run: no changes were made.
(exit 0)
```
