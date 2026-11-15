# Contributing to AgentForge

**English** · [Português (Brasil)](CONTRIBUTING.pt-BR.md)

Thanks for helping. Issues, discussions and pull requests are welcome in **English or
Portuguese**; code, docs and component text are written in English.

## Ground rules

- Keep it stack-agnostic: agents and skills must not depend on a language or framework.
  Technology knowledge belongs in optional references (`appliesWhen`), not in core text.
- Keep it honest: no unmeasured token savings, no claims that an audit is complete, no invented
  CVEs, files or tool output, no undocumented client settings.
- Keep it small: zero runtime dependencies; add dev dependencies only with a clear reason.
- Security first: never weaken read-only defaults, path checks or the installer's no-overwrite rule.
- Follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Setup

```bash
git clone https://github.com/pedrofnj/agentforge.git
cd agentforge
npm ci
npm run check     # typecheck, lint, format check, tests
npm run smoke     # build, pack and test the packaged CLI in a temp dir
```

Tests never touch your real `~/.claude`, `~/.codex` or `~/.agents`. Run the CLI from source with
`node dist/cli/bin.js` after `npm run build`, inside a throwaway project directory.

## What to change where

| Change             | Where                                                       | Check with                                                           |
| ------------------ | ----------------------------------------------------------- | -------------------------------------------------------------------- |
| A skill            | `skills/<group>/<id>/` (manifest, instructions, references) | `agentforge validate`, [docs/skills.md](docs/skills.md)              |
| An agent           | `agents/<group>/<id>/`                                      | `agentforge validate`, [docs/agents.md](docs/agents.md)              |
| A client adapter   | `src/adapters/<client>/`                                    | [docs/adapters.md](docs/adapters.md)                                 |
| Installer behavior | `src/installer/`                                            | tests in `tests/installer/`                                          |
| A benchmark case   | `evals/cases/*.json` + `evals/fixtures/`                    | `agentforge eval validate`, [docs/evaluation.md](docs/evaluation.md) |

When you change an agent or skill, bump its `version` in `manifest.json`, then run
`agentforge eval validate`. If it reports context growth or a reachability change that you
intend, update the baselines on purpose (see docs/evaluation.md) and explain why in the PR.

## Pull requests

1. Open an issue first for larger changes.
2. Keep PRs focused; include tests for behavior changes and regressions.
3. `npm run check` and `npm run smoke` must pass; CI runs them on Linux, macOS and Windows.
4. Add a line to `CHANGELOG.md` under `[Unreleased]`.
5. Describe what you verified and what you could not (for example, live client behavior).

## Reporting security issues

Do not open public issues for vulnerabilities. See [SECURITY.md](SECURITY.md).
