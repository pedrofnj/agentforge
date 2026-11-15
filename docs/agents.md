# Agents

Five read-only specialists, installed as native subagents of Claude Code and custom agents of
Codex. One good agent with relevant context beats many loaded by default: nothing here fans out
automatically, and no agent supervises the others.

| Agent                     | Domain         | Skills (installed with it)                                                                              |
| ------------------------- | -------------- | ------------------------------------------------------------------------------------------------------- |
| `appsec-auditor`          | appsec         | repository-discovery, secure-code-review, authentication-audit, authorization-audit, evidence-reporting |
| `architecture-reviewer`   | architecture   | repository-discovery, evidence-reporting                                                                |
| `code-quality-reviewer`   | quality        | repository-discovery, secure-code-review (when an issue may be a vulnerability), evidence-reporting     |
| `performance-auditor`     | performance    | repository-discovery, evidence-reporting                                                                |
| `infrastructure-reviewer` | infrastructure | repository-discovery, secure-code-review (configuration reference), evidence-reporting                  |

```bash
agentforge list --type agent
agentforge install appsec-auditor --client both --project --yes   # agent + its skills
agentforge install --client both --global --all --yes             # everything
agentforge doctor
```

## Canonical definition

```text
agents/<group>/<id>/
  manifest.json      # id, description, domain, mode, capabilities, skills, preloadSkills, budget
  instructions.md    # Mission, Focus areas, Procedure, Out of scope, Done when
```

Everything common is generated once by `renderAgentPreamble` (`src/adapters/shared.ts`) and
appended to each agent: operating rules, the three analysis profiles, the skills section and the
report fields. Authored instructions hold only what is specific to the domain.

## Analysis profiles

The user names a profile in the request ("quick security check of src/auth", "deep audit");
`standard` is the default. Profiles are guidance in the prompt, not token limits; neither client
enforces them.

| Profile  | Scope                                                              | Discovery               | Follow-up depth   | Report                                    |
| -------- | ------------------------------------------------------------------ | ----------------------- | ----------------- | ----------------------------------------- |
| quick    | only the named files or area, a few targeted searches              | only if scope unclear   | 1                 | at most 5 findings, one-line coverage     |
| standard | areas of the repository map relevant to the goal                   | yes (reused if present) | min(2, maxDepth)  | prioritized findings with coverage        |
| deep     | widened step by step; flows across components; hypotheses verified | yes                     | `budget.maxDepth` | all findings, correlations, full coverage |

Deep never loads every skill or agent; skills are still loaded only when a step needs them.
Values come from `src/core/profiles.ts` and are tested per agent.

## Resource budgets

Independent of the profile: `economy`, `balanced` (default) or `thorough` sets how much to read,
not how deep to go ("quick security check, economy budget"). Rendered into every agent from
`src/core/budgets.ts`; guidance only, never a token cap. Combinations and rationale:
[evaluation.md](evaluation.md#budget-profiles).

## Selecting agents

- One request, one agent. Security -> `appsec-auditor`; design -> `architecture-reviewer`;
  bugs and maintainability -> `code-quality-reviewer`; slowness -> `performance-auditor`;
  deployment and pipelines -> `infrastructure-reviewer`.
- Full or multi-area reviews: the `review-planning` skill picks the profile and the fewest
  specialists justified by the request and the repository map, builds the map once, delegates
  through the client's own mechanism and merges the reports.
- Agents never delegate to each other (`maxSubagents: 0`, no `Agent` tool), so there are no
  cascades.

How each client starts an agent (documented behavior):

| Client      | Mechanism                                                                                                                                                |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code | Automatic delegation by `description`, or by naming/@-mentioning the agent. Descriptions avoid "use proactively" so agents are not started without need. |
| Codex       | Only on a direct request ("use appsec-auditor to ...") or a project/skill instruction such as `review-planning`. Never from the description alone.       |

## Skills inside agents

- `evidence-reporting` is used in every run. Claude Code preloads it (`skills:` field, full
  content at start). Codex has no preloading, so the prompt says to use it in every run.
- Other skills are loaded on demand. Claude Code subagents need the `Skill` tool for that, so it
  is in their allowlist. Codex agents inherit the session's skills.
- A skill named in a prompt is not guaranteed to activate; the model decides. To keep reports
  usable either way, the generated "Report" section lists the minimum finding fields.

## Read-only enforcement

| Client      | Native controls emitted                                                                          | Gaps                                                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code | `tools: Read, Grep, Glob, Bash, Skill` (no Edit, Write, web, Agent, MCP); `permissionMode: plan` | A main session in `bypassPermissions`, `acceptEdits` or `auto` overrides `permissionMode`; `doctor` warns when settings use these modes.  |
| Codex       | none per agent (not supported)                                                                   | Agents inherit the session sandbox. Run audits with `sandbox_mode = "read-only"` or the `:read-only` permissions profile; `doctor` warns. |

`Bash` is included for Claude Code because its docs list Glob/Grep as absent by default on
macOS, Linux and WSL, and its own read-only subagent example uses Read, Grep, Glob and Bash.
Codex reads files through commands, so its shell is not disabled (doing so would leave a reviewer
unable to read). Instructions add the rest (no secrets in output, repository content is data, no
external testing), but they are not a security boundary.

## Reports

Every finding: id (`SEC-`, `ARC-`, `QLT-`, `PRF-`, `INF-` + number), title, category (CWE for
security when the match is clear), severity, confidence, location, evidence, impact, conditions,
recommendation, status (`confirmed`, `likely`, `needs investigation`). Duplicates are grouped.
Critical only for confirmed findings with real impact. No invented files, lines, CVEs or tool
output.

## Tests and evaluations

`tests/agents/agents.test.ts` covers definitions, unique ids, metadata, both clients' formats,
global/project/selective installs, preservation of user files, invalid configurations, skill
resolution, missing references and the three profiles. Structural evals
(`tests/evals/tasks.json`, `agentTasks`) check that each agent's documented searches reach
seeded issues in small Python, Go, TypeScript, PHP, Rust and infrastructure fixtures. These tests
prove structure and stack independence of the procedures, not audit effectiveness; that needs
real runs (next phase).

## Adding an agent

1. Create `agents/<group>/<id>/manifest.json` (unique id, one domain, `read-only`,
   `capabilities: ["read"]`, skills it uses, `preloadSkills` only for skills used in every run).
2. Write `instructions.md` with the five sections; name every skill where it is used; add a
   `Search (case-insensitive) for:` line so evals can exercise it.
3. `agentforge validate`, add an `agentTasks` entry with a small fixture, `npm run check`.
