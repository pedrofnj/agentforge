import { existsSync } from 'node:fs';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { orphanedSkills } from '../../src/cli/commands/wizard.js';
import {
  canWrite,
  detectEnvironment,
  findExecutable,
  nearestExisting,
} from '../../src/cli/environment.js';
import { fakePrompter, makeSandbox, snapshot, type Sandbox } from '../helpers.js';

let sbx: Sandbox;
beforeEach(async () => {
  sbx = await makeSandbox();
});

/** Uses the bundled catalog (five agents, six skills). */
const claudeAgent = (id: string) => path.join(sbx.project, '.claude', 'agents', `${id}.md`);
const claudeSkill = (id: string) => path.join(sbx.project, '.claude', 'skills', id, 'SKILL.md');

async function install(...args: string[]) {
  return sbx.cli(['install', '--provider', 'claude', '--scope', 'project', '--yes', ...args]);
}

describe('install wizard', () => {
  it('shows the banner and environment, then asks client, scope, agents and extra skills', async () => {
    const prompter = fakePrompter([
      'claude',
      'project',
      ['code-quality-reviewer'],
      ['authentication-audit'],
      true,
    ]);
    const r = await sbx.cli(['install'], { interactive: true, prompter });
    expect(r.code, r.err).toBe(0);
    expect(prompter.asked).toEqual([
      'Which client do you want to configure?',
      'Install globally or in the current project?',
      'Which agents do you want to install?',
      'Add standalone skills? (optional, enter to skip)',
      'Apply these changes?',
    ]);
    expect(r.out).toContain('AgentForge v');
    expect(r.out).toMatch(/Node\.js\s+\d+\.\d+/);
    expect(r.out).toMatch(/Claude Code\s+.*not detected/);
    expect(r.out).toContain(
      'Skills included automatically: evidence-reporting, repository-discovery, secure-code-review (3)',
    );
    expect(r.out).toMatch(/Files: \d+ new, 0 updated/);
    expect(r.out).toMatch(/Installed 1 agent\(s\) and 4 skill\(s\)/);
    expect(r.out).toContain('Next steps:');
    expect(existsSync(claudeAgent('code-quality-reviewer'))).toBe(true);
    expect(existsSync(claudeSkill('authentication-audit'))).toBe(true);
    expect(existsSync(claudeSkill('authorization-audit'))).toBe(false);
  });

  it('cancelling at the confirmation changes nothing', async () => {
    const before = await snapshot(sbx.root);
    const prompter = fakePrompter(['codex', 'global', ['appsec-auditor'], [], false]);
    const r = await sbx.cli(['install'], { interactive: true, prompter });
    expect(r.code, r.err).toBe(4);
    expect(await snapshot(sbx.root)).toEqual(before);
  });

  it('skips questions already answered by flags', async () => {
    const prompter = fakePrompter([['performance-auditor'], [], true]);
    const r = await sbx.cli(['install', '--provider', 'codex', '--scope', 'project'], {
      interactive: true,
      prompter,
    });
    expect(r.code, r.err).toBe(0);
    expect(prompter.asked[0]).toBe('Which agents do you want to install?');
    expect(existsSync(path.join(sbx.project, '.codex', 'agents', 'performance-auditor.toml'))).toBe(
      true,
    );
  });

  it('installs standalone skills without any agent', async () => {
    const prompter = fakePrompter(['claude', 'project', [], ['review-planning'], true]);
    const r = await sbx.cli(['install'], { interactive: true, prompter });
    expect(r.code, r.err).toBe(0);
    expect(prompter.asked[3]).toBe('Which skills do you want to install?');
    expect(existsSync(claudeSkill('review-planning'))).toBe(true);
    expect(existsSync(path.join(sbx.project, '.claude', 'agents'))).toBe(false);
  });

  it('never prompts without a terminal', async () => {
    const r = await sbx.cli(['install']);
    expect(r.code).toBe(2);
    expect(r.err).toContain('--provider');
    expect(r.out).not.toContain('AgentForge v');
  });

  it('repeated installs report nothing to do and partial installs extend the state', async () => {
    expect((await install('repository-discovery')).code).toBe(0);
    expect((await install('repository-discovery')).out).toContain('Nothing to do.');
    const r = await install('performance-auditor');
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/repository-discovery@0\.3\.0\s+unchanged/);
    const status = JSON.parse((await sbx.cli(['status', '--project', '--json'])).out) as {
      scopes: Array<{ components: Array<{ id: string }> }>;
    };
    expect(status.scopes[0]!.components.map((c) => c.id).sort()).toEqual([
      'evidence-reporting',
      'performance-auditor',
      'repository-discovery',
    ]);
  });
});

describe('uninstall wizard', () => {
  beforeEach(async () => {
    expect((await install('appsec-auditor', 'code-quality-reviewer')).code).toBe(0);
  });

  it('removes skills only the removed agent used and keeps shared ones', async () => {
    const prompter = fakePrompter(['project', ['appsec-auditor'], true, true]);
    const r = await sbx.cli(['uninstall', '--provider', 'claude'], {
      interactive: true,
      prompter,
    });
    expect(r.code, r.err).toBe(0);
    expect(prompter.asked).toEqual([
      'Uninstall from which scope?',
      'Which components do you want to uninstall?',
      'Also remove 2 skill(s) no other installed agent uses (authentication-audit, authorization-audit)?',
      'Apply these changes?',
    ]);
    expect(r.out).toContain(
      'Keeping skill secure-code-review: still required by code-quality-reviewer',
    );
    expect(existsSync(claudeAgent('appsec-auditor'))).toBe(false);
    expect(existsSync(claudeSkill('authentication-audit'))).toBe(false);
    expect(existsSync(claudeSkill('secure-code-review'))).toBe(true);
    expect(existsSync(claudeAgent('code-quality-reviewer'))).toBe(true);
  });

  it('declining the orphan cleanup removes only the agent', async () => {
    const prompter = fakePrompter([['appsec-auditor'], false, true]);
    const r = await sbx.cli(['uninstall', '--scope', 'project'], { interactive: true, prompter });
    expect(r.code, r.err).toBe(0);
    expect(existsSync(claudeSkill('authentication-audit'))).toBe(true);
  });

  it('--all --dry-run previews without changing anything; --all --yes removes everything', async () => {
    const before = await snapshot(sbx.root);
    const dry = await sbx.cli(['uninstall', '--scope', 'project', '--all', '--dry-run']);
    expect(dry.code).toBe(0);
    expect(dry.out).toMatch(/Files: 0 new, 0 updated, \d+ removed/);
    expect(await snapshot(sbx.root)).toEqual(before);
    const r = await sbx.cli(['uninstall', '--scope', 'project', '--all', '--yes']);
    expect(r.code, r.err).toBe(0);
    expect(existsSync(claudeAgent('appsec-auditor')), r.out).toBe(false);
  });

  it('keeps files the user modified', async () => {
    await writeFile(claudeAgent('appsec-auditor'), 'my edits');
    const r = await sbx.cli(['uninstall', '--scope', 'project', '--all', '--yes']);
    expect(r.code).toBe(0);
    expect(await readFile(claudeAgent('appsec-auditor'), 'utf8')).toBe('my edits');
  });

  it('uninstalls per client', async () => {
    expect(
      (
        await sbx.cli([
          'install',
          '--provider',
          'codex',
          '--scope',
          'project',
          '--yes',
          'appsec-auditor',
        ])
      ).code,
    ).toBe(0);
    const r = await sbx.cli([
      'uninstall',
      '--provider',
      'codex',
      '--scope',
      'project',
      '--all',
      '--yes',
    ]);
    expect(r.code).toBe(0);
    expect(existsSync(path.join(sbx.project, '.codex', 'agents', 'appsec-auditor.toml'))).toBe(
      false,
    );
    expect(existsSync(claudeAgent('appsec-auditor'))).toBe(true);
  });

  it('orphan analysis only counts installed skills', () => {
    const c = (id: string, kind: 'agent' | 'skill', requires: string[] = []) => ({
      platform: 'claude-code' as const,
      id,
      kind,
      version: '1.0.0',
      requires,
      files: [],
    });
    const installed = [
      c('a', 'agent', ['s1', 's2', 'gone']),
      c('b', 'agent', ['s2']),
      c('s1', 'skill'),
      c('s2', 'skill'),
    ];
    expect(orphanedSkills(installed, new Set(['a']))).toEqual({
      orphaned: ['s1'],
      kept: [{ id: 's2', by: ['b'] }],
    });
  });
});

describe('status, list and doctor', () => {
  it('status reports versions, integrity and available updates (text and JSON)', async () => {
    expect((await install('performance-auditor')).code).toBe(0);
    const statePath = path.join(sbx.project, '.agentforge', 'manifest.json');
    const state = JSON.parse(await readFile(statePath, 'utf8')) as {
      components: Array<{ id: string; version: string }>;
    };
    state.components.find((c) => c.id === 'performance-auditor')!.version = '0.0.1';
    await writeFile(statePath, JSON.stringify(state));
    await writeFile(claudeSkill('evidence-reporting'), 'edited');

    const text = await sbx.cli(['status', '--scope', 'project']);
    expect(text.code).toBe(0);
    expect(text.out).toMatch(/performance-auditor@0\.0\.1 -> 0\.3\.0\s+update available/);
    expect(text.out).toMatch(/evidence-reporting@\S+\s+modified locally/);
    expect(text.out).toContain('1 update(s) available: agentforge update --project --dry-run');

    const json = JSON.parse((await sbx.cli(['status', '--json'])).out) as {
      scopes: Array<{ scope: string; components: Array<Record<string, unknown>> }>;
    };
    expect(json.scopes.map((s) => s.scope)).toEqual(['global', 'project']);
    const perf = json.scopes[1]!.components.find((c) => c.id === 'performance-auditor')!;
    expect(perf).toMatchObject({
      updateAvailable: true,
      availableVersion: '0.3.0',
      state: 'update-available',
    });
  });

  it('status fails when managed files are missing', async () => {
    expect((await install('repository-discovery')).code).toBe(0);
    await writeFile(claudeSkill('repository-discovery'), '');
    const { rm } = await import('node:fs/promises');
    await rm(claudeSkill('repository-discovery'));
    const r = await sbx.cli(['status', '--project']);
    expect(r.code).toBe(1);
    expect(r.out).toContain('files missing');
  });

  it('list shows where components are installed; --json is machine-readable', async () => {
    expect((await install('repository-discovery')).code).toBe(0);
    const r = await sbx.cli(['list', '--type', 'skill']);
    expect(r.out).toMatch(/repository-discovery@\S+.*installed: project/);
    const json = JSON.parse((await sbx.cli(['list', '--json'])).out) as {
      components: Array<{ id: string; installed: unknown[] }>;
    };
    expect(json.components).toHaveLength(11);
    expect(json.components.find((c) => c.id === 'repository-discovery')!.installed).toEqual([
      { scope: 'project', platform: 'claude-code', version: '0.3.0' },
    ]);
  });

  it('doctor --json reports checks, including invalid client settings', async () => {
    await mkdir(path.join(sbx.project, '.claude'), { recursive: true });
    await writeFile(path.join(sbx.project, '.claude', 'settings.json'), '{ broken');
    const r = await sbx.cli(['doctor', '--project', '--json']);
    const report = JSON.parse(r.out) as {
      ok: boolean;
      checks: Array<{ level: string; message: string }>;
    };
    expect(report.ok).toBe(true);
    expect(
      report.checks.some((c) => c.level === 'warn' && c.message.includes('not valid JSON')),
    ).toBe(true);
    expect(report.checks.some((c) => c.message.includes('executable not found on PATH'))).toBe(
      true,
    );
  });

  it('doctor flags components that are no longer in the catalog', async () => {
    expect((await install('repository-discovery')).code).toBe(0);
    const statePath = path.join(sbx.project, '.agentforge', 'manifest.json');
    const state = await readFile(statePath, 'utf8');
    await writeFile(statePath, state.replaceAll('"repository-discovery"', '"retired-skill"'));
    const r = await sbx.cli(['doctor', '--project']);
    expect(r.out).toContain('retired-skill is not in this catalog');
  });
});

describe('flag aliases', () => {
  it('--provider and --scope behave like --client and --global/--project', async () => {
    const r = await sbx.cli([
      'install',
      '--provider',
      'both',
      '--scope',
      'global',
      'repository-discovery',
      '--yes',
    ]);
    expect(r.code, r.err).toBe(0);
    expect(
      existsSync(path.join(sbx.home, '.claude', 'skills', 'repository-discovery', 'SKILL.md')),
    ).toBe(true);
    expect(
      existsSync(path.join(sbx.home, '.agents', 'skills', 'repository-discovery', 'SKILL.md')),
    ).toBe(true);
  });

  it.each([
    [['install', '--scope', 'everywhere'], '--scope must be one of'],
    [['install', '--scope', 'project', '--global'], 'either --scope or --global/--project'],
    [['install', '--client', 'claude', '--provider', 'codex'], 'either --client or --provider'],
    [['list', '--provider', 'claude'], 'not supported by "list"'],
  ])('%j is a usage error', async (argv, message) => {
    const r = await sbx.cli(argv);
    expect(r.code).toBe(2);
    expect(r.err).toContain(message);
  });

  it('help documents the new command and examples', async () => {
    expect((await sbx.cli(['help'])).out).toContain('status');
    expect((await sbx.cli(['help', 'install'])).out).toContain(
      '--provider claude --scope project --all --yes',
    );
    expect((await sbx.cli(['help', 'uninstall'])).out).toContain('--scope project --all --yes');
  });
});

describe('environment detection', () => {
  it('finds executables on PATH without running them (POSIX and Windows rules)', async () => {
    const bin = path.join(sbx.root, 'bin');
    await mkdir(bin);
    await writeFile(path.join(bin, 'claude.cmd'), '@echo off\nexit 99\n');
    expect(await findExecutable('claude', { PATH: bin, PATHEXT: '.EXE;.CMD' }, 'win32')).toBe(
      path.join(bin, 'claude.cmd'),
    );
    expect(await findExecutable('codex', { PATH: bin }, 'win32')).toBeUndefined();
    if (process.platform !== 'win32') {
      const exe = path.join(bin, 'codex');
      await writeFile(exe, '#!/bin/sh\nexit 99\n');
      expect(await findExecutable('codex', { PATH: bin }, 'linux')).toBeUndefined();
      await chmod(exe, 0o755);
      expect(await findExecutable('codex', { PATH: `/nonexistent:${bin}` }, 'linux')).toBe(exe);
    }
  });

  it('checks writability on the nearest existing ancestor', async () => {
    const deep = path.join(sbx.project, 'a', 'b', 'c');
    expect(await nearestExisting(deep)).toBe(sbx.project);
    expect(await canWrite(deep)).toBe(true);
  });

  it('reports clients, installs and the repository root', async () => {
    await mkdir(path.join(sbx.home, '.codex'));
    expect((await install('repository-discovery')).code).toBe(0);
    const env = await detectEnvironment({
      homeDir: sbx.home,
      cwd: sbx.project,
      env: { ...sbx.env, PATH: '' },
      osPlatform: process.platform,
    });
    expect(env.node.supported).toBe(true);
    expect(env.gitRoot).toBe(sbx.project);
    expect(env.clients.codex).toMatchObject({ detected: true, configDirExists: true });
    expect(env.clients['claude-code'].detected).toBe(false);
    expect(env.scopes.project.components['claude-code']).toBe(1);
    expect(env.scopes.global.components['claude-code']).toBe(0);
  });
});
