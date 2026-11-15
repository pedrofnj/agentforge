# Platform compatibility: Claude Code vs OpenAI Codex

Checked against official docs on 2026-11-15 (re-verified for Phase 2 the same day):

- Claude Code: code.claude.com/docs/en/ `skills`, `sub-agents`, `settings`, `permissions`,
  `costs`, `statusline`, `monitoring-usage`.
- Codex: developers.openai.com/codex now redirects to learn.chatgpt.com/docs/: `build-skills`,
  `agent-configuration/agents-md`, `agent-configuration/subagents`, `config-file/config-reference`
  (partially read), `agent-approvals-security`, `extend/mcp`, `non-interactive-mode`.

Re-check these before each phase that touches the adapters. Platform docs change often.

## How AgentForge maps to each platform

| Concept              | Claude Code                                                                           | Codex                                                                      |
| -------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Skill file           | `SKILL.md` with `name`, `description` frontmatter                                     | `SKILL.md` with `name`, `description` (Agent Skills standard)              |
| Skill dir (global)   | `~/.claude/skills/<id>/` (Windows: `%USERPROFILE%\.claude`)                           | `~/.agents/skills/<id>/`                                                   |
| Skill dir (project)  | `.claude/skills/<id>/`                                                                | `.agents/skills/<id>/` (also scanned from parent dirs up to repo root)     |
| Skill discovery cost | name+description listing, ~1% of context, 1,536-char cap                              | name+description+path, ~2% of context or 8,000 chars                       |
| Agent file           | `.claude/agents/<id>.md`, YAML frontmatter, body = prompt                             | `.codex/agents/<id>.toml`: `name`, `description`, `developer_instructions` |
| Agent dir (global)   | `~/.claude/agents/`                                                                   | `$CODEX_HOME/agents/` (default `~/.codex/agents/`)                         |
| Project agents       | always loaded                                                                         | project config loads only for **trusted** projects (see uncertainties)     |
| Tool restriction     | `tools` allowlist / `disallowedTools`                                                 | feature switches only; `features.shell_tool` not emitted (see agents)      |
| Read-only per agent  | **Enforced** by omitting Edit/Write/Bash from `tools`                                 | **Not enforceable**: agents cannot override `sandbox_mode`                 |
| Model selection      | `model`: `haiku`/`sonnet`/`opus`/`fable`/full id/`inherit`                            | `model`, `model_reasoning_effort` (no tiers)                               |
| Delegation           | `Agent` tool; we add it only when `maxSubagents > 0`                                  | global `[agents] max_concurrent_threads_per_session`                       |
| Depth limit          | none per agent (advisory in instructions)                                             | none per agent (advisory in instructions)                                  |
| Agent identity       | `name` field; built-ins: general-purpose, statusline-setup, claude-code-guide         | `name` field; built-ins default, worker, explorer (custom wins)            |
| Live reload          | agents and skills dirs watched; new top-level dir may need restart / `/reload-skills` | skills detected automatically; restart if not                              |

Tier mapping used by the adapters:

| Tier       | Claude Code | Codex `model_reasoning_effort` |
| ---------- | ----------- | ------------------------------ |
| `inherit`  | `inherit`   | omitted                        |
| `fast`     | `haiku`     | `low`                          |
| `balanced` | `sonnet`    | `medium`                       |
| `deep`     | `opus`      | `high`                         |

Codex has no per-agent model tiers, so reasoning effort is a proxy, not an equivalent.

## Known differences that matter

- **Read-only.** Claude Code enforces it per agent. Codex does not: the Codex adapter warns and
  disables the shell tool; real enforcement needs `sandbox_mode = "read-only"` for the session
  (or the "Read-only" preset). The installer must tell the user this.
- **Skill preloading.** Claude subagents' `skills:` field injects full skill content at start.
  AgentForge does not use it (it defeats lazy loading); agents reference skills by name instead.
- **Web access.** Claude: `WebFetch`/`WebSearch` tools per agent. Codex: `web_search` is a session
  setting, so the `web` capability is advisory there (adapter warns).
- **Hooks.** Claude Code supports hooks in settings files. AgentForge writes none by default.
  Codex hooks were not reviewed.
- **Custom config dirs.** `CODEX_HOME` is documented as the root of Codex config (it must exist),
  so Codex agents follow it. `CLAUDE_CONFIG_DIR` is documented to move settings, history and
  plugins, but not agents/skills, so AgentForge keeps using `~/.claude` and `doctor` warns.
  Codex user skills live in `$HOME/.agents/skills`; no env var to move them is documented.
- **Built-in names.** Installing an agent whose id equals a built-in agent is blocked per client
  (`checkCompatibility`), because it would silently replace the built-in.

## What the installer writes per client

| Scope   | Claude Code                                           | Codex                                                                  |
| ------- | ----------------------------------------------------- | ---------------------------------------------------------------------- |
| global  | `~/.claude/skills/<id>/…`, `~/.claude/agents/<id>.md` | `~/.agents/skills/<id>/…`, `$CODEX_HOME/agents/<id>.toml` (`~/.codex`) |
| project | `.claude/skills/<id>/…`, `.claude/agents/<id>.md`     | `.agents/skills/<id>/…`, `.codex/agents/<id>.toml`                     |

Never written: `settings.json`, `config.toml`, `CLAUDE.md`, `AGENTS.md`, hooks, permissions, MCP
servers. AgentForge's own state lives outside client dirs (see [installer.md](installer.md)).

## Skills (verified for Phase 3, 2026-11-15)

Sources: agentskills.io/specification, code.claude.com/docs/en/skills, learn.chatgpt.com/docs/build-skills.

- Agent Skills spec: `name` 1-64 chars, lowercase letters, digits and single hyphens, matching
  the directory; `description` 1-1024 chars describing what the skill does and when to use it.
  Optional: `license`, `compatibility` (≤500), `metadata`, `allowed-tools` (experimental).
  Guidance: metadata ~100 tokens, instructions < 5,000 tokens, `SKILL.md` < 500 lines, file
  references one level deep.
- Both clients choose skills implicitly from the description; explicit use is `/name` (Claude
  Code) or `$name` / `/skills` (Codex).
- Claude Code `allowed-tools` pre-approves tools (a grant, not a restriction); never emitted.
  `disallowed-tools` restricts while the skill is active; not emitted (activation lifetime not
  documented). Claude Code also reads `when_to_use` (merged into the 1,536-char listing cap);
  AgentForge puts triggers in `description` instead so both clients see them.
- Codex: only `name`/`description` documented in `SKILL.md`; `allow_implicit_invocation` exists
  only in `agents/openai.yaml` (not generated). Skill list capped at 2% of context or 8,000 chars.
- Not documented by either client: one skill invoking another. AgentForge's `requires` therefore
  only guarantees installation; the text names the skill and the client decides to load it.

## Subagents and custom agents (verified for Phase 4, 2026-11-15)

Sources: code.claude.com/docs/en/sub-agents, code.claude.com/docs/en/tools-reference,
learn.chatgpt.com/docs/agent-configuration/subagents, learn.chatgpt.com/docs/permissions.

| Aspect       | Claude Code                                                                                        | Codex                                                                                             |
| ------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Start        | Automatic by `description`, by name or @-mention                                                   | Direct request, or a project/skill instruction; not from description alone                        |
| Nesting      | Allowed up to 3 levels when `Agent` is in `tools`                                                  | Not documented                                                                                    |
| Tools        | `tools` allowlist / `disallowedTools`                                                              | Inherited; feature switches only (`features.*`)                                                   |
| Read-only    | Allowlist without Edit/Write + `permissionMode: plan` (parent bypass/acceptEdits/auto override it) | Not per agent: "don't create a separate read-only sandbox"; inherits parent sandbox and approvals |
| Skills       | `Skill` tool needed to invoke; `skills:` preloads full content                                     | Inherited from parent; `skills.config` can disable some                                           |
| Model        | `model` alias, id or `inherit`                                                                     | `model`, `model_reasoning_effort`; inherits when unset                                            |
| File reading | Read/Grep/Glob (Glob/Grep absent by default on macOS, Linux, WSL) or Bash                          | Through commands; no dedicated read tool documented                                               |

Decisions: Claude agents get `Read, Grep, Glob, Bash, Skill` and `permissionMode: plan`; Codex
agents keep their shell (disabling `features.shell_tool` would block reading) and the installer,
plan output and `doctor` state that read-only depends on the session sandbox.

## Token metrics available

| Platform    | Real measurements                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code | `/usage` (`/cost` alias); statusline JSON (`context_window.*`, `cost.*`); OpenTelemetry `claude_code.token.usage`               |
| Codex       | `codex exec --json`: `turn.completed.usage` (`input_tokens`, `cached_input_tokens`, `output_tokens`, `reasoning_output_tokens`) |

Anything AgentForge computes itself (e.g. `list` output) is an **estimate** and is labeled so.

## Open uncertainties (not verified)

- Codex: name/description length limits for skills are not documented. We apply the Agent Skills
  limits (`id` ≤64, description ≤1024), which also fit Claude Code.
- Codex: what `features.shell_tool = false` disables exactly is not documented; AgentForge no
  longer emits it because reviewers must read files through commands.
- Claude Code: tool availability per OS (Glob/Grep) and plan-mode behavior inside subagents have
  not been checked in live sessions.
- Codex: the subagents page does not say whether `.codex/agents/` requires a trusted project;
  the config reference says project-scoped config loads only for trusted projects, so `doctor`
  warns about it.
- Codex: the env-vars page says `CODEX_HOME` also holds "skills", while the skills page lists
  `$HOME/.agents/skills`. AgentForge follows the skills page.
- Codex: custom prompts location and deprecation status; OTel metric names; full config reference.
- Claude Code: full hook event list and the `permission-modes` page were not read.
- Claude Code: whether `CLAUDE_CONFIG_DIR` relocates agents/skills (not stated in the docs read).
- Neither client has loaded the generated files in a live session yet; installer and skills are
  tested against the documented formats and layout only.
