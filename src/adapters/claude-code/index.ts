import path from 'node:path';
import { DEFAULT_BUDGET } from '../../core/policy.js';
import type { Capability, ModelTier } from '../../core/types.js';
import {
  renderAgentBody,
  renderReferenceFiles,
  renderSkillMarkdown,
  requireProjectRoot,
  reservedNameErrors,
  yamlString,
} from '../shared.js';
import type { PlatformAdapter } from '../types.js';

/** Source: code.claude.com/docs/en/sub-agents (tool names) — verified 2026-11-15. */
/**
 * `read` includes Bash because Claude Code documents Glob/Grep as absent by
 * default on macOS, Linux and WSL (search then runs through Bash); the docs'
 * own read-only example is Read, Grep, Glob and Bash. Writes stay gated by
 * permissionMode: plan and the absence of Edit/Write.
 */
const TOOLS: Record<Capability, readonly string[]> = {
  read: ['Read', 'Grep', 'Glob', 'Bash'],
  edit: ['Edit', 'Write'],
  shell: ['Bash'],
  web: ['WebFetch', 'WebSearch'],
};

/** Built-in subagent names documented on code.claude.com/docs/en/sub-agents. */
const BUILT_IN_AGENTS = ['general-purpose', 'statusline-setup', 'claude-code-guide'];

const MODELS: Record<ModelTier, string> = {
  inherit: 'inherit',
  fast: 'haiku',
  balanced: 'sonnet',
  deep: 'opus',
};

/**
 * Claude Code: skills -> `<root>/skills/<id>/SKILL.md`, subagents ->
 * `<root>/agents/<id>.md` where root is `~/.claude` or `<project>/.claude`. The `tools` allowlist enforces read-only mode.
 * `skills:` is used only for `preloadSkills` (full content at start); other
 * skills are invoked on demand through the Skill tool.
 */
export const claudeCodeAdapter: PlatformAdapter = {
  platform: 'claude-code',
  displayName: 'Claude Code',

  checkCompatibility(manifest) {
    return reservedNameErrors(manifest, BUILT_IN_AGENTS, 'Claude Code');
  },

  renderSkill(skill) {
    return {
      files: [
        {
          location: 'skills',
          relativePath: `${skill.manifest.id}/SKILL.md`,
          content: renderSkillMarkdown(skill),
        },
        ...renderReferenceFiles(skill),
      ],
      warnings: [],
    };
  },

  renderAgent(agent) {
    const m = agent.manifest;
    const budget = m.budget ?? DEFAULT_BUDGET;
    const tools = [...new Set(m.capabilities.flatMap((c) => TOOLS[c]))];
    if ((m.skills ?? []).length > 0) tools.push('Skill');
    if (budget.maxSubagents > 0) tools.push('Agent');
    const preload = m.preloadSkills ?? [];

    const fm = [
      '---',
      `name: ${yamlString(m.id)}`,
      `description: ${yamlString(m.description)}`,
      `tools: ${tools.join(', ')}`,
      ...(m.mode === 'read-only' ? ['permissionMode: plan'] : []),
      ...(m.model ? [`model: ${MODELS[m.model]}`] : []),
      ...(preload.length > 0 ? ['skills:', ...preload.map((s) => `  - ${s}`)] : []),
      '---',
    ].join('\n');

    const warnings = [
      'Analysis depth and profiles are guidance in the prompt; Claude Code does not enforce them.',
    ];
    if (m.mode === 'read-only') {
      warnings.push(
        'Read-only relies on the tools allowlist and permissionMode: plan; a main session in bypassPermissions, acceptEdits or auto mode overrides permissionMode.',
      );
    }
    return {
      files: [
        {
          location: 'agents',
          relativePath: `${m.id}.md`,
          content: `${fm}\n\n${renderAgentBody(agent.instructions, m, 'preloaded')}`,
        },
      ],
      warnings,
    };
  },

  resolveLocation(location, ctx) {
    // Documented locations only: ~/.claude/<location> and <project>/.claude/<location>.
    // CLAUDE_CONFIG_DIR is not documented to relocate agents/skills, so it is not used
    // (the doctor command warns when it is set).
    const base = ctx.scope === 'project' ? requireProjectRoot(ctx) : ctx.homeDir;
    return path.join(base, '.claude', location);
  },
};
