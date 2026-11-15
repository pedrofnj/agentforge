# Skills

AgentForge ships universal, stack-agnostic skills (used directly or by the agents in
[agents.md](agents.md)) and installs them in each client's native
Agent Skills format. At runtime the client discovers and activates skills on its own;
AgentForge adds no router, background process or extra model call.

## Bundled skills

| Skill                  | Domain   | Purpose                                                                                               | Requires                                 |
| ---------------------- | -------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `repository-discovery` | workflow | Minimal-reading repository map (ecosystems, entry points)                                             | -                                        |
| `evidence-reporting`   | workflow | Report format: id, category/CWE, severity, confidence, location, evidence, impact, conditions, status | -                                        |
| `review-planning`      | workflow | Pick the profile and the fewest specialist agents; merge their reports                                | repository-discovery, evidence-reporting |
| `secure-code-review`   | appsec   | Evidence-based security review of code or a diff                                                      | repository-discovery, evidence-reporting |
| `authentication-audit` | appsec   | Login, credentials, sessions, tokens, MFA                                                             | repository-discovery, evidence-reporting |
| `authorization-audit`  | appsec   | Access checks, roles, object ownership, tenant isolation                                              | repository-discovery, evidence-reporting |

All are read-only (`capabilities: ["read"]`). Installing a skill installs what it requires.

## Progressive loading

| Level           | Content                                             | When the client loads it                 |
| --------------- | --------------------------------------------------- | ---------------------------------------- |
| 1. Discovery    | `name` + `description` (what it does + when to use) | Every session, in the skill list         |
| 2. Instructions | Generated `SKILL.md` body                           | When the skill is activated              |
| 3. References   | `references/*.md`                                   | Only when a procedure step points to one |

How each level is enforced:

- Level 1 is kept small by the validator (description ≤1024 chars, warning above 300) and by the
  catalog test that keeps the whole list under 25% of Codex's 8,000-char fallback budget.
- Level 2 contains only authored instructions plus two generated sections (safety rules and a
  one-line index of references). Reference bodies are never inlined.
- Level 3 is read by the model on demand; procedures name the exact reference per situation
  (e.g. tokens -> `references/token-validation.md`).
- Activation and reading are done by the client. AgentForge cannot force or measure them;
  `agentforge stats` measures sizes, not runtime consumption.

## Creating a skill

```text
skills/<group>/<id>/
  manifest.json      # catalog metadata (never copied verbatim to clients)
  instructions.md    # authored body of SKILL.md
  references/*.md    # optional, one topic per file, linked from instructions or the index
```

`<group>` (e.g. `security`, `workflows`) only organizes the repository; clients see flat ids.

`manifest.json`:

```json
{
  "schemaVersion": 1,
  "kind": "skill",
  "id": "my-skill",
  "name": "My skill",
  "version": "0.1.0",
  "description": "What it does in one sentence. Use when <trigger>.",
  "targets": ["claude-code", "codex"],
  "domain": "appsec",
  "capabilities": ["read"],
  "requires": ["evidence-reporting"],
  "references": [{ "path": "references/topic.md", "description": "One line: when to read it." }]
}
```

`instructions.md` must have these sections (checked by `agentforge validate`):

```markdown
# My skill

## Goal

## When to use

## When not to use

## Procedure

## Done when
```

Writing rules:

- Description: what + when, key use case first, no stack names. Clients pick skills by it.
- Procedure: numbered, targeted searches before reading files. Write searches as
  ``Search (case-insensitive) for: `a|b|c` `` so eval tests can run them against fixtures.
- Name every required skill in the text where it is used (`unused-requirement` otherwise).
- Do not write safety rules or a references list: they are generated from the manifest.
- Keep it stack-agnostic. Technology-specific knowledge goes into an optional reference with
  `appliesWhen` signals (see [component-format.md](component-format.md)).
- Stop rules over size limits: say when to stop investigating instead of adding text.

## Organizing references

- One focused topic per file, one level below the skill (`references/<topic>.md`).
- Each reference has a one-line `description` saying when to read it; that line is all that
  appears in `SKILL.md`.
- Point to references from the procedure step that needs them, conditionally.
- Specializations (`appliesWhen`) are listed in a separate section and skipped when their signals
  are absent.

## Validating

```bash
agentforge validate --catalog .       # manifests, sections, dependencies, generated files
agentforge stats --catalog .          # sizes, discovery budget, duplicated lines
npm test                              # includes the multi-language eval fixtures
```

`validate` renders every skill for every target client and checks the generated `SKILL.md`
against the Agent Skills rules (name = directory, 1-64 chars, description 1-1024 chars, only
standard fields). The installer runs the same check before writing.

## Installing

```bash
agentforge list --type skill --domain appsec
agentforge install --client both --global --all --yes        # all users' projects
agentforge install secure-code-review --client codex --project --yes
agentforge update --global --yes                             # local edits are preserved
```

| Client      | Global                   | Project                |
| ----------- | ------------------------ | ---------------------- |
| Claude Code | `~/.claude/skills/<id>/` | `.claude/skills/<id>/` |
| Codex       | `~/.agents/skills/<id>/` | `.agents/skills/<id>/` |

## Claude Code vs Codex

| Aspect            | Claude Code                                          | Codex                                                |
| ----------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| Selection         | Automatic by description; `/skill-name` manually     | Automatic by description; `$skill-name` or `/skills` |
| Listing budget    | ~1% of context; description+when_to_use cut at 1,536 | 2% of context, or 8,000 chars when unknown           |
| Extra frontmatter | Many optional fields (ignored when unknown)          | Only name/description documented                     |
| New skills        | Watched directories; restart for a new top-level dir | Detected automatically; restart if missing           |
| Tool restriction  | `disallowed-tools` exists but is not emitted*        | None per skill                                       |

\* AgentForge emits only `name` and `description`, so files are identical for both clients.
`allowed-tools` is never emitted because it pre-approves tools instead of restricting them.
`disallowed-tools` was not adopted because the docs do not define how long a skill stays active;
read-only behavior relies on instructions plus the client's permissions or sandbox.

Skill instructions guide the model; they do not replace permissions or sandboxing.

## Evaluations

`tests/evals/tasks.json` defines tasks over small projects in five languages
(`tests/fixtures/projects`). Without calling any model, tests verify that:

- each seeded issue exists exactly once;
- the skill's documented searches (plus those of required skills, plus one hop to files they
  name) reach the affected file in every language;
- each task needs only a subset of the skill's references.

Baseline (2026-11-15): 43% of a skill's references needed per task on average; 73% of fixture
files reachable (fixtures are tiny, so this ratio is pessimistic). These are static
approximations of reading, not measurements of model behavior.

## Contributing a skill

1. Add `skills/<group>/<id>/` with manifest, instructions and references.
2. `npm run build && node dist/cli/bin.js validate && node dist/cli/bin.js stats`.
3. Add at least one task to `tests/evals/tasks.json` per fixture language where the skill applies.
4. `npm run check`. The catalog tests fail on stack names, missing sections, oversized
   discovery metadata or new authored duplication.
