import path from 'node:path';
import { DEFAULT_BUDGET } from '../../core/policy.js';
import type { ModelTier } from '../../core/types.js';
import {
  renderAgentBody,
  renderReferenceFiles,
  renderSkillMarkdown,
  requireProjectRoot,
  reservedNameErrors,
  tomlMultiline,
  tomlString,
} from '../shared.js';
import type { PlatformAdapter } from '../types.js';

/** Codex has no per-agent model tiers; reasoning effort is the closest documented knob. */
/** Built-in agent names; a custom agent with the same name replaces them. */
const BUILT_IN_AGENTS = ['default', 'worker', 'explorer'];

const EFFORT: Partial<Record<ModelTier, string>> = {
  fast: 'low',
  balanced: 'medium',
  deep: 'high',
};

/**
 * OpenAI Codex (sources: learn.chatgpt.com/docs/build-skills and
 * /docs/agent-configuration/subagents — verified 2026-11-15):
 * skills -> `.agents/skills/<id>/SKILL.md` (repo or $HOME),
 * custom agents -> `.codex/agents/<id>.toml` (repo or CODEX_HOME).
 * Custom agents cannot override sandbox_mode/approval_policy, so read-only
 * is only guaranteed by the session sandbox; we surface that as a warning.
 */
export const codexAdapter: PlatformAdapter = {
  platform: 'codex',
  displayName: 'Codex',

  checkCompatibility(manifest) {
    return reservedNameErrors(manifest, BUILT_IN_AGENTS, 'Codex');
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
    const warnings: string[] = [
      'Codex starts custom agents only on a direct request or a project/skill instruction (e.g. the review-planning skill), not from the description alone.',
      'Analysis depth and profiles are guidance in the prompt; Codex does not enforce them.',
    ];
    const lines = [`name = ${tomlString(m.id)}`, `description = ${tomlString(m.description)}`];
    const effort = m.model ? EFFORT[m.model] : undefined;
    if (effort) lines.push(`model_reasoning_effort = ${tomlString(effort)}`);
    // No features.shell_tool = false: Codex reads files through commands, so
    // disabling the shell would leave a read-only reviewer unable to read.
    lines.push(
      `developer_instructions = ${tomlMultiline(renderAgentBody(agent.instructions, m, 'instructed'))}`,
    );

    if (m.mode === 'read-only') {
      warnings.push(
        'Codex custom agents inherit the session sandbox and cannot set their own; run audits with sandbox_mode = "read-only" (or the :read-only permissions profile).',
      );
    }
    if ((m.preloadSkills ?? []).length > 0) {
      warnings.push(
        'Codex has no skill preloading; the agent is instructed to use the listed skills.',
      );
    }
    if (m.capabilities.includes('web')) {
      warnings.push(
        'Codex web search is configured per session (web_search), not granted per agent.',
      );
    }
    if (budget.maxSubagents > 0) {
      warnings.push(
        'Codex limits concurrent subagents globally ([agents] max_concurrent_threads_per_session).',
      );
    }

    return {
      files: [
        { location: 'agents', relativePath: `${m.id}.toml`, content: `${lines.join('\n')}\n` },
      ],
      warnings,
    };
  },

  resolveLocation(location, ctx) {
    if (location === 'skills') {
      const base = ctx.scope === 'project' ? requireProjectRoot(ctx) : ctx.homeDir;
      return path.join(base, '.agents', 'skills');
    }
    if (ctx.scope === 'project') return path.join(requireProjectRoot(ctx), '.codex', 'agents');
    const codexHome = ctx.env.CODEX_HOME || path.join(ctx.homeDir, '.codex');
    return path.join(codexHome, 'agents');
  },
};
