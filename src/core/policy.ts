import type { AgentMode, Capability, InvestigationBudget } from './types.js';

/** Security by default: agents are read-only unless a manifest says otherwise. */
export const DEFAULT_AGENT_MODE: AgentMode = 'read-only';

/**
 * Capabilities that can change the workspace. `shell` is included because no
 * supported platform lets us portably restrict a shell to read-only commands.
 */
export const WRITE_CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>(['edit', 'shell']);

/** Low-cost defaults: shallow investigation, no subagent delegation. */
export const DEFAULT_BUDGET: Readonly<InvestigationBudget> = { maxDepth: 2, maxSubagents: 0 };

export const BUDGET_LIMITS = {
  maxDepth: { min: 1, max: 5 },
  maxSubagents: { min: 0, max: 4 },
} as const;

/** Capabilities a manifest requests that its mode does not allow. */
export function forbiddenCapabilities(mode: AgentMode, capabilities: readonly Capability[]) {
  return mode === 'read-only' ? capabilities.filter((c) => WRITE_CAPABILITIES.has(c)) : [];
}
