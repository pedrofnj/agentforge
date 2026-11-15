/**
 * Resource budgets: how much context and effort to spend, independent of the
 * analysis profile (how deep to go). Both are prompt guidance; no client
 * exposes per-run token caps, so neither is a hard limit, and AgentForge cannot
 * see or control subscription quotas.
 */
export const BUDGETS = ['economy', 'balanced', 'thorough'] as const;
export type Budget = (typeof BUDGETS)[number];
export const DEFAULT_BUDGET_PROFILE: Budget = 'balanced';

export const BUDGET_GUIDANCE: Record<Budget, string> = {
  economy:
    'read only matched regions; open a reference only when a finding depends on it; stop at the first sufficient evidence',
  balanced: 'whole functions on the traced path; references for the classes you encounter',
  thorough:
    'whole relevant files; references for every class you encounter; try to resolve needs-investigation items',
};
