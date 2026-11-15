# Canonical component format

Each component is a directory whose name equals its `id`:

```
skills/[<group>/]<id>/
  manifest.json      # metadata, read at discovery
  instructions.md    # body, read on invocation
  references/*.md    # optional, read only when needed
agents/<id>/
  manifest.json
  instructions.md
```

`manifest.json` is plain JSON (no YAML parser needed, zero runtime dependencies).

## Common fields

| Field           | Rule                                                         |
| --------------- | ------------------------------------------------------------ |
| `schemaVersion` | `1`                                                          |
| `kind`          | `skill` or `agent`; must match the parent directory          |
| `id`            | kebab-case `[a-z0-9-]`, ≤64 chars, equals directory name     |
| `name`          | optional display name (catalog only)                         |
| `version`       | semver                                                       |
| `description`   | single line, ≤1024 chars (warning above 300: discovery cost) |
| `targets`       | non-empty subset of `claude-code`, `codex`                   |
| `tags`          | optional string array                                        |

## Skill

```json
{
  "schemaVersion": 1,
  "kind": "skill",
  "id": "secure-review",
  "version": "0.1.0",
  "description": "Generic secure code review checklist. Use when auditing code for vulnerabilities.",
  "targets": ["claude-code", "codex"],
  "references": [
    { "path": "references/injection.md", "description": "Injection patterns, any stack." },
    {
      "path": "references/specializations/<stack>.md",
      "description": "Stack-specific notes.",
      "appliesWhen": ["<marker file or glob>"]
    }
  ]
}
```

- References without `appliesWhen` are generic.
- References with `appliesWhen` are specializations. Signals are opaque strings the model checks
  in the target project; the core does not interpret them.
- Reserved reference paths: `SKILL.md`, `manifest.json`, `instructions.md`.
- Optional catalog-only fields (never written to client files):
  - `domain`: `appsec`, `architecture`, `quality`, `performance`, `engineering`, `workflow`.
  - `capabilities`: what the procedure needs (default `["read"]`). A component cannot depend on a
    skill that needs capabilities it lacks.
  - `requires`: skills used by name in the instructions; installed together; cycles, unknown ids
    and target mismatches are errors.
- A skill directory may sit one level inside a group directory (`skills/security/<id>/`).
  Ids stay globally unique. See [skills.md](skills.md) for authoring rules.

## Agent

```json
{
  "schemaVersion": 1,
  "kind": "agent",
  "id": "appsec-auditor",
  "version": "0.1.0",
  "description": "Read-only application security auditor.",
  "targets": ["claude-code", "codex"],
  "domain": "appsec",
  "mode": "read-only",
  "capabilities": ["read"],
  "model": "balanced",
  "skills": ["secure-review"],
  "budget": { "maxDepth": 2, "maxSubagents": 0 }
}
```

| Field           | Values                                                                              |
| --------------- | ----------------------------------------------------------------------------------- |
| `domain`        | `appsec`, `architecture`, `quality`, `performance`, `infrastructure`, `engineering` |
| `mode`          | `read-only` (rejects `edit`, `shell`), `read-write`                                 |
| `capabilities`  | `read`, `edit`, `shell`, `web`                                                      |
| `model`         | optional: `inherit`, `fast`, `balanced`, `deep`                                     |
| `skills`        | optional skill ids; must exist and support all of the agent's targets               |
| `preloadSkills` | optional subset of `skills` used in every run (Claude Code preloads them)           |
| `budget`        | optional; `maxDepth` 1-5 (default 2), `maxSubagents` 0-4 (default 0)                |

Agents may also sit one level inside a group directory (`agents/security/<id>/`). Authored
instructions need `## Mission`, `## Focus areas`, `## Procedure`, `## Out of scope` and
`## Done when`. The illustrative ids above are examples of the format; see [agents.md](agents.md)
for the shipped agents.
