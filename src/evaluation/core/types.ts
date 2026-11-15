/**
 * Evaluation contracts. Three kinds of data never mix:
 * - ground truth (benchmark cases, authored),
 * - run results (imported from a real client run or entered manually),
 * - computed metrics, each labeled measured, estimated or unavailable.
 */

export const CASE_CATEGORIES = [
  'security',
  'architecture',
  'quality',
  'performance',
  'infrastructure',
] as const;
export type CaseCategory = (typeof CASE_CATEGORIES)[number];

export const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const FINDING_STATUSES = ['confirmed', 'likely', 'needs-investigation'] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];

export interface EvidenceSpec {
  /** Path relative to the fixture root. */
  file: string;
  /** Text that occurs on exactly one line of the file; that line is the evidence line. */
  contains: string;
}

export interface BenchmarkCase {
  id: string;
  category: CaseCategory;
  subcategory: string;
  /** vulnerable: has an expected problem; safe: measures false positives. */
  kind: 'vulnerable' | 'safe';
  description: string;
  /** Directory under evals/fixtures. */
  fixture: string;
  /** Agent whose responsibility the case belongs to. */
  agent: string;
  /** Skill and references expected to apply (optional guidance, checked to exist). */
  skill?: string;
  references?: string[];
  files: string[];
  /** Safe cases: words that make a finding in `files` count as a false positive. */
  keywords?: string[];
  expected?: {
    issue: string;
    evidence: EvidenceSpec[];
    severity: Severity;
    cwe?: string;
    /** A finding must name the problem: one keyword in title/category/CWE (case-insensitive). */
    keywords: string[];
  };
  acceptance: string[];
  falsePositive: string[];
  limitations: string[];
}

/** A case with evidence lines resolved against the fixture files. */
export interface ResolvedCase extends BenchmarkCase {
  evidenceLines: Array<{ file: string; line: number }>;
}

export interface ReportedFinding {
  id?: string;
  title: string;
  category?: string;
  cwe?: string;
  severity?: Severity;
  status?: FindingStatus;
  location?: { file: string; startLine?: number; endLine?: number };
  evidence?: string;
}

export type MetricStatus = 'measured' | 'estimated' | 'unavailable';

export interface Metric<T = number> {
  status: MetricStatus;
  value?: T;
  /** Where the value comes from, or why it is unavailable. */
  note?: string;
}

/** Provider categories are kept as reported; totals are only computed where semantics are documented. */
export interface UsageMetrics {
  provider: 'anthropic' | 'openai' | 'unknown';
  inputTokens: Metric;
  outputTokens: Metric;
  cacheReadTokens: Metric;
  cacheWriteTokens: Metric;
  reasoningTokens: Metric;
  totalTokens: Metric;
  costUsd: Metric;
  model: Metric<string>;
}

export interface ExecutionMetrics {
  toolCalls: Metric;
  delegations: Metric;
  filesRead: Metric;
  repeatedReads: Metric;
  durationMs: Metric;
  turns: Metric;
}

export const RUN_SOURCES = [
  'manual',
  'claude-code-json',
  'codex-exec-jsonl',
  'report-markdown',
] as const;
export type RunSource = (typeof RUN_SOURCES)[number];

export interface RunResult {
  schemaVersion: 1;
  runId: string;
  source: RunSource;
  client: 'claude-code' | 'codex' | 'unknown';
  agentforgeVersion?: string;
  agent: string;
  profile?: 'quick' | 'standard' | 'deep';
  budget?: 'economy' | 'balanced' | 'thorough';
  fixture: string;
  findings: ReportedFinding[];
  usage: UsageMetrics;
  execution: ExecutionMetrics;
  notes?: string[];
}

export const unavailable = (note: string): Metric<never> => ({ status: 'unavailable', note });
export const measured = <T>(value: T, note?: string): Metric<T> =>
  note ? { status: 'measured', value, note } : { status: 'measured', value };

export function emptyUsage(note = 'not provided'): UsageMetrics {
  return {
    provider: 'unknown',
    inputTokens: unavailable(note),
    outputTokens: unavailable(note),
    cacheReadTokens: unavailable(note),
    cacheWriteTokens: unavailable(note),
    reasoningTokens: unavailable(note),
    totalTokens: unavailable(note),
    costUsd: unavailable(note),
    model: unavailable(note),
  };
}

export function emptyExecution(note = 'not provided'): ExecutionMetrics {
  return {
    toolCalls: unavailable(note),
    delegations: unavailable(note),
    filesRead: unavailable(note),
    repeatedReads: unavailable(note),
    durationMs: unavailable(note),
    turns: unavailable(note),
  };
}
