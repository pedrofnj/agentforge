# CLI

```text
agentforge install   [ids...]  Install components (interactive wizard on a terminal)
agentforge list                Available components and where they are installed
agentforge status              Installed components, versions, file integrity, available updates
agentforge update    [ids...]  Update managed components; local edits are preserved
agentforge uninstall [ids...]  Remove files installed by AgentForge (only if unmodified)
agentforge doctor              Diagnose installation and compatibility (read-only)
agentforge validate            Validate catalog components and the files they generate
agentforge stats               Measure skill sizes, discovery budget and duplication
agentforge eval <sub>          Benchmarks and evaluation: validate | list | import | report | compare
agentforge version             Show version (also --version, -v)
agentforge help <command>      Command options (also <command> --help)
```

| Option                           | Commands                                        | Behavior                                                      |
| -------------------------------- | ----------------------------------------------- | ------------------------------------------------------------- |
| `--client claude\|codex\|both`   | install, update, uninstall, status, doctor      | Client(s). Required for install when not interactive          |
| `--provider claude\|codex\|both` | same as `--client`                              | Alias of `--client` (`claude-code` is accepted too)           |
| `--global` / `--project`         | install, update, uninstall, status, doctor      | Scope. Project = current directory                            |
| `--scope global\|project`        | same as `--global`/`--project`                  | Alias; cannot be combined with `--global`/`--project`         |
| `--yes`, `-y`                    | install, update, uninstall                      | Apply without confirmation and never prompt. Never overwrites |
| `--dry-run`                      | install, update, uninstall                      | Print the plan, change nothing (exit 3 if it would conflict)  |
| `--verbose`                      | install, update, uninstall, list, doctor        | Per-file actions and paths                                    |
| `--all`                          | install, uninstall                              | Select every component                                        |
| `--type skill\|agent`            | list                                            | Filter by kind                                                |
| `--domain <name>`                | list                                            | Filter by domain (`appsec`, `workflow`, ...)                  |
| `--json`                         | list, status, doctor, stats                     | Machine-readable output (nothing else on stdout)              |
| `--catalog <dir>`                | install, update, list, status, doctor, validate | Use another catalog directory (development, testing)          |

Evaluation (`agentforge eval ...`, offline; see [evaluation.md](evaluation.md)):

| Subcommand             | Options                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `validate`             | `--evals <dir>`, `--catalog <dir>`                                                                                        |
| `list`                 | `--category <name>`, `--json`                                                                                             |
| `import <file>`        | `--from claude-json\|codex-jsonl\|report-md\|manual`, `--agent`, `--fixture`, `--profile`, `--budget`, `--out <new file>` |
| `report <run.json...>` | `--json`, `--out <new file>`                                                                                              |
| `compare <a> <b>`      | `--json`, `--out <new file>`; exit 1 when regressions are found                                                           |

`--out` never overwrites an existing file.

A command rejects options it does not support.

Exit codes: `0` ok, `1` error (including `status`/`doctor` finding problems), `2` usage, `3`
conflicts (nothing changed), `4` cancelled (declined, Esc or Ctrl+C at a prompt). Ctrl+C while
files are being written exits with `130`; the interrupted operation is rolled back automatically
by the next `install`, `update` or `uninstall`.

## Interactive wizard

On a terminal (stdin and stdout are TTYs) and without `--yes`, `agentforge install` and
`agentforge uninstall` ask for every choice that was not given as a flag:

| Step              | install                                                                | uninstall                                                 |
| ----------------- | ---------------------------------------------------------------------- | --------------------------------------------------------- |
| Environment       | OS, Node.js, directory, Claude Code/Codex detection, existing installs | same                                                      |
| Client            | Claude Code, Codex or both (detected client highlighted)               | `--provider` to restrict; default: both                   |
| Scope             | Project or global, with the directories each writes to                 | Project or global                                         |
| Components        | Agents (purpose and skills shown), then optional standalone skills     | Installed components; skills nobody else needs can go too |
| Preview + confirm | New, updated, unchanged, kept, conflicts; then "Apply these changes?"  | same                                                      |
| Apply             | Atomic, progress bar, rollback on failure, summary and next steps      | same                                                      |

Client detection only looks for `claude` and `codex` on `PATH` and for `~/.claude`,
`CODEX_HOME` or `~/.codex`; nothing is executed. Scopes whose directories are not writable are
shown as unavailable; AgentForge never asks for elevated privileges.

Keys: up/down (or `k`/`j`, Tab) move, space toggles, `a` selects all or none, `i` inverts,
enter confirms, Esc or Ctrl+C cancels (nothing is changed). Confirmations take `y`, `n` or enter.

Accessibility and terminals:

- `NO_COLOR=1` (or `TERM=dumb`, or output that is not a terminal) disables colors.
  `FORCE_COLOR=1` forces them.
- Every status has a word next to its color and symbol (`OK`, `WARN`, `FAIL`, "installed",
  "not writable"), so nothing depends on color or glyphs alone.
- Symbols are Unicode only where the terminal is known to render them (Windows Terminal, VS Code,
  JetBrains, ConEmu, macOS and Linux terminals); `AGENTFORGE_ASCII=1` forces ASCII.
- `AGENTFORGE_SIMPLE_PROMPTS=1` replaces the arrow-key prompts with numbered menus (also used
  automatically when the terminal has no raw mode).

## Non-interactive mode

Anywhere else (CI, pipes) or with `--yes`, nothing is asked: missing choices are usage errors
and conflicts abort with exit code 3. Banners, spinners and progress bars are never printed
without a terminal, and `--json` output contains only JSON.

```bash
agentforge install --provider claude --scope project --all --yes
agentforge install appsec-auditor --client both --global --yes
agentforge update --scope project --yes
agentforge status --json
agentforge uninstall --scope project --all --dry-run
agentforge uninstall sample-skill --provider codex --scope global --yes
```

## Install scripts (from a checkout)

`scripts/install.sh` (Linux, macOS) and `scripts/install.ps1` (Windows PowerShell 5.1 and
PowerShell 7) check for Node.js 22+ and npm, run `npm ci --ignore-scripts` and `npm run build`
in the checkout, then run `agentforge install` in the directory you called them from. Arguments
are passed through, and the installer's exit code is returned. They never use `sudo`, never
change the execution policy, never request elevation and never download scripts.

```bash
./scripts/install.sh --provider claude --scope project --all --yes
```

```powershell
.\scripts\install.ps1 --provider codex --scope global --all --yes
```

## Development

```bash
npm ci
npm run build
node dist/cli/bin.js help
node dist/cli/bin.js list --type skill
node dist/cli/bin.js install --client both --project --all --dry-run
```

Run it inside a throwaway directory: `--project` writes into the current directory.

## Packaging and testing the package locally

```bash
npm run check          # typecheck + lint + format + tests
npm pack --dry-run     # list what would be published
npm run smoke          # build, pack, install the tarball in a temp dir, run the packaged CLI
```

`npm run smoke` (`scripts/smoke-pack.mjs`) checks the file list (no sources, tests, CI files, env
files, source maps or `evals/`; no runtime dependencies or install scripts), installs the tarball
(`@pedrofnj/agentforge`) into a temporary project and runs `version`, `list`, `validate`, install
(dry-run, global for both clients, repeated, project), `doctor`, `update` and `uninstall` against an
isolated home. `agentforge eval` needs a repository checkout: benchmarks are not published.
CI runs it on Linux, macOS and Windows. Nothing in this repository publishes to npm; releases are
described in [releasing.md](releasing.md).

## Tests

`npm test` runs Vitest. Installer and CLI tests run in temporary directories with an injected home
dir, working directory and environment (`tests/helpers.ts#makeSandbox`); they never read or write
the real `~/.claude`, `~/.codex` or `~/.agents`. One test (file symlinks) is skipped on Windows
when the OS denies creating symlinks without privileges; directory junctions are still tested.
