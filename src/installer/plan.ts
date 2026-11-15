import { ADAPTERS, renderFor } from '../adapters/index.js';
import type { ArtifactLocation } from '../adapters/types.js';
import type { InstallScope, LoadedComponent, Platform } from '../core/types.js';
import { checkRenderedFile } from '../validator/rendered.js';
import {
  dependenciesOf,
  loadComponent,
  resolveSelection,
  type Catalog,
  type CatalogEntry,
} from '../registry/index.js';
import { inspectPath, sha256 } from './fs-safe.js';
import {
  componentKey,
  managedFilePath,
  readState,
  stateDirFor,
  type InstallEnvironment,
  type ManagedComponent,
  type ManagedFile,
  type StateManifest,
} from './state.js';

/**
 * create/update/overwrite write a file; remove deletes one. The rest only
 * change the manifest: adopt (identical file already present), unchanged,
 * keep-modified (user edits preserved), forget (stop tracking).
 */
export type ActionKind =
  'create' | 'update' | 'overwrite' | 'remove' | 'adopt' | 'unchanged' | 'keep-modified' | 'forget';

export const MUTATING: ReadonlySet<ActionKind> = new Set([
  'create',
  'update',
  'overwrite',
  'remove',
]);

export interface FileAction {
  kind: ActionKind;
  platform: Platform;
  componentId: string;
  location: ArtifactLocation;
  relativePath: string;
  /** Location dir: nothing below it may be a symlink. */
  root: string;
  absPath: string;
  content?: string;
  note?: string;
}

export type ConflictReason = 'unmanaged-file' | 'modified' | 'symlink' | 'not-a-file';

export interface Conflict {
  platform: Platform;
  componentId: string;
  absPath: string;
  reason: ConflictReason;
  /** Symlinks and non-files are never overwritten, even with consent. */
  overridable: boolean;
}

export type Operation = 'install' | 'update' | 'uninstall';

export interface Plan {
  operation: Operation;
  scope: InstallScope;
  stateDir: string;
  actions: FileAction[];
  conflicts: Conflict[];
  /** Non-blocking notes: platform gaps, skipped components. */
  warnings: string[];
  /** Components touched, for the summary. */
  components: Array<{ platform: Platform; id: string; kind: string; from?: string; to?: string }>;
  /** Manifest to persist if the plan is applied. */
  nextState: StateManifest;
  /** Serialized state the plan was built from (detects manifest-only changes). */
  previousStateJson: string;
}

export interface PlanOptions {
  env: InstallEnvironment;
  scope: InstallScope;
  platforms: readonly Platform[];
  /** User consented to overwrite overridable conflicts. */
  overwrite?: boolean;
}

export const hasChanges = (p: Plan) =>
  p.actions.some((a) => a.kind !== 'unchanged') ||
  JSON.stringify(p.nextState) !== p.previousStateJson;

export const conflictMessage: Record<ConflictReason, string> = {
  'unmanaged-file': 'file exists and was not installed by AgentForge',
  modified: 'file was modified after installation',
  symlink: 'path contains a symbolic link (never followed)',
  'not-a-file': 'path is a directory or special file',
};

interface ComponentPlanInput {
  platform: Platform;
  component: LoadedComponent;
  existing: ManagedComponent | undefined;
  /** install: modified files conflict; update: modified files are preserved. */
  onModified: 'conflict' | 'keep';
  opts: PlanOptions;
}

/** Plans the files of one component for one client and returns its new manifest record. */
export async function planComponent(input: ComponentPlanInput): Promise<{
  actions: FileAction[];
  conflicts: Conflict[];
  warnings: string[];
  record: ManagedComponent;
}> {
  const { platform, component, existing, onModified, opts } = input;
  const m = component.manifest;
  const rendered = renderFor(platform, component);
  const formatWarnings: string[] = [];
  for (const f of rendered.files) {
    const check = checkRenderedFile(platform, f);
    if (check.errors.length > 0) {
      throw new Error(
        `Generated ${f.relativePath} for ${platform} is invalid: ${check.errors.join('; ')}`,
      );
    }
    formatWarnings.push(...check.warnings);
  }
  const actions: FileAction[] = [];
  const conflicts: Conflict[] = [];
  const files: ManagedFile[] = [];
  const recorded = new Map((existing?.files ?? []).map((f) => [`${f.location}:${f.path}`, f]));
  const base = { platform, componentId: m.id };

  for (const f of rendered.files) {
    const { root, abs } = managedFilePath(
      platform,
      { location: f.location, path: f.relativePath },
      opts.scope,
      opts.env,
    );
    const hash = sha256(f.content);
    const rec = recorded.get(`${f.location}:${f.relativePath}`);
    recorded.delete(`${f.location}:${f.relativePath}`);
    const action = {
      ...base,
      location: f.location,
      relativePath: f.relativePath,
      root,
      absPath: abs,
      content: f.content,
    };
    const status = await inspectPath(root, abs);
    let sha = hash;

    if (status.kind === 'symlink' || status.kind === 'not-a-file') {
      conflicts.push({ ...base, absPath: abs, reason: status.kind, overridable: false });
    } else if (status.kind === 'missing') {
      actions.push({ ...action, kind: 'create' });
    } else if (status.sha256 === hash) {
      actions.push({ ...action, kind: rec ? 'unchanged' : 'adopt' });
    } else if (rec && rec.sha256 === status.sha256) {
      actions.push({ ...action, kind: 'update' });
    } else if (rec && onModified === 'keep') {
      actions.push({ ...action, kind: 'keep-modified', note: 'local changes preserved' });
      sha = rec.sha256;
    } else if (opts.overwrite) {
      actions.push({ ...action, kind: 'overwrite', note: 'original preserved in state dir' });
    } else {
      conflicts.push({
        ...base,
        absPath: abs,
        reason: rec ? 'modified' : 'unmanaged-file',
        overridable: true,
      });
    }
    files.push({ location: f.location, path: f.relativePath, sha256: sha });
  }

  // Files from a previous version that the new version no longer renders.
  for (const rec of recorded.values()) {
    actions.push(...(await planRemoval(platform, m.id, rec, opts)));
  }

  return {
    actions,
    conflicts,
    warnings: [...rendered.warnings, ...formatWarnings].map(
      (w) => `${ADAPTERS[platform].displayName} / ${m.id}: ${w}`,
    ),
    record: {
      platform,
      id: m.id,
      kind: m.kind,
      version: m.version,
      ...(dependenciesOf(m).length > 0 ? { requires: [...dependenciesOf(m)] } : {}),
      files,
    },
  };
}

/** Removal is proven by hash: only files still identical to what we wrote are deleted. */
export async function planRemoval(
  platform: Platform,
  componentId: string,
  rec: ManagedFile,
  opts: Pick<PlanOptions, 'env' | 'scope'>,
): Promise<FileAction[]> {
  const { root, abs } = managedFilePath(platform, rec, opts.scope, opts.env);
  const status = await inspectPath(root, abs);
  const action = {
    platform,
    componentId,
    location: rec.location,
    relativePath: rec.path,
    root,
    absPath: abs,
  };
  if (status.kind === 'missing') return [{ ...action, kind: 'forget', note: 'already absent' }];
  if (status.kind === 'file' && status.sha256 === rec.sha256)
    return [{ ...action, kind: 'remove' }];
  return [
    {
      ...action,
      kind: 'keep-modified',
      note: 'not identical to the installed file; left in place',
    },
  ];
}

function newPlan(operation: Operation, opts: PlanOptions, state: StateManifest): Plan {
  return {
    operation,
    scope: opts.scope,
    stateDir: stateDirFor(opts.scope, opts.env),
    actions: [],
    conflicts: [],
    warnings: [],
    components: [],
    nextState: { ...state, components: [...state.components] },
    previousStateJson: JSON.stringify(state),
  };
}

export function upsertRecord(state: StateManifest, record: ManagedComponent): void {
  const key = componentKey(record);
  const i = state.components.findIndex((c) => componentKey(c) === key);
  if (i >= 0) state.components[i] = record;
  else state.components.push(record);
  state.components.sort((a, b) => componentKey(a).localeCompare(componentKey(b)));
}

export function mergeComponentPlan(
  plan: Plan,
  part: Awaited<ReturnType<typeof planComponent>>,
  from: string | undefined,
): void {
  plan.actions.push(...part.actions);
  plan.conflicts.push(...part.conflicts);
  for (const w of part.warnings) if (!plan.warnings.includes(w)) plan.warnings.push(w);
  plan.components.push({
    platform: part.record.platform,
    id: part.record.id,
    kind: part.record.kind,
    ...(from ? { from } : {}),
    to: part.record.version,
  });
  upsertRecord(plan.nextState, part.record);
}

/** Install selected components (plus agent skill dependencies) for each client. */
export async function planInstall(
  catalog: Catalog,
  ids: readonly string[],
  opts: PlanOptions,
): Promise<Plan> {
  const state = await readState(stateDirFor(opts.scope, opts.env));
  const plan = newPlan('install', opts, state);
  const selected = resolveSelection(catalog, ids);
  const loaded = new Map<CatalogEntry, LoadedComponent>();

  for (const platform of opts.platforms) {
    const adapter = ADAPTERS[platform];
    for (const entry of selected) {
      const m = entry.manifest;
      if (!m.targets.includes(platform)) {
        plan.warnings.push(
          `${adapter.displayName} / ${m.id}: skipped (component does not support this client)`,
        );
        continue;
      }
      const blocking = adapter.checkCompatibility(m);
      if (blocking.length > 0) {
        plan.warnings.push(
          ...blocking.map((b) => `${adapter.displayName} / ${m.id}: skipped (${b})`),
        );
        continue;
      }
      if (!loaded.has(entry)) loaded.set(entry, await loadComponent(entry));
      const existing = state.components.find((c) => c.platform === platform && c.id === m.id);
      const part = await planComponent({
        platform,
        component: loaded.get(entry)!,
        existing,
        onModified: 'conflict',
        opts,
      });
      mergeComponentPlan(plan, part, existing?.version);
    }
  }
  return plan;
}

/** Uninstall managed components. Ids that are not installed are reported, not errors. */
export async function planUninstall(
  ids: readonly string[] | 'all',
  opts: PlanOptions,
): Promise<Plan> {
  const state = await readState(stateDirFor(opts.scope, opts.env));
  const plan = newPlan('uninstall', opts, state);
  const targets = state.components.filter(
    (c) => opts.platforms.includes(c.platform) && (ids === 'all' || ids.includes(c.id)),
  );
  if (ids !== 'all') {
    for (const id of ids)
      if (!targets.some((c) => c.id === id))
        plan.warnings.push(`${id}: not installed in this scope`);
  }
  const removed = new Set(targets.map(componentKey));
  for (const other of state.components) {
    if (removed.has(componentKey(other))) continue;
    for (const dep of other.requires ?? []) {
      if (removed.has(componentKey({ platform: other.platform, id: dep }))) {
        plan.warnings.push(
          `${other.id} (${other.platform}) requires ${dep}, which is being removed`,
        );
      }
    }
  }
  for (const rec of targets) {
    for (const f of rec.files)
      plan.actions.push(...(await planRemoval(rec.platform, rec.id, f, opts)));
    plan.components.push({ platform: rec.platform, id: rec.id, kind: rec.kind, from: rec.version });
    plan.nextState.components = plan.nextState.components.filter(
      (c) => componentKey(c) !== componentKey(rec),
    );
  }
  return plan;
}
