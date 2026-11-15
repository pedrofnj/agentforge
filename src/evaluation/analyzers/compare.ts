import type { Metric } from '../core/types.js';
import type { AggregateRow, EvaluationReport } from '../reporters/report.js';

export interface ComparisonRow {
  client: string;
  agent: string;
  profile: string;
  budget: string;
  metric: string;
  before: string;
  after: string;
  delta: string;
}

export interface ComparisonResult {
  before: { label: string; digest: string };
  after: { label: string; digest: string };
  sameCases: boolean;
  rows: ComparisonRow[];
  regressions: string[];
  unmatched: string[];
}

/** Thresholds for flagging; quality drops are always flagged, token growth above 10%. */
export const TOKEN_GROWTH_THRESHOLD = 0.1;
export const PRECISION_DROP_THRESHOLD = 0.05;

const QUALITY = [
  'precision',
  'recall',
  'f1',
  'falsePositiveRate',
  'evidenceValidity',
  'taskSuccess',
] as const;
const TOKENS = [
  'inputTokens',
  'outputTokens',
  'cacheReadTokens',
  'cacheWriteTokens',
  'totalTokens',
] as const;
const keyOf = (a: AggregateRow) => [a.client, a.agent, a.profile, a.budget].join('|');
const show = (m: Metric, ratio: boolean) =>
  m.status !== 'measured' ? m.status : ratio ? `${(m.value! * 100).toFixed(1)}%` : String(m.value);

export function compareReports(
  before: EvaluationReport,
  after: EvaluationReport,
  labels: [string, string] = ['before', 'after'],
): ComparisonResult {
  const rows: ComparisonRow[] = [];
  const regressions: string[] = [];
  const b = new Map(before.aggregates.map((a) => [keyOf(a), a]));
  const a = new Map(after.aggregates.map((x) => [keyOf(x), x]));
  const unmatched = [...b.keys(), ...a.keys()].filter((k) => !(b.has(k) && a.has(k)));

  for (const [key, x] of a) {
    const y = b.get(key);
    if (!y) continue;
    const id = { client: x.client, agent: x.agent, profile: x.profile, budget: x.budget };
    const name = `${x.agent} (${x.client}, ${x.profile}, ${x.budget})`;
    for (const metric of QUALITY) {
      const m0 = y[metric];
      const m1 = x[metric];
      const both = m0.status === 'measured' && m1.status === 'measured';
      const d = both ? m1.value! - m0.value! : undefined;
      rows.push({
        ...id,
        metric,
        before: show(m0, true),
        after: show(m1, true),
        delta: d === undefined ? 'n/a' : `${d >= 0 ? '+' : ''}${(d * 100).toFixed(1)} pp`,
      });
      if (d === undefined) continue;
      if (metric === 'recall' && d < 0)
        regressions.push(`${name}: recall dropped ${(-d * 100).toFixed(1)} pp`);
      if (metric === 'precision' && d < -PRECISION_DROP_THRESHOLD)
        regressions.push(`${name}: precision dropped ${(-d * 100).toFixed(1)} pp`);
      if (metric === 'falsePositiveRate' && d > 0)
        regressions.push(`${name}: false positive rate rose ${(d * 100).toFixed(1)} pp`);
    }
    for (const metric of TOKENS) {
      const m0 = y.tokens[metric];
      const m1 = x.tokens[metric];
      const both = m0.status === 'measured' && m1.status === 'measured';
      const d = both ? m1.value! - m0.value! : undefined;
      const pct = both && m0.value! > 0 ? d! / m0.value! : undefined;
      rows.push({
        ...id,
        metric,
        before: show(m0, false),
        after: show(m1, false),
        delta:
          d === undefined
            ? 'n/a'
            : `${d >= 0 ? '+' : ''}${d}${pct !== undefined ? ` (${(pct * 100).toFixed(1)}%)` : ''}`,
      });
      if (
        pct !== undefined &&
        pct > TOKEN_GROWTH_THRESHOLD &&
        (metric === 'totalTokens' || metric === 'inputTokens')
      ) {
        regressions.push(`${name}: ${metric} grew ${(pct * 100).toFixed(1)}%`);
      }
    }
  }
  return {
    before: { label: labels[0], digest: before.casesDigest },
    after: { label: labels[1], digest: after.casesDigest },
    sameCases: before.casesDigest === after.casesDigest,
    rows,
    regressions,
    unmatched,
  };
}
