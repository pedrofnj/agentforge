import { ADAPTERS } from '../../adapters/index.js';
import { PLATFORMS, type InstallScope, type Platform } from '../../core/types.js';
import type { ManagedComponent } from '../../installer/state.js';
import { locationDir } from '../../installer/state.js';
import { dependenciesOf, resolveSelection, type Catalog } from '../../registry/index.js';
import { CLIENTS, styleOf, type CliContext } from '../context.js';
import { unwritable, type DetectedEnvironment } from '../environment.js';
import { packageVersion } from '../meta.js';
import type { Choice, Prompter } from '../prompt.js';
import { symbolsFor } from '../tui/symbols.js';
import { banner, heading, rows } from '../tui/ui.js';

const unicodeOf = (ctx: CliContext) => ctx.terminal?.unicode ?? false;

/** Banner and environment summary at the start of an interactive session. */
export function printWelcome(ctx: CliContext, env: DetectedEnvironment): void {
  const st = styleOf(ctx);
  const sym = symbolsFor(unicodeOf(ctx));
  banner(packageVersion(), st, unicodeOf(ctx)).forEach((l) => ctx.out(l));
  ctx.out(heading('Environment', st));
  const client = (p: Platform) => {
    const c = env.clients[p];
    if (c.executable) return `${st.green(`${sym.ok} found`)} ${st.dim(c.executable)}`;
    if (c.configDirExists)
      return `${st.green(`${sym.ok} config found`)} ${st.dim(`${c.configDir} (not on PATH)`)}`;
    return `${st.yellow(`${sym.warn} not detected`)} ${st.dim('(files can still be installed)')}`;
  };
  const installed = (s: InstallScope) => {
    const info = env.scopes[s];
    if (info.error) return st.red(`${sym.fail} unreadable state: ${info.error}`);
    const n = PLATFORMS.reduce((sum, p) => sum + info.components[p], 0);
    const pending = info.pendingJournal ? st.yellow(' (interrupted operation pending)') : '';
    return `${n === 0 ? 'nothing installed' : `${n} component(s) installed`}${pending}`;
  };
  rows(
    [
      ['System', env.os],
      [
        'Node.js',
        env.node.supported
          ? `${env.node.version}`
          : st.red(`${env.node.version} (requires 22 or newer)`),
      ],
      ['Directory', `${env.cwd}${env.gitRoot === env.cwd ? st.dim(' (repository root)') : ''}`],
      ['Claude Code', client('claude-code')],
      ['Codex', client('codex')],
      ['Global', installed('global')],
      ['Project', installed('project')],
    ],
    st,
  ).forEach((l) => ctx.out(l));
  ctx.out('');
}

/** Client question with detection hints; the detected client is highlighted first. */
export function askClients(env: DetectedEnvironment) {
  return async (prompter: Prompter): Promise<Platform[]> => {
    const hint = (p: Platform) => {
      const c = env.clients[p];
      if (c.executable) return `Detected: ${c.executable}`;
      if (c.configDirExists) return `Detected config: ${c.configDir}`;
      return 'Not detected on this machine; files can still be installed.';
    };
    const detected = PLATFORMS.filter((p) => env.clients[p].detected);
    const initial = detected.length === 2 ? 'both' : detected[0] === 'codex' ? 'codex' : 'claude';
    const choice = await prompter.select(
      'Which client do you want to configure?',
      [
        { value: 'claude', label: 'Claude Code', hint: hint('claude-code') },
        { value: 'codex', label: 'Codex', hint: hint('codex') },
        { value: 'both', label: 'Both', hint: 'Install the same components for both clients.' },
      ],
      { initial },
    );
    return CLIENTS[choice]!;
  };
}

/** Scope question with the real target paths; unwritable scopes cannot be picked. */
export function askScope(
  ctx: CliContext,
  platforms: readonly Platform[],
  verb: 'Install' | 'Uninstall',
  env?: DetectedEnvironment,
) {
  return async (prompter: Prompter): Promise<InstallScope> => {
    const paths = (scope: InstallScope) =>
      platforms
        .flatMap((p) =>
          (['skills', 'agents'] as const).map((loc) => locationDir(p, loc, scope, ctx)),
        )
        .filter((d, i, all) => all.indexOf(d) === i)
        .join(', ');
    const choices: Choice<InstallScope>[] = [];
    for (const scope of ['project', 'global'] as const) {
      const blocked = verb === 'Install' ? await unwritable(scope, platforms, ctx) : [];
      const homeProject = scope === 'project' && env?.cwdIsHome;
      choices.push({
        value: scope,
        label:
          scope === 'project'
            ? `Project  ${ctx.cwd}`
            : `Global   all projects of this user (${ctx.homeDir})`,
        hint: `Writes to: ${paths(scope)}`,
        ...(homeProject
          ? { disabled: 'current directory is the home directory' }
          : blocked.length > 0
            ? { disabled: `not writable: ${blocked[0]}` }
            : {}),
      });
    }
    return prompter.select(
      verb === 'Install'
        ? 'Install globally or in the current project?'
        : 'Uninstall from which scope?',
      choices,
    );
  };
}

/**
 * Agent selection (skills are resolved from the agents), then optional
 * standalone skills. Returns component ids.
 */
export async function askComponents(
  ctx: CliContext,
  prompter: Prompter,
  catalog: Catalog,
  platforms: readonly Platform[],
  installed: readonly ManagedComponent[],
): Promise<string[]> {
  const st = styleOf(ctx);
  const sym = symbolsFor(unicodeOf(ctx));
  const available = catalog.entries.filter((e) =>
    e.manifest.targets.some((t) => platforms.includes(t)),
  );
  const isInstalled = (id: string) => installed.some((c) => c.id === id);
  const label = (id: string, name: string | undefined, version: string) => {
    const current = installed.find((c) => c.id === id);
    const state = current
      ? current.version === version
        ? ' (installed)'
        : ` (installed ${current.version}, ${version} available)`
      : '';
    return `${name ?? id}${state}`;
  };
  const agents = available.filter((e) => e.manifest.kind === 'agent');
  if (agents.length > 0) {
    const picked = await prompter.multiselect(
      'Which agents do you want to install?',
      agents.map((e) => {
        const m = e.manifest;
        const skills = dependenciesOf(m);
        return {
          value: m.id,
          label: label(m.id, m.name, m.version),
          hint: `${m.description}${skills.length > 0 ? ` Skills: ${skills.join(', ')}.` : ''}`,
        };
      }),
    );
    const resolved = resolveSelection(catalog, picked)
      .filter((e) => e.manifest.kind === 'skill')
      .map((e) => e.manifest.id);
    if (resolved.length > 0) {
      ctx.out(
        `${st.teal(sym.info)} Skills included automatically: ${resolved.join(', ')} ${st.dim(`(${resolved.length})`)}`,
      );
    }
    const extra = available.filter(
      (e) => e.manifest.kind === 'skill' && !resolved.includes(e.manifest.id),
    );
    if (extra.length > 0) {
      const more = await prompter.multiselect(
        'Add standalone skills? (optional, enter to skip)',
        extra.map((e) => ({
          value: e.manifest.id,
          label: label(e.manifest.id, e.manifest.name, e.manifest.version),
          hint: e.manifest.description,
        })),
        { required: false },
      );
      return [...picked, ...more];
    }
    return picked;
  }
  return prompter.multiselect(
    'Which components do you want to install?',
    available.map((e) => ({
      value: e.manifest.id,
      label: `${e.manifest.id} (${e.manifest.kind})${isInstalled(e.manifest.id) ? ' (installed)' : ''}`,
      hint: e.manifest.description,
    })),
  );
}

/** Skills that only the removed components needed (nothing remaining requires them). */
export function orphanedSkills(
  installed: readonly ManagedComponent[],
  removing: ReadonlySet<string>,
): { orphaned: string[]; kept: Array<{ id: string; by: string[] }> } {
  const remaining = installed.filter((c) => !removing.has(c.id));
  const wanted = new Set(
    installed.filter((c) => removing.has(c.id)).flatMap((c) => c.requires ?? []),
  );
  const orphaned: string[] = [];
  const kept: Array<{ id: string; by: string[] }> = [];
  for (const id of [...wanted].sort()) {
    if (removing.has(id) || !installed.some((c) => c.id === id && c.kind === 'skill')) continue;
    const by = [
      ...new Set(remaining.filter((c) => (c.requires ?? []).includes(id)).map((c) => c.id)),
    ];
    if (by.length > 0) kept.push({ id, by });
    else orphaned.push(id);
  }
  return { orphaned, kept };
}

/** Interactive uninstall selection: components, then skills nobody needs any more. */
export async function askUninstall(
  ctx: CliContext,
  prompter: Prompter,
  installed: readonly ManagedComponent[],
): Promise<string[] | 'all'> {
  const st = styleOf(ctx);
  const sym = symbolsFor(unicodeOf(ctx));
  const unique = [...new Map(installed.map((c) => [c.id, c])).values()].sort((a, b) =>
    a.kind === b.kind ? a.id.localeCompare(b.id) : a.kind === 'agent' ? -1 : 1,
  );
  const where = (id: string) =>
    installed
      .filter((c) => c.id === id)
      .map((c) => ADAPTERS[c.platform].displayName)
      .join(', ');
  const picked = await prompter.multiselect(
    'Which components do you want to uninstall?',
    unique.map((c) => ({
      value: c.id,
      label: `${c.id} (${c.kind} ${c.version})`,
      hint: `Installed for ${where(c.id)}${c.requires?.length ? `. Uses skills: ${c.requires.join(', ')}.` : ''}`,
    })),
  );
  if (picked.length === unique.length) return 'all';
  const { orphaned, kept } = orphanedSkills(installed, new Set(picked));
  for (const k of kept) {
    ctx.out(`${st.teal(sym.info)} Keeping skill ${k.id}: still required by ${k.by.join(', ')}`);
  }
  if (orphaned.length > 0) {
    const also = await prompter.confirm(
      `Also remove ${orphaned.length} skill(s) no other installed agent uses (${orphaned.join(', ')})?`,
      true,
    );
    if (also) return [...picked, ...orphaned];
  }
  return picked;
}
