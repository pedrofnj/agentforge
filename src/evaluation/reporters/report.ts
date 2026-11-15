import type { CaseSuite } from '../core/cases.js';
import {
  measured,
  unavailable,
  type ExecutionMetrics,
  type Metric,
  type RunResult,
  type UsageMetrics,
} from '../core/types.js';
import { evaluateQuality, ratio, type QualityResult } from '../metrics/quality.js';
import { sanitizeDeep } from './sanitize.js';

export interface RunEvaluation {
  runId: string;
  source: RunResult['source'];
  client: RunResult['client'];
  agent: string;
  profile: string;
  budget: string;
  fixture: string;
  quality: QualityResult;
  usage: UsageMetrics;
  execution: ExecutionMetrics;
  notes: string[];
}

export interface AggregateRow {
  client: string;
  agent: string;
  profile: string;
  budget: string;
  runs: number;
  precision: Metric;
  recall: Metric;
  f1: Metric;
  falsePositiveRate: Metric;
  evidenceValidity: Metric;
  taskSuccess: Metric;
  tokens: Record<
    | 'inputTokens'
    | 'outputTokens'
    | 'cacheReadTokens'
    | 'cacheWriteTokens'
    | 'reasoningTokens'
    | 'totalTokens',
    Metric
  >;
}

export interface EvaluationReport {
  schemaVersion: 1;
  kind: 'agentforge-evaluation-report';
  agentforgeVersion: string;
  casesDigest: string;
  casesTotal: number;
  behavioralEvidence: string;
  coverage: Metric;
  aggregates: AggregateRow[];
  runs: RunEvaluation[];
  limitations: string[];
}

const BASE_LIMITATIONS = [
  'A finding counts as a detection only when its location is within 5 lines of the ground-truth evidence and its title, category or CWE names the problem.',
  'Needs-investigation items are neither true nor false positives; they are reported separately.',
  'Token metrics are exactly what each client reported; categories are kept separate and totals are only computed where the provider documents disjoint categories.',
  'Benchmarks are small, controlled fixtures; results do not generalize to large repositories without further runs.',
];

/** Sums a usage metric over runs: measured only when every run measured it. */
function sumMetric(runs: RunEvaluation[], key: keyof AggregateRow['tokens']): Metric {
  const ms = runs.map((r) => r.usage[key]);
  if (ms.every((m) => m.status === 'measured')) {
    return measured(ms.reduce((n, m) => n + (m.value as number), 0));
  }
  const missing = ms.filter((m) => m.status !== 'measured').length;
  return unavailable(`${missing} of ${ms.length} run(s) did not report it`);
}

function aggregate(runs: RunEvaluation[]): AggregateRow[] {
  const groups = new Map<string, RunEvaluation[]>();
  for (const r of runs) {
    const key = [r.client, r.agent, r.profile, r.budget].join('|');
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, rs]) => {
      const [client, agent, profile, budget] = key.split('|') as [string, string, string, string];
      const t = (f: (q: QualityResult) => number) => rs.reduce((n, r) => n + f(r.quality), 0);
      const tp = t((q) => q.truePositives);
      const fp = t((q) => q.falsePositives);
      const precision = ratio(tp, tp + fp, 'no confirmed or likely findings');
      const recall = ratio(
        t((q) => q.counts.detected),
        t((q) => q.scope.vulnerable),
        'no vulnerable cases in scope',
      );
      let f1: Metric = unavailable('needs both precision and recall');
      if (precision.status === 'measured' && recall.status === 'measured') {
        const p = precision.value!;
        const r = recall.value!;
        f1 = measured(p + r === 0 ? 0 : (2 * p * r) / (p + r));
      }
      return {
        client,
        agent,
        profile,
        budget,
        runs: rs.length,
        precision,
        recall,
        f1,
        falsePositiveRate: ratio(
          t((q) => q.counts.flaggedSafe),
          t((q) => q.scope.safe),
          'no safe cases in scope',
        ),
        evidenceValidity: ratio(
          t((q) => q.counts.validEvidence),
          t((q) => q.reported),
          'no findings reported',
        ),
        taskSuccess: ratio(
          t((q) => q.counts.successes),
          t((q) => q.scope.vulnerable + q.scope.safe),
          'no cases in scope',
        ),
        tokens: {
          inputTokens: sumMetric(rs, 'inputTokens'),
          outputTokens: sumMetric(rs, 'outputTokens'),
          cacheReadTokens: sumMetric(rs, 'cacheReadTokens'),
          cacheWriteTokens: sumMetric(rs, 'cacheWriteTokens'),
          reasoningTokens: sumMetric(rs, 'reasoningTokens'),
          totalTokens: sumMetric(rs, 'totalTokens'),
        },
      };
    });
}

/** Deterministic: the same runs and cases always produce the same report (no timestamps). */
export async function buildReport(
  runs: RunResult[],
  suite: CaseSuite,
  fixturesDir: string,
  agentforgeVersion: string,
): Promise<EvaluationReport> {
  const evaluations: RunEvaluation[] = [];
  for (const run of [...runs].sort((a, b) => a.runId.localeCompare(b.runId))) {
    evaluations.push({
      runId: run.runId,
      source: run.source,
      client: run.client,
      agent: run.agent,
      profile: run.profile ?? 'unspecified',
      budget: run.budget ?? 'unspecified',
      fixture: run.fixture,
      quality: await evaluateQuality(run, suite.cases, fixturesDir),
      usage: run.usage,
      execution: run.execution,
      notes: run.notes ?? [],
    });
  }
  const covered = new Set(
    suite.cases
      .filter((c) => runs.some((r) => r.fixture === c.fixture && r.agent === c.agent))
      .map((c) => c.id),
  );
  const limitations = [...BASE_LIMITATIONS];
  const behavioralEvidence =
    runs.length === 0
      ? 'No agent runs were evaluated: behavioral effectiveness has not been measured.'
      : `${runs.length} imported run(s) evaluated against ground truth.`;
  if (runs.some((r) => r.source === 'manual' || r.source === 'report-markdown')) {
    limitations.push(
      'Some runs were entered manually or from a report only; usage data may be missing.',
    );
  }
  // Only run-derived content is sanitized; metadata such as the cases digest is not free text.
  return {
    schemaVersion: 1,
    kind: 'agentforge-evaluation-report',
    agentforgeVersion,
    casesDigest: suite.digest,
    casesTotal: suite.cases.length,
    behavioralEvidence,
    coverage: ratio(covered.size, suite.cases.length, 'no cases loaded'),
    aggregates: aggregate(evaluations),
    runs: sanitizeDeep(evaluations),
    limitations,
  };
}
