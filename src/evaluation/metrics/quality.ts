import { fixtureFileLines } from '../core/cases.js';
import {
  SEVERITIES,
  measured,
  unavailable,
  type Metric,
  type ReportedFinding,
  type ResolvedCase,
  type RunResult,
} from '../core/types.js';

/**
 * Quality against ground truth. Definitions (documented in docs/evaluation.md):
 * - Scope: cases with the run's fixture and agent.
 * - Considered findings: status confirmed or likely (or no status). Needs-investigation
 *   items are counted separately and are neither true nor false positives.
 * - A finding detects a vulnerable case only if its location is in an evidence file within
 *   LINE_TOLERANCE lines of an evidence line AND its title/category/CWE names the problem.
 *   Mentioning a category alone never counts.
 * - precision = TP / (TP + FP); recall = detected vulnerable cases / vulnerable cases in scope;
 *   F1 = harmonic mean; false positive rate = safe cases flagged / safe cases in scope.
 */
export const LINE_TOLERANCE = 5;

export interface CaseOutcome {
  caseId: string;
  kind: 'vulnerable' | 'safe';
  /** vulnerable: detected by a considered finding. safe: flagged by a considered finding. */
  hit: boolean;
  /** vulnerable only: matched only by a needs-investigation item. */
  investigatedOnly?: boolean;
  findings: string[];
}

export interface QualityResult {
  scope: { vulnerable: number; safe: number };
  reported: number;
  considered: number;
  needsInvestigation: number;
  truePositives: number;
  duplicates: number;
  falsePositives: number;
  precision: Metric;
  recall: Metric;
  f1: Metric;
  falsePositiveRate: Metric;
  evidenceValidity: Metric;
  severityAgreement: Metric;
  taskSuccess: Metric;
  /** Raw counts behind every ratio, so aggregates can be micro-averaged. */
  counts: {
    detected: number;
    flaggedSafe: number;
    validEvidence: number;
    severityChecked: number;
    severityAgreed: number;
    successes: number;
  };
  outcomes: CaseOutcome[];
  falsePositiveFindings: string[];
}

export function normalizeFindingPath(file: string, fixture: string): string {
  let p = file.trim().replace(/^`|`$/g, '').replace(/\\/g, '/');
  const marker = `/${fixture}/`;
  const i = p.lastIndexOf(marker);
  if (i >= 0) p = p.slice(i + marker.length);
  else if (p.startsWith(`${fixture}/`)) p = p.slice(fixture.length + 1);
  return p.replace(/^\.\//, '').replace(/^\/+/, '');
}

const label = (f: ReportedFinding, i: number) => f.id ?? `#${i + 1}`;
const text = (f: ReportedFinding) => `${f.title} ${f.category ?? ''} ${f.cwe ?? ''}`.toLowerCase();

function nearEvidence(f: ReportedFinding, file: string, line: number, fixture: string): boolean {
  if (!f.location || f.location.startLine === undefined) return false;
  if (normalizeFindingPath(f.location.file, fixture) !== file) return false;
  const start = f.location.startLine;
  const end = f.location.endLine ?? start;
  return line >= start - LINE_TOLERANCE && line <= end + LINE_TOLERANCE;
}

function matchesCase(f: ReportedFinding, c: ResolvedCase, fixture: string): boolean {
  const x = c.expected!;
  const named =
    x.keywords.some((k) => text(f).includes(k.toLowerCase())) ||
    (x.cwe !== undefined && f.cwe?.toUpperCase() === x.cwe);
  return named && c.evidenceLines.some((ev) => nearEvidence(f, ev.file, ev.line, fixture));
}

function flagsSafeCase(f: ReportedFinding, c: ResolvedCase, fixture: string): boolean {
  if (!f.location) return false;
  const file = normalizeFindingPath(f.location.file, fixture);
  return (
    c.files.includes(file) && (c.keywords ?? []).some((k) => text(f).includes(k.toLowerCase()))
  );
}

export const ratio = (num: number, den: number, why: string): Metric =>
  den > 0 ? measured(num / den, `${num}/${den}`) : unavailable(why);

export async function evaluateQuality(
  run: RunResult,
  allCases: ResolvedCase[],
  fixturesDir: string,
): Promise<QualityResult> {
  const scope = allCases.filter((c) => c.fixture === run.fixture && c.agent === run.agent);
  const vulnerable = scope.filter((c) => c.kind === 'vulnerable');
  const safe = scope.filter((c) => c.kind === 'safe');
  const outcomes = new Map<string, CaseOutcome>(
    scope.map((c) => [c.id, { caseId: c.id, kind: c.kind, hit: false, findings: [] }]),
  );

  let tp = 0;
  let dup = 0;
  let fp = 0;
  let ni = 0;
  let severityChecked = 0;
  let severityAgreed = 0;
  const fpFindings: string[] = [];

  run.findings.forEach((f, i) => {
    const id = label(f, i);
    const match = vulnerable.find((c) => matchesCase(f, c, run.fixture));
    if (f.status === 'needs-investigation') {
      ni++;
      if (match) {
        const o = outcomes.get(match.id)!;
        o.findings.push(id);
        if (!o.hit) o.investigatedOnly = true;
      }
      return;
    }
    if (match) {
      const o = outcomes.get(match.id)!;
      o.findings.push(id);
      if (o.hit) {
        dup++;
        return;
      }
      o.hit = true;
      delete o.investigatedOnly;
      tp++;
      if (f.severity) {
        severityChecked++;
        const d = Math.abs(
          SEVERITIES.indexOf(f.severity) - SEVERITIES.indexOf(match.expected!.severity),
        );
        if (d <= 1) severityAgreed++;
      }
      return;
    }
    fp++;
    fpFindings.push(id);
    for (const c of safe) {
      if (flagsSafeCase(f, c, run.fixture)) {
        const o = outcomes.get(c.id)!;
        o.hit = true;
        o.findings.push(id);
      }
    }
  });

  // Evidence validity: location points at an existing file and line; quoted evidence (when given
  // and not masked) appears in that file.
  let valid = 0;
  for (const f of run.findings) {
    if (!f.location || f.location.startLine === undefined) continue;
    const lines = await fixtureFileLines(
      fixturesDir,
      run.fixture,
      normalizeFindingPath(f.location.file, run.fixture),
    );
    if (!lines || f.location.startLine < 1 || f.location.startLine > lines.length) continue;
    const snippet = f.evidence?.replace(/`/g, '').trim();
    const checkable = snippet && snippet.length >= 8 && !/…|\.\.\.|REDACTED|\*\*\*/.test(snippet);
    if (checkable) {
      const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
      if (!squash(lines.join('\n')).includes(squash(snippet))) continue;
    }
    valid++;
  }

  const considered = run.findings.length - ni;
  const precision = ratio(tp, tp + fp, 'no confirmed or likely findings were reported');
  const detected = [...outcomes.values()].filter((o) => o.kind === 'vulnerable' && o.hit).length;
  const recall = ratio(
    detected,
    vulnerable.length,
    'no vulnerable cases in scope for this fixture and agent',
  );
  let f1: Metric = unavailable('needs both precision and recall');
  if (precision.status === 'measured' && recall.status === 'measured') {
    const p = precision.value!;
    const r = recall.value!;
    f1 = measured(p + r === 0 ? 0 : (2 * p * r) / (p + r));
  }
  const flaggedSafe = [...outcomes.values()].filter((o) => o.kind === 'safe' && o.hit).length;
  const successes = detected + (safe.length - flaggedSafe);

  return {
    scope: { vulnerable: vulnerable.length, safe: safe.length },
    reported: run.findings.length,
    considered,
    needsInvestigation: ni,
    truePositives: tp,
    duplicates: dup,
    falsePositives: fp,
    precision,
    recall,
    f1,
    falsePositiveRate: ratio(flaggedSafe, safe.length, 'no safe cases in scope'),
    evidenceValidity: ratio(valid, run.findings.length, 'no findings reported'),
    severityAgreement: ratio(
      severityAgreed,
      severityChecked,
      'no detected finding stated a severity',
    ),
    taskSuccess: ratio(successes, scope.length, 'no cases in scope'),
    counts: {
      detected,
      flaggedSafe,
      validEvidence: valid,
      severityChecked,
      severityAgreed,
      successes,
    },
    outcomes: [...outcomes.values()],
    falsePositiveFindings: fpFindings,
  };
}
