# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/) (see [docs/releasing.md](docs/releasing.md)).

## [Unreleased]

## [0.2.0] - 2026-11-15

Premium CLI experience: interactive install and uninstall wizards, a `status` command and
install scripts, still with zero runtime dependencies.

### Added

- Interactive install wizard: environment detection (OS, Node.js, directory, Claude Code and
  Codex on `PATH` or by config directory, without running them, previous installs, write
  permissions), client and scope selection with the real target directories, agent selection
  with purpose and skills, automatic skill resolution, optional standalone skills, preview,
  atomic apply with a progress bar, and a final summary with next steps.
- Interactive uninstall: scope, client and component selection; offers to remove skills no
  remaining agent needs and keeps (and names) skills other agents still require.
- Arrow-key prompts built on `node:readline` (no dependency): arrows/`j`/`k`, space, `a` (all),
  `i` (invert), enter, Esc and Ctrl+C cancel with the terminal restored. Numbered menus with
  `AGENTFORGE_SIMPLE_PROMPTS=1` or when the terminal has no raw mode.
- Banner, colors (cyan, teal, purple), Unicode or ASCII symbols, spinner and progress bar on
  terminals only; `NO_COLOR`, `FORCE_COLOR`, `TERM=dumb` and `AGENTFORGE_ASCII=1` respected. Every
  status has a text label, never color or symbol alone.
- `agentforge status`: installed components per scope and client, versions, file integrity and
  available updates; `--json`.
- `--json` for `list` (with where each component is installed) and `doctor`.
- `--provider` (alias of `--client`, also accepts `claude-code`) and `--scope global|project`
  (alias of `--global`/`--project`).
- `doctor` checks client executables on `PATH`, write permissions, components no longer in the
  catalog and invalid Claude Code settings files.
- `scripts/install.sh` and `scripts/install.ps1`: check Node.js 22+ and npm, `npm ci`, build, and
  start the installer in the current directory; no `sudo`, no execution-policy changes, no remote
  scripts; installer exit codes are returned. CI runs them on Linux, macOS and Windows.
- `scripts/record-wizard.mjs`: reproducible transcript of the wizard driven by scripted keys.

### Changed

- `list` marks installed components; the install and uninstall previews print totals (new,
  updated, removed, unchanged, kept, conflicts).
- Install refuses scopes whose directories are not writable before writing anything.
- Ctrl+C while files are being written exits with code 130; the next run rolls the operation
  back (as before, via the journal).

### Documentation

- README (English and Portuguese): "Real-World Tested" note, installation methods, wizard,
  automation, status, update and uninstall. CLI reference, installation, uninstall, update and
  troubleshooting guides updated; demo re-recorded.

## [0.1.1] - 2026-11-15

First release published by the release workflow through npm trusted publishing (OIDC, with
provenance), with no npm token anywhere.

### Changed

- Release workflow installs npm 11 before publishing, as required for trusted publishing.

### Documentation

- `docs/releasing.md` documents the publishing setup (environment approval, trusted publisher,
  2FA-only publishing access) and the staged-publishing decision.

## [0.1.0] - 2026-11-15

First public release, published as `@pedrofnj/agentforge` (command: `agentforge`).

### Added

- CLI: `install`, `update`, `uninstall`, `doctor`, `list`, `validate`, `stats`, `eval`, `version`,
  interactive and non-interactive modes, `--dry-run`, consistent exit codes, plain output when not
  in a terminal (`NO_COLOR` respected).
- Installer: plan-first, conflict detection, journaled atomic writes with rollback, SHA-256
  ownership manifest, symlink refusal, Windows-safe path validation, global and project scopes.
- Adapters for Claude Code (skills, subagents) and OpenAI Codex (skills, custom agents).
- Six stack-agnostic skills: repository-discovery, secure-code-review, authentication-audit,
  authorization-audit, evidence-reporting, review-planning.
- Five read-only agents: appsec-auditor, architecture-reviewer, code-quality-reviewer,
  performance-auditor, infrastructure-reviewer.
- Analysis profiles (quick, standard, deep) and resource budgets (economy, balanced, thorough).
- Offline evaluation framework: 43 benchmark cases with ground truth, quality metrics, Claude Code
  and Codex output importers, JSON/Markdown reports, comparison, structural regression checks.

### Packaging

- npm package `@pedrofnj/agentforge`, binary `agentforge`, zero runtime dependencies.
- Benchmarks and intentionally vulnerable fixtures (`evals/`) stay in the repository and are not
  published; `agentforge eval` needs a repository checkout or `--evals <dir>`.

### Security

- Rejects manifest and state paths with `..`, absolute paths, `:` (NTFS streams), reserved Windows
  device names and trailing dots or spaces.
- Refuses `--project` in the home directory, where it would overlap the global locations.
