import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { applyPlan, readJournal, recover } from '../../src/installer/apply.js';
import { planInstall } from '../../src/installer/plan.js';
import { locationDir, readState, stateDirFor } from '../../src/installer/state.js';
import { discoverCatalog } from '../../src/registry/index.js';
import { planUpdate } from '../../src/updater/index.js';
import {
  copyFixtures,
  fakePrompter,
  FIXTURE_ROOT,
  linkDir,
  makeSandbox,
  snapshot,
  tryLinkFile,
  type Sandbox,
} from '../helpers.js';

const CAT = ['--catalog', FIXTURE_ROOT];
let sbx: Sandbox;
beforeEach(async () => {
  sbx = await makeSandbox();
});

const read = (p: string) => readFile(p, 'utf8');
const claudeProject = () => ({
  skill: path.join(sbx.project, '.claude', 'skills', 'sample-skill', 'SKILL.md'),
  ref: path.join(sbx.project, '.claude', 'skills', 'sample-skill', 'references', 'checklist.md'),
  agent: path.join(sbx.project, '.claude', 'agents', 'sample-reviewer.md'),
});
const codexProject = () => ({
  skill: path.join(sbx.project, '.agents', 'skills', 'sample-skill', 'SKILL.md'),
  agent: path.join(sbx.project, '.codex', 'agents', 'sample-reviewer.toml'),
});
const installAll = (scope: '--project' | '--global', client = 'both', extra: string[] = []) =>
  sbx.cli(['install', '--client', client, scope, '--all', '--yes', ...CAT, ...extra]);

describe('install', () => {
  it('global: writes to documented user dirs and keeps state outside client dirs', async () => {
    const r = await installAll('--global');
    expect(r.code, r.err).toBe(0);
    for (const p of [
      ['.claude', 'skills', 'sample-skill', 'SKILL.md'],
      ['.claude', 'skills', 'sample-skill', 'references', 'example-stack.md'],
      ['.claude', 'agents', 'sample-reviewer.md'],
      ['.agents', 'skills', 'sample-skill', 'SKILL.md'],
      ['.codex', 'agents', 'sample-reviewer.toml'],
    ]) {
      expect(existsSync(path.join(sbx.home, ...p)), p.join('/')).toBe(true);
    }
    const stateDir = stateDirFor('global', sbx.ctx());
    expect(stateDir.startsWith(sbx.root)).toBe(true);
    expect((await readState(stateDir)).components).toHaveLength(4);
    expect(Object.keys(await snapshot(sbx.project))).toEqual(['.git']); // project untouched
  });

  it('project: installs one client only, with a git-ignored state dir', async () => {
    const r = await installAll('--project', 'claude');
    expect(r.code, r.err).toBe(0);
    const files = claudeProject();
    expect(existsSync(files.skill) && existsSync(files.agent)).toBe(true);
    expect(existsSync(codexProject().agent)).toBe(false);
    expect(await read(path.join(sbx.project, '.agentforge', '.gitignore'))).toContain(
      'journal.json',
    );
    const state = await readState(path.join(sbx.project, '.agentforge'));
    expect(state.components.map((c) => `${c.platform}/${c.id}`)).toEqual([
      'claude-code/sample-reviewer',
      'claude-code/sample-skill',
    ]);
    // Paths in the manifest are relative to the client dir, never absolute.
    expect(JSON.stringify(state)).not.toContain(sbx.root.replace(/\\/g, '\\\\'));
    expect(Object.keys(await snapshot(sbx.home))).toEqual([]);
  });

  it('both clients: each gets its native format', async () => {
    expect((await installAll('--project')).code).toBe(0);
    expect(await read(claudeProject().agent)).toMatch(/^---\nname: "sample-reviewer"/);
    expect(await read(codexProject().agent)).toMatch(/^name = "sample-reviewer"/);
  });

  it('installing an agent pulls in its skill dependency', async () => {
    const r = await sbx.cli([
      'install',
      'sample-reviewer',
      '--client',
      'codex',
      '--project',
      '--yes',
      ...CAT,
    ]);
    expect(r.code, r.err).toBe(0);
    expect(existsSync(codexProject().skill)).toBe(true);
  });

  it('repeated install is a no-op without duplicates', async () => {
    await installAll('--project');
    const before = await snapshot(sbx.project);
    const r = await installAll('--project');
    expect(r.code).toBe(0);
    expect(r.out).toContain('Nothing to do.');
    expect(await snapshot(sbx.project)).toEqual(before);
    expect((await readState(path.join(sbx.project, '.agentforge'))).components).toHaveLength(4);
  });

  it('unknown component ids are a usage error', async () => {
    const r = await sbx.cli([
      'install',
      'nope',
      '--client',
      'claude',
      '--project',
      '--yes',
      ...CAT,
    ]);
    expect(r.code).toBe(2);
    expect(r.err).toContain('Unknown component(s): nope');
  });
});

describe('conflicts', () => {
  it('never overwrites an unmanaged file with --yes; nothing is written at all', async () => {
    const { agent } = claudeProject();
    await mkdir(path.dirname(agent), { recursive: true });
    await writeFile(agent, 'my own agent');
    const r = await installAll('--project', 'claude');
    expect(r.code).toBe(3);
    expect(r.out).toContain('file exists and was not installed by AgentForge');
    expect(await read(agent)).toBe('my own agent');
    expect(existsSync(claudeProject().skill)).toBe(false); // all-or-nothing
    expect(existsSync(path.join(sbx.project, '.agentforge', 'manifest.json'))).toBe(false);
  });

  it('flags locally modified managed files on reinstall', async () => {
    await installAll('--project', 'claude');
    await writeFile(claudeProject().agent, 'edited');
    const r = await installAll('--project', 'claude');
    expect(r.code).toBe(3);
    expect(r.out).toContain('modified after installation');
    expect(await read(claudeProject().agent)).toBe('edited');
  });

  it('overwrites only with interactive consent and preserves the original', async () => {
    const { agent } = claudeProject();
    await mkdir(path.dirname(agent), { recursive: true });
    await writeFile(agent, 'my own agent');
    const prompter = fakePrompter([true, true]); // overwrite?, apply?
    const r = await sbx.cli(['install', '--client', 'claude', '--project', '--all', ...CAT], {
      interactive: true,
      prompter,
    });
    expect(r.code, r.err).toBe(0);
    expect(await read(agent)).toContain('name: "sample-reviewer"');
    const preserved = Object.entries(
      await snapshot(path.join(sbx.project, '.agentforge', 'overwritten')),
    );
    expect(
      preserved.some(([p, c]) => p.endsWith('sample-reviewer.md') && c === 'my own agent'),
    ).toBe(true);
  });

  it('declining the overwrite changes nothing', async () => {
    const { agent } = claudeProject();
    await mkdir(path.dirname(agent), { recursive: true });
    await writeFile(agent, 'mine');
    const r = await sbx.cli(['install', '--client', 'claude', '--project', '--all', ...CAT], {
      interactive: true,
      prompter: fakePrompter([false]),
    });
    expect(r.code).toBe(4);
    expect(await read(agent)).toBe('mine');
  });
});

describe('update', () => {
  async function bumpCatalog(): Promise<string> {
    const cat = await copyFixtures();
    const manifestPath = path.join(cat, 'skills', 'sample-skill', 'manifest.json');
    const m = JSON.parse(await read(manifestPath));
    m.version = '1.1.0';
    m.references = m.references.slice(0, 1); // drop example-stack.md
    await writeFile(manifestPath, JSON.stringify(m));
    await writeFile(
      path.join(cat, 'skills', 'sample-skill', 'instructions.md'),
      '# Sample skill v2\n',
    );
    const agentPath = path.join(cat, 'agents', 'sample-reviewer', 'manifest.json');
    const a = JSON.parse(await read(agentPath));
    a.version = '1.1.0';
    await writeFile(agentPath, JSON.stringify(a));
    await writeFile(
      path.join(cat, 'agents', 'sample-reviewer', 'instructions.md'),
      '# Reviewer v2\n',
    );
    return cat;
  }

  it('updates unmodified files, preserves local edits and removes stale files', async () => {
    await installAll('--project', 'claude');
    const files = claudeProject();
    await writeFile(files.agent, 'customized by user');
    const stale = path.join(path.dirname(files.ref), 'example-stack.md');
    expect(existsSync(stale)).toBe(true);

    const cat = await bumpCatalog();
    const r = await sbx.cli([
      'update',
      '--client',
      'claude',
      '--project',
      '--yes',
      '--catalog',
      cat,
    ]);
    expect(r.code, r.err).toBe(0);
    expect(r.out).toMatch(/sample-skill@1\.0\.0 -> 1\.1\.0/);
    expect(await read(files.skill)).toContain('# Sample skill v2');
    expect(await read(files.agent)).toBe('customized by user');
    expect(existsSync(stale)).toBe(false);
    const state = await readState(path.join(sbx.project, '.agentforge'));
    expect(state.components.every((c) => c.version === '1.1.0')).toBe(true);

    // The edit stays preserved on later updates too.
    expect((await sbx.cli(['update', '--project', '--yes', '--catalog', cat])).code).toBe(0);
    expect(await read(files.agent)).toBe('customized by user');
  });

  it('restores missing files and never downgrades', async () => {
    const cat = await bumpCatalog();
    await sbx.cli([
      'install',
      '--client',
      'claude',
      '--project',
      '--all',
      '--yes',
      '--catalog',
      cat,
    ]);
    await rm(claudeProject().skill);
    const r = await sbx.cli(['update', '--project', '--yes', ...CAT]); // catalog is older (1.0.0)
    expect(r.out).toContain('is newer than catalog 1.0.0; skipped');
    expect(existsSync(claudeProject().skill)).toBe(false);
    const r2 = await sbx.cli(['update', '--project', '--yes', '--catalog', cat]);
    expect(r2.code).toBe(0);
    expect(existsSync(claudeProject().skill)).toBe(true);
  });
});

describe('uninstall', () => {
  it('removes only unmodified managed files and keeps user content', async () => {
    await installAll('--project');
    await writeFile(codexProject().agent, 'edited by user');
    const userSkill = path.join(sbx.project, '.claude', 'skills', 'my-skill', 'SKILL.md');
    await mkdir(path.dirname(userSkill), { recursive: true });
    await writeFile(userSkill, 'user skill');

    const dry = await sbx.cli(['uninstall', '--project', '--all', '--dry-run']);
    expect(dry.code).toBe(0);
    expect(existsSync(claudeProject().skill)).toBe(true);

    const r = await sbx.cli(['uninstall', '--project', '--all', '--yes']);
    expect(r.code, r.err).toBe(0);
    expect(existsSync(claudeProject().skill)).toBe(false);
    expect(existsSync(path.join(sbx.project, '.claude', 'skills', 'sample-skill'))).toBe(false); // pruned
    expect(await read(codexProject().agent)).toBe('edited by user');
    expect(await read(userSkill)).toBe('user skill');
    expect((await readState(path.join(sbx.project, '.agentforge'))).components).toEqual([]);
  });

  it('can target one client and reports ids that are not installed', async () => {
    await installAll('--project');
    const r = await sbx.cli([
      'uninstall',
      'sample-skill',
      'ghost',
      '--client',
      'codex',
      '--project',
      '--yes',
    ]);
    expect(r.code).toBe(0);
    expect(r.out).toContain('ghost: not installed in this scope');
    expect(existsSync(codexProject().skill)).toBe(false);
    expect(existsSync(claudeProject().skill)).toBe(true);
  });
});

describe('malicious input', () => {
  it('rejects a tampered manifest that points outside the client dirs', async () => {
    await installAll('--project', 'claude');
    const victim = path.join(sbx.root, 'victim.txt');
    await writeFile(victim, 'keep me');
    const manifestPath = path.join(sbx.project, '.agentforge', 'manifest.json');
    const state = JSON.parse(await read(manifestPath));
    state.components[0].files[0].path = '../../../victim.txt';
    await writeFile(manifestPath, JSON.stringify(state));
    const r = await sbx.cli(['uninstall', '--project', '--all', '--yes']);
    expect(r.code).toBe(1);
    expect(r.err).toContain('must not contain ".."');
    expect(await read(victim)).toBe('keep me');
  });

  it('rejects absolute paths in the manifest', async () => {
    await installAll('--project', 'claude');
    const manifestPath = path.join(sbx.project, '.agentforge', 'manifest.json');
    const state = JSON.parse(await read(manifestPath));
    state.components[0].files[0].path = path.join(sbx.root, 'x');
    await writeFile(manifestPath, JSON.stringify(state));
    expect((await sbx.cli(['uninstall', '--project', '--all', '--yes'])).code).toBe(1);
  });

  it('refuses catalogs with reference paths escaping the component', async () => {
    const cat = await copyFixtures();
    const p = path.join(cat, 'skills', 'sample-skill', 'manifest.json');
    const m = JSON.parse(await read(p));
    m.references[0].path = '../../../../evil.md';
    await writeFile(p, JSON.stringify(m));
    const r = await sbx.cli([
      'install',
      '--client',
      'claude',
      '--project',
      '--all',
      '--yes',
      '--catalog',
      cat,
    ]);
    expect(r.code).toBe(1);
    expect(r.err).toContain('Catalog has');
  });
});

describe('symbolic links', () => {
  it('blocks installing through a linked directory inside a client dir', async () => {
    const outside = path.join(sbx.root, 'outside');
    await mkdir(outside, { recursive: true });
    await linkDir(outside, path.join(sbx.project, '.claude', 'skills', 'sample-skill'));
    const r = await installAll('--project', 'claude');
    expect(r.code).toBe(3);
    expect(r.out).toContain('symbolic link');
    expect(await snapshot(outside)).toEqual({});
    expect(existsSync(claudeProject().agent)).toBe(false);
  });

  it('blocks a linked file even with interactive consent', async (t) => {
    const target = path.join(sbx.root, 'target.md');
    await writeFile(target, 'outside');
    if (!(await tryLinkFile(target, claudeProject().agent))) return t.skip();
    const r = await sbx.cli(['install', '--client', 'claude', '--project', '--all', ...CAT], {
      interactive: true,
      prompter: fakePrompter([]),
    });
    expect(r.code).toBe(3);
    expect(await read(target)).toBe('outside');
  });

  it('allows a linked client root (user-managed dotfiles)', async () => {
    const real = path.join(sbx.root, 'dotfiles-claude');
    await mkdir(real, { recursive: true });
    await linkDir(real, path.join(sbx.project, '.claude', 'skills'));
    const r = await installAll('--project', 'claude');
    expect(r.code, r.out + r.err).toBe(0);
    expect(existsSync(path.join(real, 'sample-skill', 'SKILL.md'))).toBe(true);
  });
});

describe('interrupted operations', () => {
  const opts = () => ({
    env: sbx.ctx(),
    scope: 'project' as const,
    platforms: ['claude-code', 'codex'] as const,
  });

  it('a failure mid-apply rolls back everything', async () => {
    const plan = await planInstall(await discoverCatalog(FIXTURE_ROOT), ['sample-reviewer'], {
      ...opts(),
      platforms: ['claude-code', 'codex'],
    });
    await expect(
      applyPlan(plan, {
        beforeStep: (i) => {
          if (i === 3) throw new Error('disk full');
        },
      }),
    ).rejects.toThrow('disk full');
    expect(await snapshot(sbx.project)).toEqual({
      '.agentforge': '<dir>',
      '.agentforge/.gitignore': expect.any(String),
      '.git': '<dir>',
    });
  });

  it('a crash leaves a journal that the next run rolls back, then installs cleanly', async () => {
    const plan = await planInstall(await discoverCatalog(FIXTURE_ROOT), ['sample-reviewer'], {
      ...opts(),
      platforms: ['claude-code', 'codex'],
    });
    await expect(
      applyPlan(plan, {
        rollbackOnError: false,
        beforeStep: (i) => {
          if (i === 2) throw new Error('killed');
        },
      }),
    ).rejects.toThrow('killed');
    const stateDir = path.join(sbx.project, '.agentforge');
    expect(await readJournal(stateDir)).not.toBeNull();
    expect(existsSync(claudeProject().skill)).toBe(true); // partially applied

    expect((await sbx.cli(['doctor', '--project', ...CAT])).err).toContain('interrupted operation');
    const dry = await sbx.cli([
      'install',
      '--client',
      'both',
      '--project',
      '--all',
      '--dry-run',
      ...CAT,
    ]);
    expect(dry.err).toContain('interrupted operation is pending');

    const r = await installAll('--project');
    expect(r.code, r.err).toBe(0);
    expect(r.out).toContain('Rolled back an interrupted operation.');
    expect(await readJournal(stateDir)).toBeNull();
    expect((await readState(stateDir)).components).toHaveLength(4);
  });

  it('rolling back an interrupted update restores previous content and manifest', async () => {
    await installAll('--project', 'claude');
    const stateDir = path.join(sbx.project, '.agentforge');
    const before = await snapshot(sbx.project);
    const cat = await copyFixtures();
    const mp = path.join(cat, 'skills', 'sample-skill', 'manifest.json');
    const m = JSON.parse(await read(mp));
    m.version = '2.0.0';
    await writeFile(mp, JSON.stringify(m));
    await writeFile(path.join(cat, 'skills', 'sample-skill', 'instructions.md'), 'v2\n');
    const plan = await planUpdate(await discoverCatalog(cat), 'all', {
      ...opts(),
      platforms: ['claude-code'],
    });
    await expect(
      applyPlan(plan, {
        rollbackOnError: false,
        beforeStep: () => Promise.reject(new Error('killed')),
      }),
    ).rejects.toThrow();
    const roots = (['skills', 'agents'] as const).map((l) =>
      locationDir('claude-code', l, 'project', sbx.ctx()),
    );
    expect(await recover(stateDir, roots)).toBe(true);
    expect(await snapshot(sbx.project)).toEqual(before);
  });

  it('refuses to run while another live process holds the journal', async () => {
    const stateDir = path.join(sbx.project, '.agentforge');
    await mkdir(stateDir, { recursive: true });
    await writeFile(
      path.join(stateDir, 'journal.json'),
      JSON.stringify({
        pid: process.ppid,
        status: 'applying',
        steps: [],
        txDir: path.join(stateDir, 'backups', 'b'),
        previousState: null,
      }),
    );
    const r = await installAll('--project');
    expect(r.code).toBe(1);
    expect(r.err).toContain('Another AgentForge operation');
  });
});

describe('dry-run and non-interactive mode', () => {
  it('dry-run changes nothing anywhere', async () => {
    const before = await snapshot(sbx.root);
    const r = await installAll('--project', 'both', ['--dry-run', '--verbose']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('Dry run: no changes were made.');
    expect(r.out).toMatch(/create\s+.*sample-reviewer\.toml/);
    expect(await snapshot(sbx.root)).toEqual(before);
  });

  it.each([
    [['install', '--project', '--all', '--yes'], '--client'],
    [['install', '--client', 'claude', '--all', '--yes'], '--global or --project'],
    [['install', '--client', 'claude', '--project', '--yes'], 'component ids or --all'],
    [['install', '--client', 'claude', '--project', '--all'], 'Use --yes'],
    [['install', '--client', 'cursor', '--project'], '--client must be one of'],
    [['install', '--global', '--project', '--client', 'claude'], 'either --global or --project'],
    [['uninstall', '--project', '--yes'], 'component ids or --all'],
    [['list', '--yes'], 'not supported by "list"'],
    [['install', 'x', '--all', '--client', 'claude', '--project'], 'not both'],
  ])('%j fails with a usage error', async (argv, message) => {
    const before = await snapshot(sbx.root);
    const r = await sbx.cli([
      ...argv,
      ...CAT.filter(() => argv[0] !== 'uninstall' && argv[0] !== 'list'),
    ]);
    expect(r.code).toBe(2);
    expect(r.err).toContain(message);
    expect(await snapshot(sbx.root)).toEqual(before);
  });

  it('asks for client, scope and components on a terminal', async () => {
    const prompter = fakePrompter(['codex', 'project', ['sample-reviewer'], true]);
    const r = await sbx.cli(['install', ...CAT], { interactive: true, prompter });
    expect(r.code, r.err).toBe(0);
    expect(prompter.asked).toEqual([
      'Which client do you want to configure?',
      'Install globally or in the current project?',
      'Which components do you want to install?',
      'Apply these changes?',
    ]);
    expect(existsSync(codexProject().agent) && existsSync(codexProject().skill)).toBe(true);
  });
});

/** Strict parser for the TOML subset the Codex adapter emits; throws on anything else. */
function parseAgentToml(text: string): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === '') continue;
    const m = /^([a-z_]+(?:\.[a-z_]+)?) = (.*)$/.exec(line);
    if (!m) throw new Error(`Unexpected TOML line: ${line}`);
    const [, key, value] = m as unknown as [string, string, string];
    if (key in out) throw new Error(`Duplicate key ${key}`);
    if (value === "'''") {
      const end = lines.indexOf("'''", i + 1);
      if (end < 0) throw new Error('Unterminated multi-line string');
      out[key] = `${lines.slice(i + 1, end).join('\n')}\n`;
      i = end;
    } else if (value === 'true' || value === 'false') out[key] = value === 'true';
    else out[key] = JSON.parse(value) as string;
  }
  return out;
}

function parseFrontmatter(text: string): Record<string, string> {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!m) throw new Error('Missing frontmatter');
  return Object.fromEntries(
    m[1]!.split('\n').map((l) => {
      const [k, ...rest] = l.split(': ');
      const v = rest.join(': ');
      return [k!, v.startsWith('"') ? (JSON.parse(v) as string) : v];
    }),
  );
}

describe('generated formats', () => {
  it('Claude Code: SKILL.md and agent frontmatter use documented fields only', async () => {
    await installAll('--project', 'claude');
    expect(parseFrontmatter(await read(claudeProject().skill))).toEqual({
      name: 'sample-skill',
      description: 'Fixture skill used by tests.',
    });
    expect(parseFrontmatter(await read(claudeProject().agent))).toEqual({
      name: 'sample-reviewer',
      description: 'Fixture read-only reviewer used by tests.',
      tools: 'Read, Grep, Glob, Bash, Skill',
      permissionMode: 'plan',
      model: 'sonnet',
    });
  });

  it('Codex: SKILL.md and agent TOML use documented keys only', async () => {
    await installAll('--project', 'codex');
    expect(Object.keys(parseFrontmatter(await read(codexProject().skill)))).toEqual([
      'name',
      'description',
    ]);
    const toml = parseAgentToml(await read(codexProject().agent));
    expect(Object.keys(toml).sort()).toEqual(
      ['description', 'developer_instructions', 'model_reasoning_effort', 'name'].sort(),
    );
    expect(toml.developer_instructions).toContain('Read-only');
  });
});

describe('doctor', () => {
  it('is healthy after install and reports drift without failing', async () => {
    await installAll('--project');
    expect((await sbx.cli(['doctor', '--project', ...CAT])).code).toBe(0);
    await writeFile(claudeProject().agent, 'edited');
    await rm(codexProject().skill);
    const r = await sbx.cli(['doctor', '--project', ...CAT]);
    expect(r.code).toBe(0);
    expect(r.out).toContain('modified locally');
    expect(r.out).toContain('missing (run update to restore)');
    expect(r.out).toContain('sandbox_mode');
  });

  it('fails when CODEX_HOME points to a missing dir and warns about CLAUDE_CONFIG_DIR', async () => {
    const r = await sbx.cli(['doctor', '--global', ...CAT], {
      env: { ...sbx.env, CODEX_HOME: path.join(sbx.root, 'nope'), CLAUDE_CONFIG_DIR: sbx.root },
    });
    expect(r.code).toBe(1);
    expect(r.err).toContain('CODEX_HOME');
    expect(r.out).toContain('CLAUDE_CONFIG_DIR');
  });

  it('fails on a corrupt state manifest', async () => {
    await mkdir(path.join(sbx.project, '.agentforge'), { recursive: true });
    await writeFile(path.join(sbx.project, '.agentforge', 'manifest.json'), '{oops');
    const r = await sbx.cli(['doctor', '--project', ...CAT]);
    expect(r.code).toBe(1);
    expect(r.err).toContain('invalid JSON');
  });
});
