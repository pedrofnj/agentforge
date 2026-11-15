# Installation guide

**English** · [Português (Brasil)](installation.pt-BR.md)

## 1. Get the CLI

Requires Node.js 22+. After the first npm release this step becomes
`npx @pedrofnj/agentforge@latest install` (or `npm install --global @pedrofnj/agentforge`).
The package is not on npm yet; build it from source once:

```bash
git clone https://github.com/pedrofnj/agentforge.git
cd agentforge
npm ci && npm run build && npm pack
npm install --global ./pedrofnj-agentforge-0.1.0.tgz
agentforge --version
```

Without a global install, run `node /path/to/agentforge/dist/cli/bin.js` instead of `agentforge`.

## 2. Choose client and scope

Run the commands **from your project directory** (project scope uses the current directory).

| Goal                                    | Command                                                               |
| --------------------------------------- | --------------------------------------------------------------------- |
| Guided (asks client, scope, components) | `agentforge install`                                                  |
| Claude Code, this project, everything   | `agentforge install --client claude --project --all --yes`            |
| Codex, this project, everything         | `agentforge install --client codex --project --all --yes`             |
| Both clients, all your projects         | `agentforge install --client both --global --all --yes`               |
| One agent and the skills it needs       | `agentforge install appsec-auditor --client claude --project --yes`   |
| One skill (plus what it requires)       | `agentforge install secure-code-review --client codex --global --yes` |
| Preview without writing                 | add `--dry-run`                                                       |

See what exists first with `agentforge list` (`--type agent`, `--type skill`, `--domain appsec`,
`--verbose`).

Where files go:

|             | Global                                                                          | Project                                           |
| ----------- | ------------------------------------------------------------------------------- | ------------------------------------------------- |
| Claude Code | `~/.claude/skills/<id>/`, `~/.claude/agents/<id>.md`                            | `.claude/skills/<id>/`, `.claude/agents/<id>.md`  |
| Codex       | `~/.agents/skills/<id>/`, `~/.codex/agents/<id>.toml` (or `$CODEX_HOME/agents`) | `.agents/skills/<id>/`, `.codex/agents/<id>.toml` |

On Windows `~` is `%USERPROFILE%`. AgentForge keeps its own records in `.agentforge/` (project;
commit `manifest.json` if your team shares the install) or in your OS user state directory
(global). It never edits client settings, `CLAUDE.md` or `AGENTS.md`.

## 3. Verify

```bash
agentforge doctor            # both scopes and clients
agentforge doctor --project --client codex --verbose
```

`OK`/`WARN`/`FAIL` lines cover Node.js, the catalog, client directories, interrupted operations,
missing or modified files, and client caveats (Codex sandbox and trusted projects, Claude Code
permission modes that override plan mode).

## 4. Use

- **Claude Code:** start a new session (restart if a new top-level directory was created) and ask
  "Use the appsec-auditor agent to review src/". Claude Code may also delegate automatically when
  a request matches an agent's description.
- **Codex:** start a session with `codex --sandbox read-only` and ask for the agent by name;
  Codex does not start custom agents on its own. Project agents load only in trusted projects.

If something fails, see [troubleshooting.md](troubleshooting.md).
