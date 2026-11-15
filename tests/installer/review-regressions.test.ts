import { existsSync } from 'node:fs';
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyPlan, StaleStateError } from '../../src/installer/apply.js';
import { planInstall, planUninstall } from '../../src/installer/plan.js';
import { readState } from '../../src/installer/state.js';
import { planUpdate } from '../../src/updater/index.js';
import { discoverCatalog } from '../../src/registry/index.js';
import { copyFixtures, FIXTURE_ROOT, makeSandbox } from '../helpers.js';

/** Regressions for issues found in review of PR #1. */

describe('crafted journals are never trusted', () => {
  it('a journal pointing outside the state backups or client dirs is refused, nothing deleted', async () => {
    const sbx = await makeSandbox();
    const victim = path.join(sbx.root, 'victim');
    await mkdir(victim, { recursive: true });
    await writeFile(path.join(victim, 'keep.txt'), 'keep me');
    const stateDir = path.join(sbx.project, '.agentforge');
    await mkdir(stateDir, { recursive: true });
    // As a malicious checkout could ship it: dead pid, arbitrary txDir.
    await writeFile(
      path.join(stateDir, 'journal.json'),
      JSON.stringify({
        pid: 999999,
        status: 'preparing',
        txDir: victim,
        previousState: null,
        steps: [],
      }),
    );
    const r = await sbx.cli([
      'install',
      '--client',
      'claude',
      '--project',
      '--all',
      '--yes',
      '--catalog',
      FIXTURE_ROOT,
    ]);
    expect(r.code).toBe(1);
    expect(r.err).toContain('failed validation');
    expect(await readFile(path.join(victim, 'keep.txt'), 'utf8')).toBe('keep me');
  });

  it('a journal step outside the client locations is refused, the target is untouched', async () => {
    const sbx = await makeSandbox();
    const outside = path.join(sbx.root, 'outside');
    await mkdir(outside, { recursive: true });
    await writeFile(path.join(outside, 'x.txt'), 'original');
    const stateDir = path.join(sbx.project, '.agentforge');
    await mkdir(path.join(stateDir, 'backups', 'tx'), { recursive: true });
    await writeFile(path.join(stateDir, 'backups', 'tx', '0'), 'attacker');
    await writeFile(
      path.join(stateDir, 'journal.json'),
      JSON.stringify({
        pid: 999999,
        status: 'applying',
        txDir: path.join(stateDir, 'backups', 'tx'),
        previousState: null,
        steps: [
          {
            kind: 'remove',
            root: outside,
            path: path.join(outside, 'x.txt'),
            backup: path.join(stateDir, 'backups', 'tx', '0'),
            createdDirs: [],
          },
        ],
      }),
    );
    const r = await sbx.cli(['uninstall', '--project', '--all', '--yes']);
    expect(r.code).toBe(1);
    expect(await readFile(path.join(outside, 'x.txt'), 'utf8')).toBe('original');
  });
});

describe('edits made after planning are preserved', () => {
  const opts = (ctx: ReturnType<Awaited<ReturnType<typeof makeSandbox>>['ctx']>) => ({
    env: ctx,
    scope: 'project' as const,
    platforms: ['claude-code'] as const,
  });

  it('uninstall does not delete a file edited between plan and apply', async () => {
    const sbx = await makeSandbox();
    await sbx.cli([
      'install',
      '--client',
      'claude',
      '--project',
      '--all',
      '--yes',
      '--catalog',
      FIXTURE_ROOT,
    ]);
    const agent = path.join(sbx.project, '.claude', 'agents', 'sample-reviewer.md');
    const plan = await planUninstall('all', { ...opts(sbx.ctx()), platforms: ['claude-code'] });
    await writeFile(agent, 'edited while the prompt was open');
    await expect(applyPlan(plan)).rejects.toBeInstanceOf(StaleStateError);
    expect(await readFile(agent, 'utf8')).toBe('edited while the prompt was open');
    expect((await readState(path.join(sbx.project, '.agentforge'))).components).toHaveLength(2);
  });

  it('update does not overwrite a file edited between plan and apply', async () => {
    const sbx = await makeSandbox();
    await sbx.cli([
      'install',
      '--client',
      'claude',
      '--project',
      '--all',
      '--yes',
      '--catalog',
      FIXTURE_ROOT,
    ]);
    const cat = await copyFixtures();
    const mp = path.join(cat, 'agents', 'sample-reviewer', 'manifest.json');
    const m = JSON.parse(await readFile(mp, 'utf8'));
    m.version = '9.0.0';
    await writeFile(mp, JSON.stringify(m));
    await writeFile(
      path.join(cat, 'agents', 'sample-reviewer', 'instructions.md'),
      (await readFile(path.join(cat, 'agents', 'sample-reviewer', 'instructions.md'), 'utf8')) +
        '\nv9\n',
    );
    const plan = await planUpdate(await discoverCatalog(cat), 'all', {
      ...opts(sbx.ctx()),
      platforms: ['claude-code'],
    });
    const agent = path.join(sbx.project, '.claude', 'agents', 'sample-reviewer.md');
    await writeFile(agent, 'my edit');
    await expect(applyPlan(plan)).rejects.toBeInstanceOf(StaleStateError);
    expect(await readFile(agent, 'utf8')).toBe('my edit');
  });

  it('an edit made after backups were taken survives the rollback', async () => {
    const sbx = await makeSandbox();
    await sbx.cli([
      'install',
      '--client',
      'claude',
      '--project',
      '--all',
      '--yes',
      '--catalog',
      FIXTURE_ROOT,
    ]);
    const agent = path.join(sbx.project, '.claude', 'agents', 'sample-reviewer.md');
    const skill = path.join(sbx.project, '.claude', 'skills', 'sample-skill', 'SKILL.md');
    const plan = await planUninstall('all', { ...opts(sbx.ctx()), platforms: ['claude-code'] });
    const order = plan.actions.filter((a) => a.kind === 'remove').map((a) => a.absPath);
    const last = order[order.length - 1]!;
    await expect(
      applyPlan(plan, {
        beforeStep: async (i) => {
          if (i === order.length - 1) await writeFile(last, 'late edit');
        },
      }),
    ).rejects.toBeInstanceOf(StaleStateError);
    expect(await readFile(last, 'utf8')).toBe('late edit');
    // Files removed earlier in the transaction are restored.
    for (const f of [agent, skill].filter((x) => x !== last)) expect(existsSync(f)).toBe(true);
  });
});

describe('stale plans', () => {
  it('a plan built before another operation finished is rejected and the manifest stays complete', async () => {
    const sbx = await makeSandbox();
    const catalog = await discoverCatalog(FIXTURE_ROOT);
    const env = sbx.ctx();
    const codexPlan = await planInstall(catalog, ['sample-reviewer'], {
      env,
      scope: 'project',
      platforms: ['codex'],
    });
    const claudePlan = await planInstall(catalog, ['sample-reviewer'], {
      env,
      scope: 'project',
      platforms: ['claude-code'],
    });
    await applyPlan(codexPlan);
    await expect(applyPlan(claudePlan)).rejects.toBeInstanceOf(StaleStateError);
    const state = await readState(path.join(sbx.project, '.agentforge'));
    expect(state.components.every((c) => c.platform === 'codex')).toBe(true);
    expect(existsSync(path.join(sbx.project, '.agentforge', 'journal.json'))).toBe(false);
  });
});

describe('home directory reached through a link', () => {
  it('--project from a linked path to the home dir is still refused', async () => {
    const sbx = await makeSandbox();
    const link = path.join(sbx.root, 'home-link');
    await symlink(sbx.home, link, process.platform === 'win32' ? 'junction' : 'dir');
    const r = await sbx.cli(
      ['install', '--client', 'claude', '--project', '--all', '--yes', '--catalog', FIXTURE_ROOT],
      { cwd: link },
    );
    expect(r.code).toBe(2);
    expect(r.err).toContain('home directory');
  });
});
