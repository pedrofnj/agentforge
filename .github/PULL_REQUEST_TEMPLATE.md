## What and why

<!-- English or Portuguese is fine. -->

## How it was verified

- [ ] `npm run check` passes
- [ ] `npm run smoke` passes (packaged CLI in a temp dir)
- [ ] `node dist/cli/bin.js eval validate` passes (if agents, skills or cases changed)
- [ ] Tests added or updated for behavior changes and regressions
- [ ] Not verified (say what and why, e.g. live Claude Code / Codex behavior):

## Checklist

- [ ] Agent/skill `version` bumped if its generated output changed
- [ ] Stays stack-agnostic; no unmeasured claims; no undocumented client settings
- [ ] Docs updated (both languages where a pt-BR page exists)
- [ ] `CHANGELOG.md` updated under `[Unreleased]`
