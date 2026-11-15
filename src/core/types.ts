/**
 * Canonical contracts. Platform-neutral and stack-neutral: nothing here names a
 * language, framework or tool. Technology knowledge lives only in optional
 * specialization references inside skills, loaded on demand.
 */

export const PLATFORMS = ['claude-code', 'codex'] as const;
export type Platform = (typeof PLATFORMS)[number];

export const COMPONENT_KINDS = ['skill', 'agent'] as const;
export type ComponentKind = (typeof COMPONENT_KINDS)[number];

/** Universal responsibilities. Agents are never bound to a technology. */
export const AGENT_DOMAINS = [
  'appsec',
  'architecture',
  'quality',
  'performance',
  'infrastructure',
  'engineering',
] as const;
export type AgentDomain = (typeof AGENT_DOMAINS)[number];

/** Skills may also be cross-cutting workflows (discovery, reporting). */
export const SKILL_DOMAINS = [...AGENT_DOMAINS, 'workflow'] as const;
export type SkillDomain = (typeof SKILL_DOMAINS)[number];

/** Abstract capabilities, mapped to concrete tools by each adapter. */
export const CAPABILITIES = ['read', 'edit', 'shell', 'web'] as const;
export type Capability = (typeof CAPABILITIES)[number];

export const AGENT_MODES = ['read-only', 'read-write'] as const;
export type AgentMode = (typeof AGENT_MODES)[number];

/** Abstract model tier; adapters map it to what each platform supports. */
export const MODEL_TIERS = ['inherit', 'fast', 'balanced', 'deep'] as const;
export type ModelTier = (typeof MODEL_TIERS)[number];

export type InstallScope = 'global' | 'project';

export const MANIFEST_SCHEMA_VERSION = 1;

interface BaseManifest {
  schemaVersion: typeof MANIFEST_SCHEMA_VERSION;
  id: string;
  /** Optional human-readable name; defaults to `id`. */
  name?: string;
  version: string;
  /** Short, single-line text used for discovery. Kept small on purpose. */
  description: string;
  targets: Platform[];
  tags?: string[];
}

/**
 * A file loaded only when needed. Without `appliesWhen` it is generic.
 * With `appliesWhen` it is a technology specialization: the strings are opaque
 * detection signals (e.g. file names or globs) the model checks in the target
 * project before loading the file. The core never interprets them.
 */
export interface SkillReference {
  path: string;
  description: string;
  appliesWhen?: string[];
}

/**
 * Catalog-only metadata (`domain`, `capabilities`, `requires`) is never written
 * into client files; only `name` and `description` reach SKILL.md.
 */
export interface SkillManifest extends BaseManifest {
  kind: 'skill';
  domain?: SkillDomain;
  /** What the procedure needs. Defaults to ['read']; used for compatibility checks. */
  capabilities?: Capability[];
  /** Skills this one delegates to by name; installed together with it. */
  requires?: string[];
  references?: SkillReference[];
}

/** Advisory investigation limits, rendered into instructions (not enforced by platforms). */
export interface InvestigationBudget {
  maxDepth: number;
  maxSubagents: number;
}

export interface AgentManifest extends BaseManifest {
  kind: 'agent';
  domain: AgentDomain;
  mode: AgentMode;
  capabilities: Capability[];
  model?: ModelTier;
  /** Skill ids the agent may load on demand (installed with it). */
  skills?: string[];
  /**
   * Subset of `skills` used in every run. Claude Code preloads them (full
   * content at start); other clients get an explicit instruction instead.
   */
  preloadSkills?: string[];
  budget?: InvestigationBudget;
}

export type ComponentManifest = SkillManifest | AgentManifest;

export interface LoadedReference extends SkillReference {
  content: string;
}

export interface LoadedSkill {
  manifest: SkillManifest;
  dir: string;
  instructions: string;
  references: LoadedReference[];
}

export interface LoadedAgent {
  manifest: AgentManifest;
  dir: string;
  instructions: string;
}

export type LoadedComponent = LoadedSkill | LoadedAgent;
