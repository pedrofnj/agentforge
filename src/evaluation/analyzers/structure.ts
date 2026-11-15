import type { LoadedComponent } from '../../core/types.js';
import type { CatalogStats } from '../metrics/context.js';

/**
 * Structural regression checks for the catalog, run offline by `eval validate`
 * and the test suite. Thresholds bound growth against an accepted baseline;
 * they are review triggers, not token limits. Raising them means updating the
 * baseline on purpose (`agentforge stats --json > evals/baselines/context.json`).
 */
export const LIMITS = {
  /** Whole always-loaded skill list. */
  discoveryGrowth: 0.1,
  /** One generated SKILL.md. */
  skillMdGrowth: 0.2,
  /** One agent at start (prompt + preloaded skills). */
  agentStartupGrowth: 0.2,
} as const;

/** Phrases that push a model to read everything instead of searching first. */
export const FULL_READ =
  /(?<!\b(?:never|not|don't|avoid|no)\s)\b(read|open|load|scan|review)\s+(all|every|the\s+(?:entire|whole))\s+(files?|repository|repo|codebase|project|source|directory)\b/i;

export interface StructureIssue {
  severity: 'error' | 'warning';
  code: string;
  subject: string;
  message: string;
}

const growth = (now: number, before: number) => (before > 0 ? (now - before) / before : 0);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export function checkStructure(
  current: CatalogStats,
  baseline: CatalogStats | undefined,
  components: LoadedComponent[],
): StructureIssue[] {
  const issues: StructureIssue[] = [];
  const add = (
    severity: StructureIssue['severity'],
    code: string,
    subject: string,
    message: string,
  ) => issues.push({ severity, code, subject, message });

  for (const c of components) {
    const m = FULL_READ.exec(c.instructions);
    if (m)
      add(
        'error',
        'full-read',
        c.manifest.id,
        `instructions encourage reading everything: "${m[0]}"`,
      );
    if (c.manifest.kind === 'agent') {
      if ((c.manifest.budget?.maxSubagents ?? 0) > 0) {
        add('warning', 'delegation', c.manifest.id, 'agent may delegate; confirm it is needed');
      }
      if ((c.manifest.preloadSkills ?? []).length > 1) {
        add(
          'warning',
          'preload',
          c.manifest.id,
          'more than one preloaded skill raises every run’s startup context',
        );
      }
    }
  }

  if (!baseline) return issues;
  const g = growth(current.totals.discoveryChars, baseline.totals.discoveryChars);
  if (g > LIMITS.discoveryGrowth) {
    add(
      'error',
      'discovery-growth',
      'catalog',
      `always-loaded skill list grew ${pct(g)} (limit ${pct(LIMITS.discoveryGrowth)})`,
    );
  }
  const baseSkills = new Map(baseline.skills.map((s) => [s.id, s]));
  for (const s of current.skills) {
    const b = baseSkills.get(s.id);
    if (!b) continue;
    const sg = growth(s.skillMdChars, b.skillMdChars);
    if (sg > LIMITS.skillMdGrowth) {
      add(
        'error',
        'skill-growth',
        s.id,
        `SKILL.md grew ${pct(sg)} (limit ${pct(LIMITS.skillMdGrowth)})`,
      );
    }
  }
  const baseAgents = new Map((baseline.agents ?? []).map((a) => [a.id, a]));
  for (const a of current.agents) {
    const b = baseAgents.get(a.id);
    if (!b) continue;
    for (const [client, chars] of Object.entries(a.startupChars)) {
      const before = b.startupChars[client];
      if (before === undefined) continue;
      const ag = growth(chars, before);
      if (ag > LIMITS.agentStartupGrowth) {
        add(
          'error',
          'agent-growth',
          a.id,
          `${client} startup context grew ${pct(ag)} (limit ${pct(LIMITS.agentStartupGrowth)})`,
        );
      }
    }
  }
  const authoredNow = current.duplicates.filter((d) => !d.generated).length;
  const authoredBefore = baseline.duplicates.filter((d) => !d.generated).length;
  if (authoredNow > authoredBefore) {
    add(
      'error',
      'duplication',
      'catalog',
      `authored duplicate lines rose from ${authoredBefore} to ${authoredNow}`,
    );
  }
  return issues;
}
