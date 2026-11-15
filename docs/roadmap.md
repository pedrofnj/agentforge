# Roadmap

## Phase 1: Foundation (done)

Project setup (TS strict, ESM, Node ≥22), Vitest, ESLint, Prettier, CI on Linux/Windows/macOS.
Core contracts, validator, registry, Claude Code and Codex adapters (in-memory rendering),
minimal CLI (`list`, `validate`), architecture and compatibility docs, unit tests.

## Phase 2: CLI and installer (done)

install / list / update / uninstall / doctor / validate / version; interactive and non-interactive
modes; journaled atomic installs with rollback; hash-based ownership manifest; symlink refusal;
update preserving local edits; packaged and smoke-tested locally. See [cli.md](cli.md).

Open items carried forward:

- Load generated files in real Claude Code and Codex sessions (manual acceptance test).
- Confirm package name availability on npm before the first publish.

## Phase 3: Universal skills (done)

Five stack-agnostic skills (repository-discovery, evidence-reporting, secure-code-review,
authentication-audit, authorization-audit), grouped catalog, skill dependencies and capability
checks, generated-file validation, `list --type/--domain`, `stats`, multi-language eval fixtures.
See [skills.md](skills.md).

Open items carried forward:

- Load the installed skills in real Claude Code and Codex sessions and record which ones activate.
- Confirm package name availability on npm.

## Phase 4: Universal agents (done)

Five read-only agents (appsec, architecture, quality, performance, infrastructure), generated
operating rules and quick/standard/deep profiles, `review-planning` skill for multi-agent reviews,
native read-only controls for Claude Code, documented Codex limitations, structural evals.
See [agents.md](agents.md).

## Phase 5: Evaluation framework and token optimization (done)

Benchmarks with ground truth (43 cases, 7 fixtures, safe cases for false positives), quality
metrics with documented denominators, Claude Code / Codex collectors from documented outputs,
JSON and Markdown reports, comparison, budget profiles, structural and reachability regression
checks. Behavioral effectiveness not yet measured (no real runs imported). See
[evaluation.md](evaluation.md).

## Phase 6: Production readiness (done; publication pending)

Installer hardening (Windows path rules, overlapping scopes), CLI first-run experience, packaged
CLI smoke test on all OSes, CI / package validation / tag-gated release workflows with npm
provenance, bilingual README and contributing guides, security policy, changelog, guides,
release process. Publication waits for the npm name decision and live client checks.

## Phase 7: Real runs and evidence-driven tuning

- Run the benchmark matrix (agents x quick/standard/deep x economy/balanced/thorough) on both
  clients, repeated to account for non-determinism; import and publish baseline reports.
- Tune only where measurements show it: missed cases, false positives, tokens per detection.
- Verify activation behavior (delegation by description, skill loading, plan mode) from runs.
- Grow the benchmark (larger fixtures, more safe cases per category) and add engineering /
  security skills where runs show gaps.

## Phase 8: Evaluation at scale

- Eval fixtures (small vulnerable/clean projects in several stacks) to measure detection rate,
  false positives, and cost.
- Token measurement from real platform data (Claude statusline/OTel, `codex exec --json`); our
  heuristics stay labeled as estimates.
- Budget regression checks in CI (e.g. max description length, max SKILL.md size).

## Phase 9+: Specializations and extensions

- Optional technology specializations as `appliesWhen` references, contributed as data.
- Possible MCP server, more platforms via new adapters.
