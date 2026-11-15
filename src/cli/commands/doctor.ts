import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { ADAPTERS } from '../../adapters/index.js';
import type { InstallScope } from '../../core/types.js';
import { readJournal } from '../../installer/apply.js';
import { inspectPath } from '../../installer/fs-safe.js';
import { locationDir, managedFilePath, readState, stateDirFor } from '../../installer/state.js';
import { discoverCatalog } from '../../registry/index.js';
import {
  EXIT,
  resolveClients,
  styleOf,
  UsageError,
  type CliContext,
  type Options,
} from '../context.js';

type Level = 'ok' | 'warn' | 'fail';

/** Claude Code modes that override a subagent's permissionMode (sub-agents docs). */
const OVERRIDING_MODES = new Set(['bypassPermissions', 'acceptEdits', 'auto']);

function claudeSettingsFiles(scope: InstallScope, ctx: CliContext): string[] {
  return scope === 'global'
    ? [path.join(ctx.homeDir, '.claude', 'settings.json')]
    : ['settings.json', 'settings.local.json'].map((f) => path.join(ctx.cwd, '.claude', f));
}

/** Reads only permissions.defaultMode; never writes settings. */
async function readDefaultMode(file: string): Promise<string | undefined> {
  try {
    const json = JSON.parse(await readFile(file, 'utf8')) as {
      permissions?: { defaultMode?: unknown };
    };
    const mode = json.permissions?.defaultMode;
    return typeof mode === 'string' ? mode : undefined;
  } catch {
    return undefined;
  }
}

const exists = (p: string) =>
  stat(p).then(
    () => true,
    () => false,
  );

/** Read-only diagnostics. Never writes, never runs client binaries. */
export async function runDoctor(
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
  const results: Array<[Level, string]> = [];
  const add = (level: Level, msg: string) => results.push([level, msg]);

  const major = Number(process.versions.node.split('.')[0]);
  add(major >= 22 ? 'ok' : 'fail', `Node.js ${process.versions.node} (requires >= 22)`);

  const catalog = await discoverCatalog(catalogRoot);
  const errors = catalog.issues.filter((i) => i.severity === 'error').length;
  add(
    errors ? 'fail' : 'ok',
    `Catalog ${catalogRoot}: ${catalog.entries.length} component(s), ${errors} error(s)`,
  );

  if (platforms.includes('claude-code')) {
    if (ctx.env.CLAUDE_CONFIG_DIR) {
      add(
        'warn',
        'CLAUDE_CONFIG_DIR is set, but Claude Code docs do not say it relocates agents/skills; AgentForge installs to ~/.claude',
      );
    }
    const home = path.join(ctx.homeDir, '.claude');
    add(
      (await exists(home)) ? 'ok' : 'warn',
      `Claude Code user dir ${home}${(await exists(home)) ? '' : ' not found (is Claude Code installed?)'}`,
    );
  }
  if (platforms.includes('codex')) {
    const codexHome = ctx.env.CODEX_HOME || path.join(ctx.homeDir, '.codex');
    const found = await exists(codexHome);
    if (ctx.env.CODEX_HOME && !found)
      add('fail', `CODEX_HOME=${codexHome} does not exist (Codex requires it to exist)`);
    else
      add(
        found ? 'ok' : 'warn',
        `Codex home ${codexHome}${found ? '' : ' not found (is Codex installed?)'}`,
      );
  }

  for (const scope of scopes) {
    const stateDir = stateDirFor(scope, ctx);
    let state;
    try {
      if (await readJournal(stateDir)) {
        add(
          'fail',
          `${scope}: interrupted operation pending in ${stateDir}; run install, update or uninstall to roll it back`,
        );
      }
      state = await readState(stateDir);
    } catch (e) {
      add('fail', `${scope}: ${(e as Error).message}`);
      continue;
    }
    const comps = state.components.filter((c) => platforms.includes(c.platform));
    add('ok', `${scope}: ${comps.length} managed component(s) (state: ${stateDir})`);
    if (opts.verbose) {
      for (const p of platforms) {
        for (const loc of ['skills', 'agents'] as const) {
          add(
            'ok',
            `${scope}: ${ADAPTERS[p].displayName} ${loc} -> ${locationDir(p, loc, scope, ctx)}`,
          );
        }
      }
    }
    for (const c of comps) {
      const label = `${scope}: ${ADAPTERS[c.platform].displayName} / ${c.id}@${c.version}`;
      const counts = { missing: 0, modified: 0, unsafe: 0 };
      for (const f of c.files) {
        const { root, abs } = managedFilePath(c.platform, f, scope, ctx);
        const s = await inspectPath(root, abs);
        if (s.kind === 'missing') counts.missing++;
        else if (s.kind !== 'file') counts.unsafe++;
        else if (s.sha256 !== f.sha256) counts.modified++;
      }
      if (counts.unsafe)
        add('fail', `${label}: ${counts.unsafe} file(s) replaced by links or directories`);
      if (counts.missing)
        add('warn', `${label}: ${counts.missing} file(s) missing (run update to restore)`);
      if (counts.modified)
        add('warn', `${label}: ${counts.modified} file(s) modified locally (preserved by update)`);
      if (!counts.unsafe && !counts.missing && !counts.modified && opts.verbose)
        add('ok', `${label}: intact`);
    }
    if (comps.some((c) => c.platform === 'claude-code' && c.kind === 'agent')) {
      for (const file of claudeSettingsFiles(scope, ctx)) {
        const mode = await readDefaultMode(file);
        if (mode && OVERRIDING_MODES.has(mode)) {
          add(
            'warn',
            `${scope}: ${file} sets defaultMode "${mode}", which overrides the agents' plan mode (read-only then relies on tools and instructions)`,
          );
        }
      }
    }
    if (comps.some((c) => c.platform === 'codex' && c.kind === 'agent')) {
      add(
        'warn',
        `${scope}: Codex agents cannot enforce read-only; use sandbox_mode = "read-only" for audits`,
      );
      if (scope === 'project') {
        add(
          'warn',
          'project: Codex loads project config only for trusted projects; trust this project in Codex',
        );
      }
    }
  }

  const st = styleOf(ctx);
  const icon: Record<Level, string> = {
    ok: st.green('OK  '),
    warn: st.yellow('WARN'),
    fail: st.red('FAIL'),
  };
  for (const [level, msg] of results)
    (level === 'fail' ? ctx.err : ctx.out)(`${icon[level]} ${msg}`);
  return results.some(([l]) => l === 'fail') ? EXIT.ERROR : EXIT.OK;
}
