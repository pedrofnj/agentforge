# Installation guide

**English** · [Português (Brasil)](installation.pt-BR.md)

## 1. Get the CLI

Requires Node.js 22+. Run it on demand, with no install:

```bash
npx @pedrofnj/agentforge@latest install
```

Or install the `agentforge` command once:

```bash
npm install --global @pedrofnj/agentforge
agentforge --version
```

Or build from a clone of the repository (the scripts check Node.js and npm, run `npm ci` and
`npm run build` in the checkout and start the installer in your current directory; no `sudo`,
no execution-policy change, no remote scripts):

```bash
git clone https://github.com/pedrofnj/agentforge
cd my-project
../agentforge/scripts/install.sh            # Linux, macOS
```

```powershell
git clone https://github.com/pedrofnj/agentforge
cd my-project
..\agentforge\scripts\install.ps1          # Windows; if blocked by policy:
powershell -NoProfile -ExecutionPolicy Bypass -File ..\agentforge\scripts\install.ps1
```

The examples below use `agentforge`; with npx, write `npx @pedrofnj/agentforge@latest` instead.
To work on AgentForge itself, see [CONTRIBUTING.md](../../CONTRIBUTING.md).

## 2. Choose client and scope

Run the commands **from your project directory** (project scope uses the current directory).

| Goal                                  | Command                                                                       |
| ------------------------------------- | ----------------------------------------------------------------------------- |
| Guided wizard (asks everything)       | `agentforge install`                                                          |
| Claude Code, this project, everything | `agentforge install --provider claude --scope project --all --yes`            |
| Codex, this project, everything       | `agentforge install --provider codex --scope project --all --yes`             |
| Both clients, all your projects       | `agentforge install --provider both --scope global --all --yes`               |
| One agent and the skills it needs     | `agentforge install appsec-auditor --provider claude --scope project --yes`   |
| One skill (plus what it requires)     | `agentforge install secure-code-review --provider codex --scope global --yes` |
| Preview without writing               | add `--dry-run`                                                               |

`--provider`/`--scope` are aliases of `--client` and `--global`/`--project`; both work.

The wizard shows your system, Node.js version, the detected clients (looked up on `PATH` and in
their config directories, never executed) and what is already installed. It then asks for the
client, the scope (with the exact directories; unwritable ones are unavailable), the agents
(purpose and skills shown; required skills are added automatically) and optional standalone
skills, previews the changes and asks before writing. Keys: arrows to move, space to select,
`a` for all, enter to confirm, Esc or Ctrl+C to cancel. Details: [docs/cli.md](../cli.md).

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
agentforge status            # what is installed, versions, integrity, updates
agentforge doctor            # both scopes and clients
agentforge doctor --project --client codex --verbose
```

`OK`/`WARN`/`FAIL` lines cover Node.js, the catalog, client directories and executables, write
permissions, interrupted operations, missing or modified files, components no longer in the
catalog, invalid Claude Code settings files, and client caveats (Codex sandbox and trusted projects, Claude Code
permission modes that override plan mode).

## 4. Use

- **Claude Code:** start a new session (restart if a new top-level directory was created) and ask
  "Use the appsec-auditor agent to review src/". Claude Code may also delegate automatically when
  a request matches an agent's description.
- **Codex:** start a session with `codex --sandbox read-only` and ask for the agent by name;
  Codex does not start custom agents on its own. Project agents load only in trusted projects.

If something fails, see [troubleshooting.md](troubleshooting.md).
