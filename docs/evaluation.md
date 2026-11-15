# Evaluation and token optimization

Local-first, offline evaluation: no paid calls, no telemetry, no database, no services.
Benchmarks (`evals/`) live in the repository and are not part of the npm package: run
`agentforge eval` from a checkout (or pass `--evals <dir>`). Real
agent runs are optional, started by you, and imported from files you choose.

> Status (2026-11-15): no real agent runs have been evaluated yet. Behavioral effectiveness
> (precision, recall, tokens per finding) **has not been measured**. Everything below that is
> reported as a result is static (procedures, file sizes) unless a run file says otherwise.

## Layout

```text
src/evaluation/
  core/        contracts (types.ts), benchmark loading/validation (cases.ts), run files (run.ts)
  metrics/     quality.ts (ground-truth matching), context.ts (static context sizes)
  collectors/  Claude Code json, Codex exec jsonl, report Markdown parsers
  analyzers/   structure.ts (regressions), reachability.ts (static search reach), compare.ts
  reporters/   report.ts (JSON), markdown.ts, sanitize.ts
evals/
  cases/       benchmark cases with ground truth (one file per category)
  fixtures/    small projects: Python, Go, TypeScript, PHP, Rust, Java, infrastructure files
  baselines/   accepted baselines (context.json, reachability.json) and pre-Phase-5 copies
  schemas/     JSON Schemas documenting case and run files
```

Kinds of evaluation, kept apart:

| Kind               | Needs a model    | What it tells you                                        | Where                                  |
| ------------------ | ---------------- | -------------------------------------------------------- | -------------------------------------- |
| Deterministic      | no               | Ground truth valid, catalog structure, search reach      | `agentforge eval validate`, `npm test` |
| Context efficiency | no               | Sizes of what clients load (files, not consumed context) | `agentforge stats`                     |
| Behavioral         | yes (you run it) | Precision, recall, F1, FP rate, evidence validity        | `eval import` + `eval report`          |
| Consumption        | yes (you run it) | Tokens, cost, turns, tool calls as the client reported   | `eval import` + `eval report`          |
| Comparison         | no               | Deltas and regressions between two reports or runs       | `agentforge eval compare`              |

## Benchmarks and ground truth

43 cases (35 vulnerable, 8 safe) over 7 fixtures:

| Category       | Subcategories                                                                                                                                               |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| security       | insecure authentication, insufficient authorization, IDOR/BOLA, secret exposure, input validation, injection, insecure configuration, vulnerable dependency |
| architecture   | circular dependency, excessive coupling, mixed responsibilities, unnecessary complexity                                                                     |
| quality        | error handling, logic defect, race condition, harmful duplication, insufficient tests                                                                       |
| performance    | algorithmic complexity, repeated work, inefficient queries, memory usage                                                                                    |
| infrastructure | insecure configuration, excessive permissions, secret exposure, isolation                                                                                   |

Every case has: id, category, description, fixture, agent, files, acceptance and false-positive
criteria, limitations; vulnerable cases add the expected issue, evidence (`file` + text that must
occur on exactly one line), severity, keywords and optionally a CWE; safe cases add the keywords
that turn a finding in their files into a false positive. Fixtures contain no comments that
describe the bug. `eval validate` resolves every evidence line and fails on ambiguity.

The one dependency case uses a real, widely documented advisory (log4j-core 2.14.1,
CVE-2021-44228); no other CVE is claimed anywhere.

## Quality metrics (definitions)

- **Scope** of a run: cases with the run's fixture and agent.
- **Considered findings**: status `confirmed` or `likely` (or no status). `needs investigation`
  items are counted separately and are neither true nor false positives.
- **Detection**: a considered finding whose location is in an evidence file within 5 lines of
  an evidence line **and** whose title/category/CWE names the problem (case keywords or CWE).
  Naming the category without the location never counts. A second finding for an already
  detected case is a duplicate (not a true or false positive).
- **Precision** = TP / (TP + FP). Unavailable when no considered findings were reported.
- **Recall** = detected vulnerable cases / vulnerable cases in scope. Unavailable with no cases.
- **F1** = 2PR / (P + R); 0 when P + R = 0; unavailable unless both are measured.
- **False positive rate** = safe cases flagged / safe cases in scope (case level).
- **Evidence validity** = findings whose file and line exist in the fixture (and whose quoted
  evidence, when quoted and unmasked, appears in the file) / all reported findings.
- **Severity agreement** = detections within one level of the expected severity / detections
  that stated a severity.
- **Task success** = (detected vulnerable + unflagged safe cases) / cases in scope.
- **Case coverage** (suite) = cases in scope of at least one run / all cases.

Aggregates per client, agent, profile and budget are micro-averaged from the raw counts.

## Measured, estimated, unavailable

Every metric carries one of the three statuses and a note. Quality metrics are measured against
ground truth. Token metrics are exactly what the client reported:

| Client      | Source (documented)                                                                                                                          | Categories kept                               | Total                                                                                    |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Claude Code | `claude -p --output-format json`: `modelUsage` (includes subagents) or `usage` (excludes them), `total_cost_usd`, `duration_ms`, `num_turns` | input, output, cache read, cache write        | Sum of the four (Anthropic documents them as disjoint)                                   |
| Codex       | `codex exec --json`: `turn.completed.usage`, `command_execution` and `agent_message` items                                                   | input, cached input, output, reasoning output | **Unavailable**: whether cached/reasoning are included in input/output is not documented |

Tool calls: Codex `command_execution` items are counted; Claude Code's json result has no
documented tool-call data, so tool calls, files read and repeated reads are `unavailable`.
Delegations are unavailable for both. Character-based token figures (`stats`) are always labeled
estimates and are file sizes, not consumed context.

## Budget profiles

Independent of analysis profiles: the profile says how deep to go, the budget how much to read.
Both are prompt guidance rendered into every agent; no client exposes per-run token caps, and
AgentForge cannot see or control subscription quotas.

| Budget   | Guidance                                                                                                             |
| -------- | -------------------------------------------------------------------------------------------------------------------- |
| economy  | read only matched regions; open a reference only when a finding depends on it; stop at the first sufficient evidence |
| balanced | whole functions on the traced path; references for the classes encountered (default)                                 |
| thorough | whole relevant files; references for every class encountered; try to resolve needs-investigation items               |

All nine combinations are valid. Typical: `quick + economy` (cheapest triage), `standard +
balanced` (default), `deep + thorough` (full audit). `quick + thorough` means a narrow scope
verified carefully; `deep + economy` means wide tracing with minimal reading per step. With
`economy`, `review-planning` uses one specialist unless several areas were requested.

## Structural checks and baselines

`agentforge eval validate` (and the test suite) fail when, against `evals/baselines/`:

- the always-loaded skill list grows more than 10%, a SKILL.md more than 20%, or an agent's
  startup context (prompt + preloaded skills) more than 20%;
- authored lines duplicated across skills increase;
- instructions encourage reading everything (`read all files`, `read the entire repository`...);
- static search reach drops, or searches get broader (mean reachable share +5 points).

Agents that delegate or preload more than one skill produce warnings. Updating a baseline is a
deliberate act: `agentforge stats --json > evals/baselines/context.json` and
`node scripts/reach-baseline.mjs evals/baselines/reachability.json` (refuses to overwrite).

## Findings from the baseline and changes applied

Baselines were recorded before any change (`*-phase4.json`).

| Measurement (static)                                         | Before (Phase 4)  | After (Phase 5)                                                                        |
| ------------------------------------------------------------ | ----------------- | -------------------------------------------------------------------------------------- |
| Cases whose evidence file the documented searches reach      | 40 / 50           | 50 / 50                                                                                |
| Mean share of fixture files reachable                        | 66.2%             | 76.9% (broader searches; the cost of the gain)                                         |
| Always-loaded skill list                                     | 1,394 chars       | 1,394 chars                                                                            |
| Agent startup, Claude Code (prompt + preloaded report skill) | 7,364-7,596 chars | 7,786-7,960 (+4.8-6.8%)                                                                |
| Agent startup, Codex (prompt)                                | 4,206-4,438 chars | 4,767-4,941 (+11.3-15.2%)                                                              |
| Authored duplicated lines across skills                      | 1                 | 1                                                                                      |
| SKILL.md sizes                                               | 2,459-3,097 chars | unchanged except secure-code-review +58, repository-discovery +8, review-planning +178 |

Problems found and fixed (procedure design, language-neutral):

- Ten case/component pairs were unreachable by the documented searches: dependency manifests
  were never searched (secure-code-review), infrastructure files were found only by content
  (IAM-style policies missed), repository-discovery's sensitive path names were not
  machine-checkable, and performance/quality/architecture searches missed collection scans,
  regex compilation, `<= len` bounds, validators and factory/registry indirection.
- Claude Code agents repeated the report field list that the preloaded evidence-reporting skill
  already provides; the line now points to the skill (Codex keeps the list, since it cannot
  preload).
- Budget guidance was shortened after a first draft added ~18% to Codex agents. The remaining
  growth comes from the new budget section and the added search terms; it stays under the 20%
  regression limit and buys the reachability gain above. Whether it changes real token use is
  not known until real runs are imported.

Not changed on purpose: the safety rules (generated once, repeated per loaded skill by design),
and the authored line shared by the two audit skills (one line; merging it would couple them).

## Real runs (optional, manual)

Nothing runs a model for you. To evaluate one agent on one fixture:

```bash
cp -r evals/fixtures/php-app /tmp/af-php && cd /tmp/af-php && git init -q
agentforge install appsec-auditor --client claude --project --yes
claude -p "Use the appsec-auditor agent with the standard profile and balanced budget to audit this repository." \
  --output-format json > /tmp/claude-php.json
agentforge eval import /tmp/claude-php.json --from claude-json --agent appsec-auditor \
  --fixture php-app --profile standard --budget balanced --out runs/claude-php.json
```

```bash
codex exec --json --sandbox read-only \
  "Use the appsec-auditor agent with the quick profile and economy budget to audit this repository." \
  > /tmp/codex-php.jsonl
agentforge eval import /tmp/codex-php.jsonl --from codex-jsonl --agent appsec-auditor \
  --fixture php-app --profile quick --budget economy --out runs/codex-php.json
```

Then `agentforge eval report runs/*.json` (or `--json`) and `agentforge eval compare a.json b.json`
(exit code 1 when it finds regressions). Reports carry the AgentForge version and a digest of
the cases so comparisons across different benchmarks are flagged.

- Prerequisites: an installed, signed-in Claude Code or Codex; a copy of the fixture (never your
  real repository for benchmarking).
- Cost: each run consumes your plan's usage or API credits like any other session; deep/thorough
  runs on all fixtures can be large. Start with one agent, one fixture, `quick + economy`.
- Permissions: run audits read-only (Claude Code default/plan permissions; Codex
  `--sandbox read-only`). Do not use bypass or full-access modes for benchmarks.
- Privacy: import reads only the file you pass, keeps findings and numeric usage, drops
  transcripts and commands, and redacts secret-like strings and your home path.
- Limitations: one run is anecdotal (models are non-deterministic); repeat runs and compare
  aggregates. Fixtures are small; results do not generalize to large repositories by themselves.
- `--from report-md` imports a pasted final report when no structured output exists (no usage);
  `--from manual` validates a hand-written run file (`evals/schemas/run-result.schema.json`).
