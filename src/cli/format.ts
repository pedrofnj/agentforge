import { ADAPTERS } from '../adapters/index.js';
import { conflictMessage, type ActionKind, type Plan } from '../installer/plan.js';
import { plainStyle, type Style } from './style.js';

const ORDER: ActionKind[] = [
  'create',
  'update',
  'overwrite',
  'remove',
  'adopt',
  'keep-modified',
  'forget',
  'unchanged',
];

/** Concise plan summary; per-file detail only with --verbose. */
export function formatPlan(
  plan: Plan,
  location: string,
  verbose: boolean,
  st: Style = plainStyle,
): string[] {
  const title = plan.operation[0]!.toUpperCase() + plan.operation.slice(1);
  const lines = [`${title} plan (${plan.scope}: ${location})`];
  if (plan.components.length === 0) lines.push('  No components affected.');

  for (const c of plan.components) {
    const actions = plan.actions.filter((a) => a.platform === c.platform && a.componentId === c.id);
    const counts = ORDER.map((k) => [k, actions.filter((a) => a.kind === k).length] as const)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${k} ${n}`);
    const version = c.from && c.to && c.from !== c.to ? `${c.from} -> ${c.to}` : (c.to ?? c.from);
    lines.push(
      `  ${ADAPTERS[c.platform].displayName.padEnd(11)} ${c.kind.padEnd(5)} ${c.id}@${version}  ${counts.join(', ') || 'no files'}`,
    );
    if (verbose) {
      for (const a of actions)
        lines.push(`      ${a.kind.padEnd(13)} ${a.absPath}${a.note ? `  (${a.note})` : ''}`);
    }
  }
  if (verbose) lines.push(`  State: ${plan.stateDir}`);
  if (plan.warnings.length > 0) {
    lines.push(st.yellow('Warnings:'), ...plan.warnings.map((w) => `  - ${w}`));
  }
  if (plan.conflicts.length > 0) {
    lines.push(
      st.red('Conflicts:'),
      ...plan.conflicts.map((c) => `  ! ${c.absPath}: ${conflictMessage[c.reason]}`),
    );
  }
  return lines;
}

/** One-line totals for the preview: what will be new, updated, removed or blocked. */
export function previewCounts(plan: Plan, st: Style = plainStyle): string {
  const n = (...kinds: ActionKind[]) => plan.actions.filter((a) => kinds.includes(a.kind)).length;
  const parts = [
    `${n('create')} new`,
    `${n('update', 'overwrite')} updated`,
    `${n('remove')} removed`,
    `${n('unchanged', 'adopt')} unchanged`,
    `${n('keep-modified')} kept (local edits)`,
  ];
  const conflicts = plan.conflicts.length;
  return `Files: ${parts.join(', ')}, ${conflicts > 0 ? st.red(`${conflicts} conflict(s)`) : '0 conflicts'}`;
}
