import { renderFor } from '../../adapters/index.js';
import { estimateTokens, type TokenCount } from '../../core/tokens.js';
import type { LoadedAgent, LoadedSkill, Platform } from '../../core/types.js';
import { loadComponent, type Catalog } from '../../registry/index.js';

/**
 * Static context metrics for a catalog. Sizes are measured from the files
 * AgentForge generates; token figures are estimates and carry their method.
 * File size is not the context a model actually consumes (clients add their
 * own framing, truncate listings and load files on demand); nothing here
 * observes a model run.
 */

/** Codex caps the initial skill list at 8,000 chars when the context size is unknown. */
export const CODEX_SKILL_LIST_FALLBACK_CHARS = 8000;

export interface SkillStats {
  id: string;
  domain: string | undefined;
  /** Always listed by the client: `name: description`. */
  discoveryChars: number;
  discoveryTokens: TokenCount;
  /** Loaded on activation: the generated SKILL.md. */
  skillMdLines: number;
  skillMdChars: number;
  skillMdTokens: TokenCount;
  /** Loaded only when needed. */
  referenceCount: number;
  referenceChars: number;
  dependencies: string[];
}

export interface AgentStats {
  id: string;
  domain: string;
  /** Generated prompt file per client (frontmatter/TOML included). */
  promptChars: Record<string, number>;
  promptLines: Record<string, number>;
  /** Skills Claude Code injects in full at agent start (`skills:` preload). */
  preloadedChars: number;
  /** Prompt + preloaded skills on Claude Code; prompt only on Codex. File sizes, not consumed context. */
  startupChars: Record<string, number>;
  startupTokens: Record<string, TokenCount>;
}

export interface DuplicateLine {
  text: string;
  skills: string[];
  /** Lines emitted by the shared renderer on purpose (safety rules, reference index). */
  generated: boolean;
}

export interface CatalogStats {
  platform: Platform;
  method: string;
  skills: SkillStats[];
  agents: AgentStats[];
  totals: {
    discoveryChars: number;
    skillMdChars: number;
    referenceChars: number;
    /** Share of Codex's fallback skill-list budget used by this catalog. */
    codexFallbackBudgetShare: number;
  };
  duplicates: DuplicateLine[];
}

const MIN_DUP_LINE = 25;

export function significantLines(markdown: string): string[] {
  return markdown
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length >= MIN_DUP_LINE && !l.startsWith('#') && !l.startsWith('```'));
}

const skillMdOf = (skill: LoadedSkill, platform: Platform) =>
  renderFor(platform, skill).files.find((f) => f.relativePath.endsWith('/SKILL.md'))!.content;

export async function computeCatalogStats(
  catalog: Catalog,
  platform: Platform = 'claude-code',
): Promise<CatalogStats> {
  const skills: SkillStats[] = [];
  const agents: AgentStats[] = [];
  const linesBySkill = new Map<string, Set<string>>();
  const generatedLines = new Set<string>();
  const skillMd = new Map<string, string>();
  const loadedAgents: LoadedAgent[] = [];

  for (const entry of catalog.entries) {
    const component = await loadComponent(entry);
    if (component.manifest.kind === 'agent') {
      loadedAgents.push(component as LoadedAgent);
      continue;
    }
    if (!component.manifest.targets.includes(platform)) continue;
    const skill = component as LoadedSkill;
    const body = skillMdOf(skill, platform);
    skillMd.set(skill.manifest.id, body);
    const discovery = `${skill.manifest.id}: ${skill.manifest.description}`;
    // Lines the shared renderer adds (safety, reference index) rather than the author.
    const authored = new Set(significantLines(skill.instructions));
    significantLines(body)
      .filter((l) => !authored.has(l))
      .forEach((l) => generatedLines.add(l));
    linesBySkill.set(skill.manifest.id, new Set(significantLines(body)));
    skills.push({
      id: skill.manifest.id,
      domain: skill.manifest.domain,
      discoveryChars: discovery.length,
      discoveryTokens: estimateTokens(discovery),
      skillMdLines: body.split('\n').length,
      skillMdChars: body.length,
      skillMdTokens: estimateTokens(body),
      referenceCount: skill.references.length,
      referenceChars: skill.references.reduce((n, r) => n + r.content.length, 0),
      dependencies: [...(skill.manifest.requires ?? [])],
    });
  }

  for (const agent of loadedAgents) {
    const m = agent.manifest;
    const promptChars: Record<string, number> = {};
    const promptLines: Record<string, number> = {};
    const startupChars: Record<string, number> = {};
    const startupTokens: Record<string, TokenCount> = {};
    const preloadedChars = (m.preloadSkills ?? []).reduce(
      (n, id) => n + (skillMd.get(id)?.length ?? 0),
      0,
    );
    for (const target of m.targets) {
      const prompt = renderFor(target, agent).files[0]!.content;
      promptChars[target] = prompt.length;
      promptLines[target] = prompt.split('\n').length;
      startupChars[target] = prompt.length + (target === 'claude-code' ? preloadedChars : 0);
      startupTokens[target] = { ...estimateTokens('x'.repeat(startupChars[target]!)) };
    }
    agents.push({
      id: m.id,
      domain: m.domain,
      promptChars,
      promptLines,
      preloadedChars,
      startupChars,
      startupTokens,
    });
  }

  const owners = new Map<string, string[]>();
  for (const [id, lines] of linesBySkill) {
    for (const line of lines) owners.set(line, [...(owners.get(line) ?? []), id]);
  }
  const duplicates = [...owners.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([text, ids]) => ({ text, skills: ids.sort(), generated: generatedLines.has(text) }))
    .sort(
      (a, b) =>
        Number(a.generated) - Number(b.generated) ||
        b.skills.length - a.skills.length ||
        a.text.localeCompare(b.text),
    );

  const sum = (f: (s: SkillStats) => number) => skills.reduce((n, s) => n + f(s), 0);
  const discoveryChars = sum((s) => s.discoveryChars);
  return {
    platform,
    method:
      'Sizes are measured from generated files. Token values are estimates (chars/4); real counts depend on each model tokenizer and are only available from client telemetry. File size is not the context a model actually consumes.',
    skills,
    agents,
    totals: {
      discoveryChars,
      skillMdChars: sum((s) => s.skillMdChars),
      referenceChars: sum((s) => s.referenceChars),
      codexFallbackBudgetShare: discoveryChars / CODEX_SKILL_LIST_FALLBACK_CHARS,
    },
    duplicates,
  };
}
