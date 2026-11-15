import {
  emptyExecution,
  emptyUsage,
  measured,
  unavailable,
  type ExecutionMetrics,
  type UsageMetrics,
} from '../core/types.js';
import { parseReportMarkdown } from './report-markdown.js';
import type { ReportedFinding } from '../core/types.js';

/**
 * Collectors turn a file the user explicitly passes into findings + metrics.
 * They read only that file, use only documented fields, and never keep the
 * transcript, commands or tool inputs. Formats (verified 2026-11-15):
 * - Claude Code `claude -p --output-format json`: `result`, `usage`,
 *   `total_cost_usd`; `modelUsage` (includes subagents) and `duration_ms`,
 *   `num_turns` as in the Agent SDK result message. Anthropic usage categories
 *   are disjoint (input excludes cache reads/writes).
 * - Codex `codex exec --json`: JSONL events; `turn.completed.usage` with
 *   input_tokens, cached_input_tokens, output_tokens, reasoning_output_tokens;
 *   items of type `command_execution` and `agent_message`.
 */
export interface Collected {
  findings: ReportedFinding[];
  usage: UsageMetrics;
  execution: ExecutionMetrics;
  notes: string[];
}

export class CollectorError extends Error {
  override name = 'CollectorError';
}

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

export function collectClaudeJson(text: string): Collected {
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new CollectorError(
      'not a JSON document (expected `claude -p --output-format json` output)',
    );
  }
  if (typeof obj.result !== 'string') {
    throw new CollectorError('missing "result" text; was the run successful and in json format?');
  }
  const usage = emptyUsage('not present in the result');
  usage.provider = 'anthropic';
  const execution = emptyExecution('tool calls are not part of the documented json result');
  const notes: string[] = [];

  const modelUsage = obj.modelUsage as Record<string, Record<string, unknown>> | undefined;
  const u = obj.usage as Record<string, unknown> | undefined;
  let fields:
    Record<'input' | 'output' | 'cacheRead' | 'cacheWrite', number | undefined> | undefined;
  if (modelUsage && typeof modelUsage === 'object' && Object.keys(modelUsage).length > 0) {
    const sum = (k: string) =>
      Object.values(modelUsage).reduce((n, m) => n + (num(m?.[k]) ?? 0), 0);
    fields = {
      input: sum('inputTokens'),
      output: sum('outputTokens'),
      cacheRead: sum('cacheReadInputTokens'),
      cacheWrite: sum('cacheCreationInputTokens'),
    };
    usage.model = measured(Object.keys(modelUsage).sort().join(', '));
    const cost = Object.values(modelUsage).reduce((n, m) => n + (num(m?.costUSD) ?? 0), 0);
    usage.costUsd = measured(cost, 'client-reported estimate in USD (modelUsage)');
    notes.push('Token totals from modelUsage, which includes subagent activity.');
  } else if (u) {
    fields = {
      input: num(u.input_tokens),
      output: num(u.output_tokens),
      cacheRead: num(u.cache_read_input_tokens),
      cacheWrite: num(u.cache_creation_input_tokens),
    };
    notes.push(
      'Token totals from result usage, which excludes subagent activity; agent runs may be undercounted.',
    );
  }
  if (fields) {
    const set = (v: number | undefined, note: string) =>
      v === undefined ? unavailable('field absent') : measured(v, note);
    usage.inputTokens = set(fields.input, 'excludes cache reads and writes');
    usage.outputTokens = set(fields.output, 'reported output tokens');
    usage.cacheReadTokens = set(fields.cacheRead, 'reported separately from input');
    usage.cacheWriteTokens = set(fields.cacheWrite, 'reported separately from input');
    usage.reasoningTokens = unavailable('not reported separately by this provider');
    const parts = [fields.input, fields.output, fields.cacheRead, fields.cacheWrite];
    usage.totalTokens = parts.every((p) => p !== undefined)
      ? measured(
          parts.reduce<number>((a, b) => a + b!, 0),
          'sum of disjoint categories (input + output + cache read + cache write)',
        )
      : unavailable('a category is missing');
  }
  if (usage.costUsd.status === 'unavailable' && num(obj.total_cost_usd) !== undefined) {
    usage.costUsd = measured(
      num(obj.total_cost_usd)!,
      'client-reported estimate in USD (total_cost_usd)',
    );
  }
  const duration = num(obj.duration_ms);
  if (duration !== undefined) execution.durationMs = measured(duration, 'duration_ms');
  const turns = num(obj.num_turns);
  if (turns !== undefined) execution.turns = measured(turns, 'num_turns');

  return { findings: parseReportMarkdown(obj.result), usage, execution, notes };
}

export function collectCodexJsonl(text: string): Collected {
  const usage = emptyUsage('no turn.completed event');
  usage.provider = 'openai';
  const execution = emptyExecution('not derivable from documented events');
  const totals = { input: 0, cached: 0, output: 0, reasoning: 0 };
  let turns = 0;
  let commands = 0;
  let lastMessage: string | undefined;
  const otherItems = new Map<string, number>();
  let parsed = 0;

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let ev: Record<string, unknown>;
    try {
      ev = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    parsed++;
    if (ev.type === 'turn.completed') {
      turns++;
      const u = (ev.usage ?? {}) as Record<string, unknown>;
      totals.input += num(u.input_tokens) ?? 0;
      totals.cached += num(u.cached_input_tokens) ?? 0;
      totals.output += num(u.output_tokens) ?? 0;
      totals.reasoning += num(u.reasoning_output_tokens) ?? 0;
    } else if (ev.type === 'item.completed' && ev.item && typeof ev.item === 'object') {
      const item = ev.item as Record<string, unknown>;
      if (item.type === 'command_execution') commands++;
      else if (item.type === 'agent_message' && typeof item.text === 'string')
        lastMessage = item.text;
      else if (typeof item.type === 'string')
        otherItems.set(item.type, (otherItems.get(item.type) ?? 0) + 1);
    }
  }
  if (parsed === 0)
    throw new CollectorError('no JSON events found (expected `codex exec --json` output)');
  if (lastMessage === undefined)
    throw new CollectorError('no agent_message item found; cannot read the report');

  const notes: string[] = [];
  if (turns > 0) {
    usage.inputTokens = measured(totals.input, 'input_tokens summed over turns');
    usage.cacheReadTokens = measured(
      totals.cached,
      'cached_input_tokens as reported; not added to totals',
    );
    usage.outputTokens = measured(totals.output, 'output_tokens summed over turns');
    usage.reasoningTokens = measured(
      totals.reasoning,
      'reasoning_output_tokens as reported; not added to totals',
    );
    usage.cacheWriteTokens = unavailable('not reported by this client');
    usage.totalTokens = unavailable(
      'whether cached and reasoning tokens are included in input/output is not documented',
    );
    execution.turns = measured(turns, 'turn.completed events');
  }
  execution.toolCalls = measured(
    commands,
    'command_execution items (other tool types not counted)',
  );
  usage.model = unavailable('not present in exec events');
  usage.costUsd = unavailable('not reported by this client');
  if (otherItems.size > 0) {
    notes.push(
      `Other item types seen: ${[...otherItems].map(([k, v]) => `${k}=${v}`).join(', ')}.`,
    );
  }
  return { findings: parseReportMarkdown(lastMessage), usage, execution, notes };
}

export function collectReportMarkdown(text: string): Collected {
  return {
    findings: parseReportMarkdown(text),
    usage: emptyUsage('report only; no usage data'),
    execution: emptyExecution('report only; no execution data'),
    notes: [],
  };
}

export const COLLECTORS = {
  'claude-json': { source: 'claude-code-json', client: 'claude-code', collect: collectClaudeJson },
  'codex-jsonl': { source: 'codex-exec-jsonl', client: 'codex', collect: collectCodexJsonl },
  'report-md': { source: 'report-markdown', client: 'unknown', collect: collectReportMarkdown },
} as const;
export type CollectorName = keyof typeof COLLECTORS;
