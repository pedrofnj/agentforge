# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/) (see [docs/releasing.md](docs/releasing.md)).

## [Unreleased]

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
