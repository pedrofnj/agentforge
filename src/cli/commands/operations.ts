import { realpathSync } from 'node:fs';
import path from 'node:path';
import { ADAPTERS } from '../../adapters/index.js';
import { PLATFORMS, type InstallScope, type Platform } from '../../core/types.js';
import { applyPlan, readJournal, recover } from '../../installer/apply.js';
import {
  hasChanges,
  planInstall,
  planUninstall,
  MUTATING,
  type Operation,
  type Plan,
  type PlanOptions,
} from '../../installer/plan.js';
import { locationDir, readState, stateDirFor } from '../../installer/state.js';
import { discoverCatalog, type Catalog } from '../../registry/index.js';
import { planUpdate } from '../../updater/index.js';
import {
  EXIT,
  findGitRoot,
  promptFor,
  resolveClients,
  resolveScope,
  UsageError,
  type CliContext,
  styleOf,
  type Options,
} from '../context.js';
import { detectEnvironment, unwritable } from '../environment.js';
import { formatPlan, previewCounts } from '../format.js';
import { createProgress } from '../tui/progress.js';
import { symbolsFor } from '../tui/symbols.js';
import { box, heading } from '../tui/ui.js';
import { askClients, askComponents, askScope, askUninstall, printWelcome } from './wizard.js';

function samePath(a: string, b: string, platform: NodeJS.Platform): boolean {
  // Resolve links first: on macOS the temp and home paths can differ only by /var -> /private/var.
  const real = (p: string) => {
    try {
      return realpathSync.native(p);
    } catch {
      return path.resolve(p);
    }
  };
  const norm = (p: string) => real(p).replace(/[\\/]+$/, '');
  return platform === 'win32' || platform === 'darwin'
    ? norm(a).toLowerCase() === norm(b).toLowerCase()
    : norm(a) === norm(b);
}

/** Every client location dir for a scope: the only places a journal may point to. */
function trustedRoots(scope: InstallScope, ctx: CliContext): string[] {
  return PLATFORMS.flatMap((p) =>
    (['skills', 'agents'] as const).map((loc) => locationDir(p, loc, scope, ctx)),
  );
}

async function loadCatalog(root: string): Promise<Catalog> {
  const catalog = await discoverCatalog(root);
  const errors = catalog.issues.filter((i) => i.severity === 'error');
  if (errors.length > 0) {
    throw new Error(`Catalog has ${errors.length} error(s); run "agentforge validate" for details`);
  }
  return catalog;
}

async function chooseToInstall(
  ctx: CliContext,
  opts: Options,
  ids: string[],
  catalog: Catalog,
  platforms: Platform[],
  scope: InstallScope,
): Promise<string[]> {
  const available = catalog.entries.filter((e) =>
    e.manifest.targets.some((t) => platforms.includes(t)),
  );
  if (opts.all) return available.map((e) => e.manifest.id);
  if (ids.length > 0) return ids;
  if (available.length === 0)
    throw new UsageError('The catalog has no components for the selected client(s)');
  const prompter = promptFor(ctx, opts);
  if (!prompter) throw new UsageError('Pass component ids or --all in non-interactive mode');
  const state = await readState(stateDirFor(scope, ctx));
  const installed = state.components.filter((c) => platforms.includes(c.platform));
  return askComponents(ctx, prompter, catalog, platforms, installed);
}

async function chooseToUninstall(
  ctx: CliContext,
  opts: Options,
  ids: string[],
  scope: InstallScope,
  platforms: Platform[],
): Promise<string[] | 'all'> {
  if (opts.all) return 'all';
  if (ids.length > 0) return ids;
  const prompter = promptFor(ctx, opts);
  if (!prompter) throw new UsageError('Pass component ids or --all in non-interactive mode');
  const state = await readState(stateDirFor(scope, ctx));
  const installed = state.components.filter((c) => platforms.includes(c.platform));
  if (installed.length === 0) return [];
  return askUninstall(ctx, prompter, installed);
}

/** Short, client-specific hints after an install or update (documented behavior only). */
function nextSteps(plan: Plan, scope: InstallScope): string[] {
  const platforms = new Set(plan.components.map((c) => c.platform));
  const agent = plan.components.find((c) => c.kind === 'agent')?.id;
  const ask = agent
    ? `"Use the ${agent} agent to review src/ (quick profile, economy budget)"`
    : '"Review src/auth for security issues" (skills load when the request matches)';
  const lines = ['', 'Next steps:'];
  if (platforms.has('claude-code')) {
    lines.push(
      `  Claude Code: start a new session${scope === 'project' ? ' in this project' : ''} and ask ${ask}.`,
    );
  }
  if (platforms.has('codex')) {
    lines.push(
      `  Codex: start a session with a read-only sandbox (codex --sandbox read-only) and ask ${ask}.`,
    );
    if (scope === 'project' && agent)
      lines.push('  Codex loads project agents only for trusted projects.');
  }
  lines.push('  Check the installation any time: agentforge doctor');
  return lines;
}

/** Final summary box of an interactive session (counts, clients, directories). */
function summary(ctx: CliContext, plan: Plan, scope: InstallScope): string[] {
  const st = styleOf(ctx);
  const unicode = ctx.terminal?.unicode ?? false;
  const sym = symbolsFor(unicode);
  const count = (kind: string) =>
    new Set(plan.components.filter((c) => c.kind === kind).map((c) => c.id)).size;
  const clients = [...new Set(plan.components.map((c) => ADAPTERS[c.platform].displayName))];
  const dirs = [
    ...new Set(plan.actions.filter((a) => MUTATING.has(a.kind)).map((a) => a.root)),
  ].sort();
  const verb = plan.operation === 'uninstall' ? 'Removed' : 'Installed';
  const lines = [
    st.bold(
      `${st.green(sym.ok)} ${verb} ${count('agent')} agent(s) and ${count('skill')} skill(s)`,
    ),
    `${st.dim('Clients')}  ${clients.join(', ') || '-'}`,
    `${st.dim('Scope  ')}  ${scope}`,
    ...dirs.map((d, i) => `${st.dim(i === 0 ? 'Paths  ' : '       ')}  ${d}`),
  ];
  return ['', ...box(lines, st, unicode)];
}

/** install | update | uninstall: plan, show, resolve conflicts, confirm, apply. */
export async function runOperation(
  operation: Operation,
  ctx: CliContext,
  opts: Options,
  ids: string[],
  catalogRoot: string,
): Promise<number> {
  const interactivePrompter = promptFor(ctx, opts);
  const wizard =
    interactivePrompter !== undefined &&
    operation !== 'update' &&
    ((operation === 'install' && opts.client === undefined) ||
      (!opts.global && !opts.project) ||
      (ids.length === 0 && !opts.all));
  const env = wizard ? await detectEnvironment(ctx) : undefined;
  if (env) printWelcome(ctx, env);
  const platforms = await resolveClients(ctx, opts, {
    required: operation === 'install',
    ...(env ? { ask: askClients(env) } : {}),
  });
  const scope = await resolveScope(
    ctx,
    opts,
    env
      ? askScope(ctx, platforms, operation === 'install' ? 'Install' : 'Uninstall', env)
      : undefined,
  );
  if (scope === 'project' && samePath(ctx.cwd, ctx.homeDir, ctx.osPlatform)) {
    // Project dirs would be ~/.claude, ~/.agents and ~/.codex: the global locations,
    // tracked by a second manifest. Refuse instead of mixing the two.
    throw new UsageError(
      'The current directory is your home directory: --project would write to the global locations. Use --global, or run from a project directory.',
    );
  }
  const stateDir = stateDirFor(scope, ctx);
  const location = scope === 'project' ? ctx.cwd : ctx.homeDir;

  if (opts.dryRun) {
    if (await readJournal(stateDir)) {
      ctx.err('Warning: an interrupted operation is pending; the next real run will roll it back.');
    }
  } else if (await recover(stateDir, trustedRoots(scope, ctx))) {
    ctx.out('Rolled back an interrupted operation.');
  }

  const catalog = operation === 'uninstall' ? undefined : await loadCatalog(catalogRoot);
  let selection: string[] | 'all';
  if (operation === 'install')
    selection = await chooseToInstall(ctx, opts, ids, catalog!, platforms, scope);
  else if (operation === 'update') selection = ids.length > 0 ? ids : 'all';
  else selection = await chooseToUninstall(ctx, opts, ids, scope, platforms);

  const build = (overwrite: boolean): Promise<Plan> => {
    const planOpts: PlanOptions = { env: ctx, scope, platforms, overwrite };
    if (operation === 'install') return planInstall(catalog!, selection as string[], planOpts);
    if (operation === 'update') return planUpdate(catalog!, selection, planOpts);
    return planUninstall(selection, planOpts);
  };

  let plan = await build(false);
  if (scope === 'project') {
    const gitRoot = await findGitRoot(ctx.cwd);
    if (gitRoot && gitRoot !== ctx.cwd) {
      plan.warnings.push(
        `Current directory is not the repository root (${gitRoot}); clients may not read project files from here.`,
      );
    }
  }
  const st = styleOf(ctx);
  if (operation !== 'uninstall' && !opts.dryRun) {
    const blocked = await unwritable(scope, platforms, ctx);
    if (blocked.length > 0) {
      ctx.err(`Not writable: ${blocked.join(', ')}. Nothing was changed.`);
      ctx.err(
        'Fix the permissions or choose the other scope; AgentForge never asks for elevation.',
      );
      return EXIT.ERROR;
    }
  }
  if (env) ctx.out(heading('Preview', st));
  formatPlan(plan, location, opts.verbose, st).forEach((l) => ctx.out(l));
  ctx.out(previewCounts(plan, st));

  const prompter = promptFor(ctx, opts);
  if (plan.conflicts.length > 0) {
    const blocking = plan.conflicts.filter((c) => !c.overridable);
    if (blocking.length > 0 || opts.dryRun || !prompter) {
      ctx.err(
        blocking.length > 0
          ? 'Blocked: symbolic links or non-files are never overwritten. Nothing was changed.'
          : 'Conflicts found. Nothing was changed. Resolve them manually or run interactively to overwrite.',
      );
      return EXIT.CONFLICT;
    }
    const ok = await prompter.confirm(
      `Overwrite ${plan.conflicts.length} conflicting file(s)? Originals are kept in ${stateDir}.`,
      false,
    );
    if (!ok) {
      ctx.err('Cancelled. Nothing was changed.');
      return EXIT.CANCELLED;
    }
    plan = await build(true);
    if (plan.conflicts.length > 0) {
      ctx.err('Files changed while planning. Nothing was changed; run again.');
      return EXIT.CONFLICT;
    }
  }

  if (!hasChanges(plan)) {
    ctx.out('Nothing to do.');
    return EXIT.OK;
  }
  if (opts.dryRun) {
    ctx.out('Dry run: no changes were made.');
    return EXIT.OK;
  }
  if (!opts.yes) {
    if (!prompter)
      throw new UsageError('Use --yes to apply without prompting, or --dry-run to preview');
    if (!(await prompter.confirm('Apply these changes?', true))) {
      ctx.err('Cancelled. Nothing was changed.');
      return EXIT.CANCELLED;
    }
  }

  const mutating = plan.actions.filter((a) => MUTATING.has(a.kind));
  const changes = mutating.length;
  ctx.out(st.dim(`Applying ${changes} change(s) atomically...`));
  const progress = createProgress(ctx.terminal, st);
  let result;
  try {
    result = await applyPlan(plan, {
      beforeStep: (i) => {
        const a = mutating[i];
        if (a) progress.update(i, changes, `${a.kind} ${a.componentId}: ${a.relativePath}`);
      },
    });
    progress.update(changes, changes, 'manifest');
  } catch (e) {
    progress.stop();
    ctx.err(
      `${symbolsFor(ctx.terminal?.unicode ?? false).fail} Failed; every change was rolled back.`,
    );
    throw e;
  }
  progress.stop();
  ctx.out(st.green(`Done: ${result.written} file(s) written, ${result.removed} removed.`));
  if (result.preservedDir) ctx.out(`Overwritten originals saved in ${result.preservedDir}`);
  if (operation !== 'uninstall') {
    const done = plan.components.map((c) => `${c.id} (${ADAPTERS[c.platform].displayName})`);
    if (done.length > 0) ctx.out(`Installed: ${[...new Set(done)].join(', ')}`);
  }
  if (env) summary(ctx, plan, scope).forEach((l) => ctx.out(l));
  if (operation !== 'uninstall') nextSteps(plan, scope).forEach((l) => ctx.out(l));
  return EXIT.OK;
}
