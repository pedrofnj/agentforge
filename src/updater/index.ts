import { ADAPTERS } from '../adapters/index.js';
import { loadComponent, type Catalog } from '../registry/index.js';
import {
  mergeComponentPlan,
  planComponent,
  type Plan,
  type PlanOptions,
} from '../installer/plan.js';
import { readState, stateDirFor } from '../installer/state.js';

/** Compares x.y.z[-pre] versions. Build metadata is ignored; prereleases sort first. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [core = '', pre] = v.split('+')[0]!.split(/-(.*)/s, 2);
    return { nums: core.split('.').map(Number), pre };
  };
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i++) {
    const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0);
    if (d !== 0) return Math.sign(d);
  }
  if (x.pre === y.pre) return 0;
  if (x.pre === undefined) return 1;
  if (y.pre === undefined) return -1;
  return x.pre.localeCompare(y.pre, 'en', { numeric: true });
}

/**
 * Updates installed components from the catalog. Never downgrades; files the
 * user modified are preserved (keep-modified); missing files are restored.
 */
export async function planUpdate(
  catalog: Catalog,
  ids: readonly string[] | 'all',
  opts: PlanOptions,
): Promise<Plan> {
  const state = await readState(stateDirFor(opts.scope, opts.env));
  const plan: Plan = {
    operation: 'update',
    scope: opts.scope,
    stateDir: stateDirFor(opts.scope, opts.env),
    actions: [],
    conflicts: [],
    warnings: [],
    components: [],
    nextState: { ...state, components: [...state.components] },
    previousStateJson: JSON.stringify(state),
  };
  const installed = state.components.filter(
    (c) => opts.platforms.includes(c.platform) && (ids === 'all' || ids.includes(c.id)),
  );
  if (ids !== 'all') {
    for (const id of ids) {
      if (!installed.some((c) => c.id === id))
        plan.warnings.push(`${id}: not installed in this scope`);
    }
  }
  const byId = new Map(catalog.entries.map((e) => [e.manifest.id, e]));

  for (const rec of installed) {
    const label = `${ADAPTERS[rec.platform].displayName} / ${rec.id}`;
    const entry = byId.get(rec.id);
    if (!entry || entry.manifest.kind !== rec.kind) {
      plan.warnings.push(`${label}: no longer in the catalog; left as is`);
      continue;
    }
    const m = entry.manifest;
    if (compareVersions(m.version, rec.version) < 0) {
      plan.warnings.push(
        `${label}: installed ${rec.version} is newer than catalog ${m.version}; skipped`,
      );
      continue;
    }
    if (!m.targets.includes(rec.platform)) {
      plan.warnings.push(`${label}: catalog version no longer supports this client; left as is`);
      continue;
    }
    const part = await planComponent({
      platform: rec.platform,
      component: await loadComponent(entry),
      existing: rec,
      onModified: 'keep',
      opts,
    });
    mergeComponentPlan(plan, part, rec.version);
    for (const dep of part.record.requires ?? []) {
      if (!state.components.some((c) => c.platform === rec.platform && c.id === dep)) {
        plan.warnings.push(`${label}: now requires ${dep}; run "agentforge install ${dep}"`);
      }
    }
  }
  return plan;
}
