<p align="center">
  <img src="docs/assets/logo.svg" alt="AgentForge" width="420">
</p>

<p align="center">
  <strong>Read-only AI reviewers and skills for Claude Code and OpenAI Codex.<br>
  Any language, any framework, minimal context.</strong>
</p>

<p align="center">
  <a href="https://github.com/pedrofnj/agentforge/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/pedrofnj/agentforge/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
  <img alt="Node.js 22 or newer" src="https://img.shields.io/badge/node-%3E%3D22-339933.svg">
  <img alt="Clients: Claude Code and Codex" src="https://img.shields.io/badge/clients-Claude%20Code%20%7C%20Codex-6b7c93.svg">
  <img alt="Runtime dependencies: 0" src="https://img.shields.io/badge/runtime%20dependencies-0-brightgreen.svg">
</p>

<p align="center">
  <b>English</b> · <a href="README.pt-BR.md">Português (Brasil)</a>
</p>

---

AgentForge installs five specialist reviewers (security, architecture, code quality, performance,
infrastructure) and six reusable skills into **Claude Code** and **Codex**, in each client's
native format. They work on any stack, load detail only when a task needs it, and stay read-only
by default. One CLI installs, updates, checks and removes them safely.

> **Status: pre-release (0.1.0).** The CLI and the catalog are complete and tested; the package is
> **not on npm yet** (see [Known limitations](#known-limitations)). Until then, install from a
> local package as shown below.

## Why AgentForge

- **One reviewer per question.** Ask the AppSec auditor about security and get a focused,
  evidence-based report, without loading every agent and skill.
- **Context-aware by design.** Clients see only a short description of each skill; instructions
  load when the skill is used, and detailed references only when a step needs them.
- **Stack-agnostic.** No agent or skill names a language or framework; they search for patterns
  that exist in any codebase. Tested against fixtures in Python, Go, TypeScript, PHP, Rust, Java
  and infrastructure files.
- **Evidence, not guesses.** Every finding has a file and line, a status (confirmed, likely or
  needs investigation) and a recommendation. Nothing is reported without evidence.
- **Safe installer.** Plans before writing, never overwrites your files without asking, refuses
  symlinks, rolls back interrupted operations, and removes only files it can prove it installed.

## Compatibility

|                       | Claude Code                              | OpenAI Codex                            |
| --------------------- | ---------------------------------------- | --------------------------------------- |
| Skills (`SKILL.md`)   | `~/.claude/skills`, `.claude/skills`     | `~/.agents/skills`, `.agents/skills`    |
| Agents                | Subagents (`.claude/agents/*.md`)        | Custom agents (`.codex/agents/*.toml`)  |
| Read-only enforcement | Tool allowlist + `permissionMode: plan`  | Session sandbox (`--sandbox read-only`) |
| How an agent starts   | Automatically by description, or by name | When you ask for it by name             |

Operating systems: Linux, macOS and Windows (CI runs all three on Node.js 22 and 24).
Details: [docs/platform-compatibility.md](docs/platform-compatibility.md).

## Quick start

> **Coming with the first npm release (not published yet):**
>
> ```bash
> npx @pedrofnj/agentforge@latest install
> ```
>
> This command will work once version 0.1.0 is on npm. Until then, use the steps below.

**Today (from source).** Requires Node.js 22 or newer:

```bash
git clone https://github.com/pedrofnj/agentforge.git
cd agentforge
npm ci && npm run build && npm pack
npm install --global ./pedrofnj-agentforge-0.1.0.tgz
```

Then, **in your project**:

```bash
agentforge install     # asks: Claude Code, Codex or both; this project or global; which agents and skills
agentforge doctor      # checks the installation
```

The installer shows the plan and asks before writing anything. The command is always
`agentforge`, whichever way you installed it.

## Usage examples

Ask in Claude Code or Codex after installing:

```text
Use the appsec-auditor agent to review src/ (quick profile, economy budget).
Use the architecture-reviewer agent on this repository.
Use the performance-auditor agent: the /reports endpoint is slow.
Plan a full review of this repository with the fewest reviewers needed.   ← review-planning skill
```

Non-interactive installs (CI, scripts):

```bash
agentforge install appsec-auditor --client claude --project --yes   # one agent + its skills
agentforge install --client both --global --all --yes               # everything, all projects
agentforge install --client codex --project --all --dry-run         # preview only
```

A real session recorded with the CLI: [docs/demo.md](docs/demo.md).

## Agents

| Agent                     | Reviews                                                                                              | Skills it uses                                                                                          |
| ------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `appsec-auditor`          | Attack surface, authentication, authorization, injection, secrets, configuration, APIs, supply chain | repository-discovery, secure-code-review, authentication-audit, authorization-audit, evidence-reporting |
| `architecture-reviewer`   | Boundaries, coupling, dependencies, scalability, resilience, unnecessary complexity                  | repository-discovery, evidence-reporting                                                                |
| `code-quality-reviewer`   | Probable defects, error handling, race conditions, risky duplication, test gaps                      | repository-discovery, secure-code-review, evidence-reporting                                            |
| `performance-auditor`     | Algorithmic cost, queries, repeated work, memory, I/O, caching                                       | repository-discovery, evidence-reporting                                                                |
| `infrastructure-reviewer` | Containers, CI/CD, permissions, network exposure, secrets, operations                                | repository-discovery, secure-code-review, evidence-reporting                                            |

All agents are read-only and never delegate to each other. More: [docs/agents.md](docs/agents.md).

## Skills

| Skill                  | Purpose                                                                           |
| ---------------------- | --------------------------------------------------------------------------------- |
| `repository-discovery` | Map a repository with minimal reading: ecosystems, entry points, sensitive areas  |
| `secure-code-review`   | Evidence-based security review of code or a diff                                  |
| `authentication-audit` | Login, credential storage, sessions, tokens, MFA                                  |
| `authorization-audit`  | Access checks, roles, object ownership (IDOR), tenant isolation                   |
| `evidence-reporting`   | Report format: id, category/CWE, severity, confidence, location, evidence, status |
| `review-planning`      | Pick the profile and the fewest reviewers for a broad review, then merge reports  |

Skills work on their own too ("review src/auth for security issues"). More: [docs/skills.md](docs/skills.md).

## Profiles and budgets

Name them in your request; defaults are `standard` and `balanced`.

| Profile    | Use it for                                                   |
| ---------- | ------------------------------------------------------------ |
| `quick`    | One file or area, obvious problems first, at most 5 findings |
| `standard` | A normal review: repository map, then the relevant areas     |
| `deep`     | A full audit: flows across components, hypotheses verified   |

| Budget     | How much to read                                                |
| ---------- | --------------------------------------------------------------- |
| `economy`  | Only matched regions; references only when a finding needs them |
| `balanced` | Whole functions on the traced path                              |
| `thorough` | Whole relevant files; try to resolve open questions             |

Profiles and budgets are instructions to the model, not token limits: no client exposes per-run
caps, and AgentForge cannot change your plan's quotas.

## Saving tokens

- Install only what you need: `agentforge install appsec-auditor --client claude --project`.
- Ask for one agent by name; use `review-planning` only for broad reviews.
- Start with `quick` + `economy`; go `deep` only where the quick pass found something.
- The always-loaded skill list is about 1,400 characters for all six skills (measured with
  `agentforge stats`); instructions and references load on demand.

Guide for limited plans: [docs/guides/low-cost-usage.md](docs/guides/low-cost-usage.md).
AgentForge does not claim token savings it has not measured; see [docs/evaluation.md](docs/evaluation.md).

## Security and permissions

- Agents are read-only. In Claude Code this is enforced by the tool allowlist and plan mode
  (overridden if your session runs in bypass, accept-edits or auto mode; `agentforge doctor`
  warns). Codex agents follow the session sandbox: run audits with `--sandbox read-only`.
- Instructions treat repository content as data, mask secrets in reports and forbid testing
  external systems; instructions are not a security boundary.
- The installer never writes settings, hooks, permissions, `CLAUDE.md` or `AGENTS.md`, never runs
  scripts, and has no runtime dependencies.
- Report vulnerabilities privately: [SECURITY.md](SECURITY.md).

## Global vs. project installs

|                  | Global (`--global`)                    | Project (`--project`, current directory)             |
| ---------------- | -------------------------------------- | ---------------------------------------------------- |
| Claude Code      | `~/.claude/skills`, `~/.claude/agents` | `.claude/skills`, `.claude/agents`                   |
| Codex            | `~/.agents/skills`, `~/.codex/agents`  | `.agents/skills`, `.codex/agents` (trusted projects) |
| AgentForge state | your OS user state directory           | `.agentforge/`                                       |

Guide: [docs/guides/installation.md](docs/guides/installation.md).

## Update and uninstall

```bash
agentforge update --project --yes            # keeps files you edited
agentforge uninstall --project --all --yes   # removes only unmodified AgentForge files
agentforge uninstall appsec-auditor --client codex --global --dry-run
```

Guides: [updating](docs/guides/updating.md) · [uninstalling](docs/guides/uninstalling.md) ·
[troubleshooting](docs/guides/troubleshooting.md).

## Known limitations

- **Not published to npm yet.** The package will be `@pedrofnj/agentforge` (the command is
  `agentforge`).
- **Effectiveness not measured yet.** Benchmarks with ground truth exist and run offline, but no
  real Claude Code or Codex session has been evaluated. Structural tests do not prove that
  audits find everything. No audit guarantees the absence of vulnerabilities.
- The generated files follow the clients' documentation but have not yet been loaded in live
  sessions of both clients.
- Codex cannot make a single agent read-only; the session sandbox decides.

## Contributing

Issues and pull requests are welcome in English or Portuguese. Start with
[CONTRIBUTING.md](CONTRIBUTING.md); changes to agents and skills are checked by
`agentforge validate` and `agentforge eval validate`.

## License

[MIT](LICENSE) © pedrofnj
