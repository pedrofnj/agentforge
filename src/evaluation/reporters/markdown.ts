import type { Metric } from '../core/types.js';
import type { ComparisonResult } from '../analyzers/compare.js';
import type { EvaluationReport } from './report.js';

/** `0.75 (3/4)`, `1200 (measured)`, `~300 (estimated)`, `unavailable: reason`. */
export function formatMetric(
  m: Metric<number | string>,
  kind: 'ratio' | 'count' = 'count',
): string {
  if (m.status === 'unavailable') return `unavailable${m.note ? `: ${m.note}` : ''}`;
  const v = m.value!;
  const shown = typeof v === 'number' && kind === 'ratio' ? `${(v * 100).toFixed(1)}%` : String(v);
  if (m.status === 'estimated') return `~${shown} (estimated)`;
  return kind === 'ratio' && m.note ? `${shown} (${m.note})` : shown;
}

const cell = (s: string) => s.replace(/\|/g, '\\|');

export function renderReportMarkdown(r: EvaluationReport): string {
  const out: string[] = [
    '# AgentForge evaluation report',
    '',
    `- AgentForge version: ${r.agentforgeVersion}`,
    `- Benchmark cases: ${r.casesTotal} (digest ${r.casesDigest.slice(0, 12)})`,
    `- Case coverage: ${formatMetric(r.coverage, 'ratio')}`,
    `- Behavioral evidence: ${r.behavioralEvidence}`,
    '',
    'Values are **measured** (computed from imported data or ground truth), **~estimated**, or **unavailable** with a reason.',
    '',
  ];
  if (r.aggregates.length > 0) {
    out.push(
      '## Quality and consumption by client, agent, profile and budget',
      '',
      '| Client | Agent | Profile | Budget | Runs | Precision | Recall | F1 | FP rate | Evidence valid | Task success | Input | Output | Cache read | Cache write | Total |',
      '| --- | --- | --- | --- | --: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    );
    for (const a of r.aggregates) {
      const t = a.tokens;
      out.push(
        `| ${[a.client, a.agent, a.profile, a.budget, String(a.runs), formatMetric(a.precision, 'ratio'), formatMetric(a.recall, 'ratio'), formatMetric(a.f1, 'ratio'), formatMetric(a.falsePositiveRate, 'ratio'), formatMetric(a.evidenceValidity, 'ratio'), formatMetric(a.taskSuccess, 'ratio'), formatMetric(t.inputTokens), formatMetric(t.outputTokens), formatMetric(t.cacheReadTokens), formatMetric(t.cacheWriteTokens), formatMetric(t.totalTokens)].map(cell).join(' | ')} |`,
      );
    }
    out.push('');
  }
  for (const run of r.runs) {
    const q = run.quality;
    out.push(
      `## Run ${run.runId}`,
      '',
      `- Source: ${run.source}; client: ${run.client}; agent: ${run.agent}; profile: ${run.profile}; budget: ${run.budget}; fixture: ${run.fixture}`,
      `- Findings: ${q.reported} reported (${q.considered} confirmed/likely, ${q.needsInvestigation} needs investigation); TP ${q.truePositives}, FP ${q.falsePositives}, duplicates ${q.duplicates}`,
      `- Precision ${formatMetric(q.precision, 'ratio')}; recall ${formatMetric(q.recall, 'ratio')}; F1 ${formatMetric(q.f1, 'ratio')}; FP rate ${formatMetric(q.falsePositiveRate, 'ratio')}`,
      `- Evidence validity ${formatMetric(q.evidenceValidity, 'ratio')}; severity agreement ${formatMetric(q.severityAgreement, 'ratio')}; task success ${formatMetric(q.taskSuccess, 'ratio')}`,
    );
    const missed = q.outcomes
      .filter((o) => o.kind === 'vulnerable' && !o.hit)
      .map((o) => o.caseId + (o.investigatedOnly ? ' (needs investigation only)' : ''));
    const flagged = q.outcomes.filter((o) => o.kind === 'safe' && o.hit).map((o) => o.caseId);
    if (missed.length) out.push(`- Missed cases: ${missed.join(', ')}`);
    if (flagged.length) out.push(`- Safe cases flagged: ${flagged.join(', ')}`);
    if (q.falsePositiveFindings.length)
      out.push(`- False positive findings: ${q.falsePositiveFindings.join(', ')}`);
    const u = run.usage;
    out.push(
      `- Usage (${u.provider}): input ${formatMetric(u.inputTokens)}; output ${formatMetric(u.outputTokens)}; cache read ${formatMetric(u.cacheReadTokens)}; cache write ${formatMetric(u.cacheWriteTokens)}; reasoning ${formatMetric(u.reasoningTokens)}; total ${formatMetric(u.totalTokens)}; cost ${formatMetric(u.costUsd)}; model ${formatMetric(u.model)}`,
    );
    const e = run.execution;
    out.push(
      `- Execution: tool calls ${formatMetric(e.toolCalls)}; delegations ${formatMetric(e.delegations)}; files read ${formatMetric(e.filesRead)}; repeated reads ${formatMetric(e.repeatedReads)}; duration ms ${formatMetric(e.durationMs)}; turns ${formatMetric(e.turns)}`,
    );
    for (const n of run.notes) out.push(`- Note: ${n}`);
    out.push('');
  }
  out.push('## Limitations', '', ...r.limitations.map((l) => `- ${l}`), '');
  return out.join('\n');
}

export function renderComparisonMarkdown(c: ComparisonResult): string {
  const out = [
    '# AgentForge evaluation comparison',
    '',
    `- Before: ${c.before.label}; after: ${c.after.label}`,
    `- Same benchmark cases: ${c.sameCases ? 'yes' : 'no (results are not directly comparable)'}`,
    '',
    '| Client | Agent | Profile | Budget | Metric | Before | After | Delta |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const row of c.rows) {
    out.push(
      `| ${[row.client, row.agent, row.profile, row.budget, row.metric, row.before, row.after, row.delta].map(cell).join(' | ')} |`,
    );
  }
  out.push('', c.regressions.length ? '## Regressions' : '## No regressions detected', '');
  for (const r of c.regressions) out.push(`- ${r}`);
  if (c.unmatched.length) out.push('', `Only in one report: ${c.unmatched.join(', ')}`);
  out.push('');
  return out.join('\n');
}
