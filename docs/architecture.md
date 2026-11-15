# AgentForge architecture

Status: Phase 6 (release candidate 0.1.0, not yet published). Anything not marked "Implemented" below is planned, not built.

## Principles

1. **Token-first, lazy and progressive.** Only short metadata is visible at discovery time;
   instructions load on invocation; references load only when the task needs them.
2. **Language- and framework-agnostic.** The core never names a language, framework or tool.
   Agents have universal responsibilities; skills are generic by default; technology knowledge
   exists only as optional specializations loaded on demand.
3. **Single source of truth.** One canonical definition per component; adapters render
   platform-specific files.
4. **Security by default.** Agents are read-only unless the manifest says otherwise; installers
   never overwrite, never add hooks or permissions without explicit consent.
5. **Honest about platforms.** Adapters emit warnings where a platform cannot enforce a canonical
   rule. Token numbers are labeled `measured` or `estimated`, never mixed.

## Modules

| Path                       | Responsibility                                                           | Status      |
| -------------------------- | ------------------------------------------------------------------------ | ----------- |
| `src/core`                 | Contracts (`types.ts`), default policy, path safety, token accounting    | Implemented |
| `src/validator`            | Pure manifest validation (unknown JSON -> typed manifest + issues)       | Implemented |
| `src/registry`             | Catalog discovery (manifests only) and on-demand component loading       | Implemented |
| `src/adapters/claude-code` | Renders skills/subagents for Claude Code; resolves install dirs          | Implemented |
| `src/adapters/codex`       | Renders skills/custom agents for Codex; resolves install dirs            | Implemented |
| `src/cli`                  | install, list, update, uninstall, doctor, validate, version              | Implemented |
| `src/installer`            | Plan, conflict detection, journaled atomic apply, rollback, state        | Implemented |
| `src/updater`              | Version comparison and update planning that preserves local edits        | Implemented |
| `skills/`                  | Five universal skills (see [skills.md](skills.md))                       | Implemented |
| `src/evaluation`           | Benchmarks, quality/usage metrics, collectors, reports (`eval`, `stats`) | Implemented |
| `agents/`                  | Five read-only specialist agents (see [agents.md](agents.md))            | Implemented |
| `tests/`                   | Unit tests and fixtures; evals later                                     | Partial     |

Deviation from the initial proposal: there is no `policies/` directory yet. Default policy is
typed code in `src/core/policy.ts`, so it is tested and cannot drift from the validator. External
policy files will be added only when users need to override them.

Dependencies: zero at runtime (Node built-ins only). Dev: TypeScript, Vitest, ESLint,
typescript-eslint, Prettier.

## Data flow

```
manifest.json ──► registry.discoverCatalog ──► validator ──► CatalogEntry (metadata only)
                                                              │ on demand
                                                              ▼
instructions.md, references/* ──► registry.loadComponent ──► LoadedComponent
                                                              │
                                                              ▼
                              adapters.renderFor(platform) ──► RenderedFile[] + warnings
                                                              │
                                                              ▼
                 installer: plan ─► conflicts? ─► consent ─► journal ─► atomic writes ─► state
```

Adapters are pure: no I/O, no environment reads (environment is passed in `ResolveContext`).
That keeps them testable and makes the installer the only module that writes.

## Canonical component format

See [component-format.md](component-format.md).

## Stack-agnostic design

- **Universal agent domains**: `appsec`, `architecture`, `quality`, `performance`,
  `engineering`. A domain is required; there is no field for a language or framework.
- **Generic skills, optional specializations**: a skill reference with `appliesWhen` is a
  specialization. `appliesWhen` holds opaque detection signals (file names, globs, markers). The
  core validates their shape only and never interprets them, so new specializations are added as
  data (a reference file plus a manifest entry) without touching the core.
- **Dynamic detection, only when needed**: rendered instructions tell the model to identify the
  stack only when a finding depends on it, and to skip specializations whose signals are absent.
  No detection step runs up front, and no technology content enters the context unless matched.
- **No mandatory stack**: an audit runs with generic skills alone. Phase 1 ships no
  language/framework skills.

## Token strategy

| Mechanism               | How                                                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Minimal discovery       | Description is single-line, ≤1024 chars; validator warns above 200 chars because it is loaded every session            |
| Progressive disclosure  | `SKILL.md` contains instructions plus a one-line index of references; reference content stays in separate files        |
| Gated specializations   | Specializations are listed separately with their signals and skipped when signals are absent                           |
| No skill preloading     | Claude subagents do not use the `skills:` field, which preloads full skill content; skills are referenced by name      |
| Selective delegation    | Default budget `maxSubagents: 0`; Claude agents get the `Agent` tool only when the budget allows delegation            |
| Bounded investigation   | `budget.maxDepth` (1-5, default 2) rendered into instructions. Advisory: neither platform enforces depth               |
| Concise, evidence-based | Shared operating rules require concise reports with file/line evidence                                                 |
| Shared rules once       | Operating rules are generated by one function, not copied into every agent                                             |
| Honest metrics          | `estimateTokens` is labeled `estimated` (chars/4). Measured numbers will come only from platform data (see compat doc) |

Not promised: per-call token caps or hard depth limits. Neither platform exposes them per agent.

## Security model

- **Read-only by default.** The validator rejects `edit`/`shell` on `read-only` agents. `shell`
  counts as a write capability because no platform lets us portably limit a shell to read-only.
- **Enforcement differs by platform.** Claude Code: the `tools` allowlist enforces it. Codex:
  custom agents cannot set `sandbox_mode`, so read-only holds only when the session sandbox is
  `read-only`. The Codex adapter emits this as a warning and disables `shell_tool`.
- **Path safety.** Manifest paths must be relative, forward-slash, without `..`, drive letters or
  NUL; `resolveInside` confines resolved paths to the component directory. The installer also
  refuses any symbolic link (or junction) below a client's location dir.
- **No remote code.** Nothing is downloaded or executed. The catalog ships inside the npm package.
- **Installer:** plan first, no overwrite without interactive consent (never with `--yes`),
  all-or-nothing writes, no hooks, permissions, settings or instruction files are ever written.
  Details: [installer.md](installer.md).

## Skills engine (Phase 3)

The "engine" is install-time only: catalog validation, dependency resolution and rendering into
the clients' native Agent Skills format. Selecting and activating skills during a task is left to
Claude Code and Codex (description-based discovery). Deliberately absent: runtime router, LLM
selection calls, background process, telemetry.

- Discovery metadata = `name` + `description`; catalog metadata (`domain`, `capabilities`,
  `requires`) stays in `manifest.json`.
- Shared rules are generated once (`renderSkillSafety`, reference index) instead of copied.
- Skills delegate to each other by name (`requires`), e.g. audits use `evidence-reporting` for
  output and `repository-discovery` for the map, reusing an existing map when present.
- Generated files are validated (`src/validator/rendered.ts`) before the installer writes them.

## Agents (Phase 4)

- Canonical agents live in `agents/<group>/<id>/`; shared rules, analysis profiles
  (`src/core/profiles.ts`) and report fields are generated once into every agent prompt.
- Selection uses each client's own mechanism: descriptions (Claude Code), direct requests or the
  `review-planning` skill (Codex and Claude Code). No supervisor agent, no router, no cascades.
- Read-only is enforced natively where the client supports it (Claude Code tools allowlist and
  `permissionMode: plan`) and documented where it does not (Codex inherits the session sandbox).

## Evaluation (Phase 5)

Offline and local: benchmark cases with ground truth (`evals/`), quality metrics computed against
it, client usage imported only from files the user passes, and static checks (context size,
duplication, full-read phrases, search reachability) against accepted baselines. Measured,
estimated and unavailable values are never mixed. See [evaluation.md](evaluation.md).

## Extensibility

- New component: add a directory under `agents/` or `skills/[<group>/]`; no code change.
- New specialization: add a reference file with `appliesWhen`; no code change.
- New platform: implement `PlatformAdapter` and add it to `ADAPTERS` and `PLATFORMS`
  (see [adapters.md](adapters.md)). The installer, updater and CLI need no change.
- New capability or domain: extend the constant in `core/types.ts` and each adapter's mapping
  (the compiler flags every place that must handle it).
