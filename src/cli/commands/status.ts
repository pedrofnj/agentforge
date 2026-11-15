import { ADAPTERS } from '../../adapters/index.js';
import type { InstallScope, Platform } from '../../core/types.js';
import { inspectPath } from '../../installer/fs-safe.js';
import { readJournal } from '../../installer/apply.js';
import {
  managedFilePath,
  readState,
  stateDirFor,
  type InstallEnvironment,
  type ManagedComponent,
} from '../../installer/state.js';
import { discoverCatalog, type Catalog } from '../../registry/index.js';
import { compareVersions } from '../../updater/index.js';
import {
  EXIT,
  resolveClients,
  styleOf,
  UsageError,
  type CliContext,
  type Options,
} from '../context.js';
import { symbolsFor } from '../tui/symbols.js';
import { heading } from '../tui/ui.js';

export type FileHealth = 'intact' | 'modified' | 'missing' | 'unsafe';

export interface ComponentStatus {
  scope: InstallScope;
  platform: Platform;
  client: string;
  id: string;
  kind: string;
  installedVersion: string;
  /** Version in the catalog of this CLI; absent when the catalog no longer has it. */
  availableVersion?: string;
  updateAvailable: boolean;
  files: Record<FileHealth, number>;
  state: 'ok' | 'update-available' | 'modified' | 'missing-files' | 'unsafe' | 'not-in-catalog';
}

export interface ScopeStatus {
  scope: InstallScope;
  stateDir: string;
  pendingOperation: boolean;
  error?: string;
  components: ComponentStatus[];
}

async function componentStatus(
  scope: InstallScope,
  c: ManagedComponent,
  catalog: Catalog,
  env: InstallEnvironment,
): Promise<ComponentStatus> {
  const files: Record<FileHealth, number> = { intact: 0, modified: 0, missing: 0, unsafe: 0 };
  for (const f of c.files) {
    const { root, abs } = managedFilePath(c.platform, f, scope, env);
    const s = await inspectPath(root, abs);
    if (s.kind === 'missing') files.missing++;
    else if (s.kind !== 'file') files.unsafe++;
    else if (s.sha256 !== f.sha256) files.modified++;
    else files.intact++;
  }
  const entry = catalog.entries.find((e) => e.manifest.id === c.id);
  const available = entry?.manifest.version;
  const updateAvailable = available !== undefined && compareVersions(available, c.version) > 0;
  const state: ComponentStatus['state'] = files.unsafe
    ? 'unsafe'
    : files.missing
      ? 'missing-files'
      : files.modified
        ? 'modified'
        : !entry
          ? 'not-in-catalog'
          : updateAvailable
            ? 'update-available'
            : 'ok';
  return {
    scope,
    platform: c.platform,
    client: ADAPTERS[c.platform].displayName,
    id: c.id,
    kind: c.kind,
    installedVersion: c.version,
    ...(available !== undefined ? { availableVersion: available } : {}),
    updateAvailable,
    files,
    state,
  };
}

/** Installed components per scope, with integrity and available updates. Read-only. */
export async function collectStatus(
  env: InstallEnvironment,
  scopes: readonly InstallScope[],
  platforms: readonly Platform[],
  catalog: Catalog,
): Promise<ScopeStatus[]> {
  const out: ScopeStatus[] = [];
  for (const scope of scopes) {
    const stateDir = stateDirFor(scope, env);
    const result: ScopeStatus = { scope, stateDir, pendingOperation: false, components: [] };
    try {
      result.pendingOperation = (await readJournal(stateDir)) !== null;
      const state = await readState(stateDir);
      for (const c of state.components.filter((x) => platforms.includes(x.platform)))
        result.components.push(await componentStatus(scope, c, catalog, env));
    } catch (e) {
      result.error = (e as Error).message;
    }
    out.push(result);
  }
  return out;
}

const STATE_TEXT: Record<ComponentStatus['state'], string> = {
  ok: 'up to date',
  'update-available': 'update available',
  modified: 'modified locally',
  'missing-files': 'files missing',
  unsafe: 'replaced by link or directory',
  'not-in-catalog': 'not in this catalog',
};

export async function runStatus(
  ctx: CliContext,
  opts: Options,
  catalogRoot: string,
): Promise<number> {
  if (opts.global && opts.project)
    throw new UsageError('Use either --global or --project, not both');
  const platforms = await resolveClients(ctx, opts, { required: false });
  const scopes: InstallScope[] = opts.global
    ? ['global']
    : opts.project
      ? ['project']
      : ['global', 'project'];
  const catalog = await discoverCatalog(catalogRoot);
  const status = await collectStatus(ctx, scopes, platforms, catalog);
  const problems = status.some(
    (s) =>
      s.error ||
      s.pendingOperation ||
      s.components.some((c) => c.state === 'unsafe' || c.state === 'missing-files'),
  );

  if (opts.json) {
    ctx.out(JSON.stringify({ scopes: status }, null, 2));
    return problems ? EXIT.ERROR : EXIT.OK;
  }

  const st = styleOf(ctx);
  const sym = symbolsFor(ctx.terminal?.unicode ?? false);
  const g = (glyph: string) => (st.enabled ? `${glyph} ` : '');
  for (const s of status) {
    ctx.out(heading(`${s.scope === 'global' ? 'Global' : 'Project'}  ${st.dim(s.stateDir)}`, st));
    if (s.error) {
      ctx.err(`  ${st.red(`${g(sym.fail)}FAIL`)} ${s.error}`);
      continue;
    }
    if (s.pendingOperation)
      ctx.out(
        `  ${st.yellow(`${g(sym.warn)}WARN`)} interrupted operation pending; the next install, update or uninstall rolls it back`,
      );
    if (s.components.length === 0) {
      ctx.out(st.dim('  Nothing installed.'));
      continue;
    }
    for (const c of s.components) {
      const version =
        c.updateAvailable && c.availableVersion
          ? `${c.installedVersion} -> ${c.availableVersion}`
          : c.installedVersion;
      const text = STATE_TEXT[c.state];
      const label =
        c.state === 'ok'
          ? st.green(`${g(sym.ok)}${text}`)
          : c.state === 'unsafe' || c.state === 'missing-files'
            ? st.red(`${g(sym.fail)}${text}`)
            : st.yellow(`${g(sym.warn)}${text}`);
      ctx.out(
        `  ${c.client.padEnd(11)} ${c.kind.padEnd(5)} ${`${c.id}@${version}`.padEnd(40)} ${label}`,
      );
    }
    const updates = s.components.filter((c) => c.updateAvailable).length;
    if (updates > 0)
      ctx.out(st.dim(`  ${updates} update(s) available: agentforge update --${s.scope} --dry-run`));
  }
  return problems ? EXIT.ERROR : EXIT.OK;
}
