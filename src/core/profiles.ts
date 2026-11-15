import { DEFAULT_BUDGET } from './policy.js';
import type { AgentDomain, AgentManifest } from './types.js';

/**
 * Analysis profiles: execution guidance rendered into every agent. They shape
 * effort (scope, reading, depth, report size); they are not token limits, and
 * no client enforces them. The user picks one by name; standard is the default.
 */
export const PROFILES = ['quick', 'standard', 'deep'] as const;
export type Profile = (typeof PROFILES)[number];
export const DEFAULT_PROFILE: Profile = 'standard';

export interface ProfilePlan {
  profile: Profile;
  /** Follow-up steps allowed from an entry point before stopping. */
  depth: number;
  /** Subagents the agent itself may start. */
  delegation: number;
  /** Whether repository-discovery runs (unless a map already exists). */
  discovery: 'only-if-scope-unclear' | 'yes';
  scope: string;
  report: string;
}

/** Profile plan for an agent; deep uses the agent's own budget, the others are capped. */
export function profilePlan(m: AgentManifest, profile: Profile): ProfilePlan {
  const budget = m.budget ?? DEFAULT_BUDGET;
  switch (profile) {
    case 'quick':
      return {
        profile,
        depth: 1,
        delegation: 0,
        discovery: 'only-if-scope-unclear',
        scope: 'only the files or area the user named; a few targeted searches',
        report: 'at most 5 findings, one-line coverage',
      };
    case 'standard':
      return {
        profile,
        depth: Math.min(2, budget.maxDepth),
        delegation: 0,
        discovery: 'yes',
        scope: 'the areas of the repository map relevant to the goal',
        report: 'prioritized findings with coverage',
      };
    case 'deep':
      return {
        profile,
        depth: budget.maxDepth,
        delegation: budget.maxSubagents,
        discovery: 'yes',
        scope:
          'widen step by step to connected components; trace flows across them and verify hypotheses before reporting',
        report: 'all findings with correlations, needs-investigation items and full coverage',
      };
  }
}

/** Finding id prefix per domain, so merged reports keep unique, readable ids. */
export const FINDING_PREFIX: Record<AgentDomain, string> = {
  appsec: 'SEC',
  architecture: 'ARC',
  quality: 'QLT',
  performance: 'PRF',
  infrastructure: 'INF',
  engineering: 'ENG',
};
