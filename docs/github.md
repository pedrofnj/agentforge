# GitHub presentation (to apply manually)

Nothing here is applied automatically; the repository owner sets these in the GitHub UI.

**Description** (About box):

> Read-only AI reviewers and skills for Claude Code and OpenAI Codex. Security, architecture,
> quality, performance and infrastructure reviews for any stack, with minimal context.

**Website:** leave empty until there is a docs site or npm page.

**Topics:** `claude-code`, `codex`, `openai-codex`, `ai-agents`, `agent-skills`, `code-review`,
`security-audit`, `appsec`, `cli`, `developer-tools`, `llm`, `static-analysis`, `typescript`

**Settings to enable:**

- Security → Private vulnerability reporting (referenced by SECURITY.md).
- Environments → `npm-release` with required reviewers (used by `release.yml`).
- Branch protection on `master`: require the CI and package validation checks.
- Dependabot alerts and security updates (version updates are configured in `.github/dependabot.yml`).
- Optional: Discussions, for usage questions in English or Portuguese.

**Social preview image:** export `docs/assets/logo.svg` to a 1280×640 PNG with a dark background.
