import { assertSafeRelativePath } from '../../core/paths.js';
import type { Collected } from '../collectors/index.js';
import { sanitizeDeep } from '../reporters/sanitize.js';
import {
  FINDING_STATUSES,
  RUN_SOURCES,
  SEVERITIES,
  type RunResult,
  type RunSource,
} from './types.js';

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const METRIC_STATUSES = ['measured', 'estimated', 'unavailable'];
const USAGE_KEYS = [
  'inputTokens',
  'outputTokens',
  'cacheReadTokens',
  'cacheWriteTokens',
  'reasoningTokens',
  'totalTokens',
  'costUsd',
  'model',
];
const EXECUTION_KEYS = [
  'toolCalls',
  'delegations',
  'filesRead',
  'repeatedReads',
  'durationMs',
  'turns',
];

function checkMetrics(obj: unknown, keys: string[], where: string, errors: string[]) {
  if (!isObj(obj)) {
    errors.push(`${where} must be an object`);
    return;
  }
  for (const k of keys) {
    const m = obj[k];
    if (!isObj(m) || !METRIC_STATUSES.includes(m.status as string)) {
      errors.push(`${where}.${k} must be { status: measured|estimated|unavailable }`);
      continue;
    }
    if (m.status !== 'unavailable') {
      const okType =
        k === 'model' ? typeof m.value === 'string' : typeof m.value === 'number' && m.value >= 0;
      if (!okType)
        errors.push(
          `${where}.${k}.value must be ${k === 'model' ? 'a string' : 'a non-negative number'}`,
        );
    }
  }
}

/** Validates a run result file (manual or imported). Returns the errors found. */
export function validateRun(raw: unknown): string[] {
  const e: string[] = [];
  if (!isObj(raw)) return ['run must be a JSON object'];
  if (raw.schemaVersion !== 1) e.push('schemaVersion must be 1');
  if (typeof raw.runId !== 'string' || raw.runId.trim() === '') e.push('runId is required');
  if (!(RUN_SOURCES as readonly unknown[]).includes(raw.source))
    e.push(`source must be one of ${RUN_SOURCES.join(', ')}`);
  if (!['claude-code', 'codex', 'unknown'].includes(raw.client as string))
    e.push('client must be claude-code, codex or unknown');
  if (typeof raw.agent !== 'string' || raw.agent === '') e.push('agent is required');
  if (typeof raw.fixture !== 'string') e.push('fixture is required');
  else {
    try {
      assertSafeRelativePath(raw.fixture);
    } catch (err) {
      e.push(`fixture: ${(err as Error).message}`);
    }
  }
  if (raw.profile !== undefined && !['quick', 'standard', 'deep'].includes(raw.profile as string))
    e.push('profile must be quick, standard or deep');
  if (
    raw.budget !== undefined &&
    !['economy', 'balanced', 'thorough'].includes(raw.budget as string)
  )
    e.push('budget must be economy, balanced or thorough');
  if (!Array.isArray(raw.findings)) e.push('findings must be an array');
  else
    raw.findings.forEach((f, i) => {
      const at = `findings[${i}]`;
      if (!isObj(f) || typeof f.title !== 'string') return void e.push(`${at}.title is required`);
      if (f.severity !== undefined && !(SEVERITIES as readonly unknown[]).includes(f.severity))
        e.push(`${at}.severity is invalid`);
      if (f.status !== undefined && !(FINDING_STATUSES as readonly unknown[]).includes(f.status))
        e.push(`${at}.status is invalid`);
      if (f.location !== undefined) {
        const l = f.location;
        if (!isObj(l) || typeof l.file !== 'string') e.push(`${at}.location.file is required`);
        else
          for (const k of ['startLine', 'endLine'] as const) {
            if (l[k] !== undefined && !(Number.isInteger(l[k]) && (l[k] as number) > 0))
              e.push(`${at}.location.${k} must be a positive integer`);
          }
      }
    });
  checkMetrics(raw.usage, USAGE_KEYS, 'usage', e);
  if (
    isObj(raw.usage) &&
    !['anthropic', 'openai', 'unknown'].includes(raw.usage.provider as string)
  )
    e.push('usage.provider is invalid');
  checkMetrics(raw.execution, EXECUTION_KEYS, 'execution', e);
  return e;
}

export interface RunMeta {
  source: RunSource;
  client: RunResult['client'];
  agent: string;
  fixture: string;
  profile?: RunResult['profile'];
  budget?: RunResult['budget'];
  agentforgeVersion?: string;
  runId?: string;
}

/** Builds a sanitized run result from collected data. Raw transcripts are never included. */
export function buildRun(collected: Collected, meta: RunMeta, homeDir?: string): RunResult {
  const run: RunResult = {
    schemaVersion: 1,
    runId:
      meta.runId ??
      [
        meta.client,
        meta.agent,
        meta.fixture,
        meta.profile ?? 'standard',
        meta.budget ?? 'balanced',
      ].join('-'),
    source: meta.source,
    client: meta.client,
    agent: meta.agent,
    fixture: meta.fixture,
    findings: collected.findings,
    usage: collected.usage,
    execution: collected.execution,
  };
  if (meta.agentforgeVersion) run.agentforgeVersion = meta.agentforgeVersion;
  if (meta.profile) run.profile = meta.profile;
  if (meta.budget) run.budget = meta.budget;
  if (collected.notes.length > 0) run.notes = collected.notes;
  const errors = validateRun(run);
  if (errors.length > 0) throw new Error(`Invalid run: ${errors.join('; ')}`);
  return sanitizeDeep(run, homeDir);
}
