# CLI

```text
agentforge install   [ids...]  Install components (asks for missing choices on a terminal)
agentforge list                List available components (reads manifests only)
agentforge update    [ids...]  Update managed components; local edits are preserved
agentforge uninstall [ids...]  Remove files installed by AgentForge (only if unmodified)
agentforge doctor              Diagnose installation and compatibility (read-only)
agentforge validate            Validate catalog components and the files they generate
agentforge stats               Measure skill sizes, discovery budget and duplication
agentforge eval <sub>          Benchmarks and evaluation: validate | list | import | report | compare
agentforge version             Show version
agentforge help <command>      Command options
```

| Option                         | Commands                                 | Behavior                                                      |
| ------------------------------ | ---------------------------------------- | ------------------------------------------------------------- |
| `--client claude\|codex\|both` | install, update, uninstall, doctor       | Client(s). Required for install when not interactive          |
| `--global` / `--project`       | install, update, uninstall, doctor       | Scope. Project = current directory                            |
| `--yes`, `-y`                  | install, update, uninstall               | Apply without confirmation and never prompt. Never overwrites |
| `--dry-run`                    | install, update, uninstall               | Print the plan, change nothing (exit 3 if it would conflict)  |
| `--verbose`                    | install, update, uninstall, list, doctor | Per-file actions and paths                                    |
| `--all`                        | install, uninstall                       | Select every component                                        |
| `--type skill\|agent`          | list                                     | Filter by kind                                                |
| `--domain <name>`              | list                                     | Filter by domain (`appsec`, `workflow`, ...)                  |
| `--json`                       | stats                                    | Machine-readable output                                       |
| `--catalog <dir>`              | install, update, list, doctor, validate  | Use another catalog directory (development, testing)          |

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

Exit codes: `0` ok, `1` error, `2` usage, `3` conflicts (nothing changed), `4` cancelled.

## Interactive vs non-interactive

On a terminal (stdin and stdout are TTYs) and without `--yes`, missing choices are asked:
client, scope, components. A plan summary is always printed, then confirmed before writing.
Overwriting a conflicting file needs its own confirmation (default: no).

Anywhere else (CI, pipes) or with `--yes`, nothing is asked: missing choices are usage errors
and conflicts abort with exit code 3.

```bash
agentforge install --client both --project --all --yes
agentforge update --project --yes
agentforge uninstall sample-skill --client codex --global --dry-run
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
