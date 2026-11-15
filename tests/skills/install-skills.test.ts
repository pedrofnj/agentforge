import { existsSync } from 'node:fs';
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { readState } from '../../src/installer/state.js';
import { checkRenderedFile } from '../../src/validator/rendered.js';
import { makeSandbox, snapshot, type Sandbox } from '../helpers.js';

/** End-to-end installs of the bundled skills (default catalog, no --catalog). */

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const ALL = [
  'authentication-audit',
  'authorization-audit',
  'evidence-reporting',
  'repository-discovery',
  'review-planning',
  'secure-code-review',
];
let sbx: Sandbox;
beforeEach(async () => {
  sbx = await makeSandbox();
});

async function copyCatalog(): Promise<string> {
  const dest = await mkdtemp(path.join(tmpdir(), 'agentforge-skills-'));
  await cp(path.join(ROOT, 'skills'), path.join(dest, 'skills'), { recursive: true });
  return dest;
}

describe('installing the universal skills', () => {
  it('Claude Code, global: all skills with references, valid files', async () => {
    const r = await sbx.cli(['install', '--client', 'claude', '--global', '--all', '--yes']);
    expect(r.code, r.err).toBe(0);
    for (const id of ALL) {
      const md = path.join(sbx.home, '.claude', 'skills', id, 'SKILL.md');
      const content = await readFile(md, 'utf8');
      expect(
        checkRenderedFile('claude-code', {
          location: 'skills',
          relativePath: `${id}/SKILL.md`,
          content,
        }).errors,
      ).toEqual([]);
    }
    expect(
      existsSync(
        path.join(
          sbx.home,
          '.claude',
          'skills',
          'authentication-audit',
          'references',
          'token-validation.md',
        ),
      ),
    ).toBe(true);
    expect(Object.keys(await snapshot(sbx.project))).toEqual(['.git']);
  });

  it('Codex, project: only the selected skill and its declared dependencies', async () => {
    const r = await sbx.cli([
      'install',
      'authorization-audit',
      '--client',
      'codex',
      '--project',
      '--yes',
    ]);
    expect(r.code, r.err).toBe(0);
    const installed = Object.keys(await snapshot(path.join(sbx.project, '.agents', 'skills')))
      .filter((p) => !p.includes('/'))
      .sort();
    expect(installed).toEqual([
      'authorization-audit',
      'evidence-reporting',
      'repository-discovery',
    ]);
    const state = await readState(path.join(sbx.project, '.agentforge'));
    expect(state.components.find((c) => c.id === 'authorization-audit')?.requires).toEqual([
      'repository-discovery',
      'evidence-reporting',
    ]);
  });

  it('both clients, repeated install is a no-op', async () => {
    await sbx.cli(['install', '--client', 'both', '--project', '--all', '--yes']);
    const before = await snapshot(sbx.project);
    const r = await sbx.cli(['install', '--client', 'both', '--project', '--all', '--yes']);
    expect(r.out).toContain('Nothing to do.');
    expect(await snapshot(sbx.project)).toEqual(before);
  });

  it('update keeps a customized SKILL.md and updates the rest', async () => {
    const catalog = await copyCatalog();
    await sbx.cli([
      'install',
      'secure-code-review',
      '--client',
      'claude',
      '--project',
      '--yes',
      '--catalog',
      catalog,
    ]);
    const skillDir = path.join(sbx.project, '.claude', 'skills', 'secure-code-review');
    const custom = `${await readFile(path.join(skillDir, 'SKILL.md'), 'utf8')}\n## Team notes\n- Also check our audit log.\n`;
    await writeFile(path.join(skillDir, 'SKILL.md'), custom);

    const src = path.join(catalog, 'skills', 'security', 'secure-code-review');
    const manifest = JSON.parse(await readFile(path.join(src, 'manifest.json'), 'utf8'));
    manifest.version = '9.9.9';
    await writeFile(path.join(src, 'manifest.json'), JSON.stringify(manifest));
    await writeFile(
      path.join(src, 'references', 'configuration-review.md'),
      '# Configuration review v2\n',
    );

    const r = await sbx.cli(['update', '--project', '--yes', '--catalog', catalog]);
    expect(r.code, r.err).toBe(0);
    expect(await readFile(path.join(skillDir, 'SKILL.md'), 'utf8')).toBe(custom);
    expect(
      await readFile(path.join(skillDir, 'references', 'configuration-review.md'), 'utf8'),
    ).toBe('# Configuration review v2\n');
  });

  it('uninstalling a dependency warns about skills that still require it', async () => {
    await sbx.cli(['install', 'secure-code-review', '--client', 'claude', '--project', '--yes']);
    const r = await sbx.cli(['uninstall', 'evidence-reporting', '--project', '--dry-run']);
    expect(r.out).toContain('secure-code-review (claude-code) requires evidence-reporting');
  });
});

describe('cli integration', () => {
  it('list filters by type and domain', async () => {
    const r = await sbx.cli(['list', '--type', 'skill', '--domain', 'appsec']);
    expect(r.code).toBe(0);
    expect(r.out.split('\n')).toHaveLength(3);
    expect(r.out).not.toContain('evidence-reporting@');
    expect((await sbx.cli(['list', '--type', 'plugin'])).code).toBe(2);
  });

  it('validate checks the bundled skills and their generated files', async () => {
    expect(await sbx.cli(['validate'])).toMatchObject({
      code: 0,
      out: '11 component(s) checked, 0 error(s), 0 warning(s).',
    });
  });

  it('stats reports measured sizes and labels token estimates', async () => {
    const r = await sbx.cli(['stats']);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/Always loaded \(discovery\): \d+ chars \(~\d+ tokens est\.\)/);
    expect(r.out).toContain('estimates (chars/4)');
    const json = JSON.parse((await sbx.cli(['stats', '--json'])).out);
    expect(json.skills).toHaveLength(6);
  });

  it('doctor stays healthy with the bundled catalog', async () => {
    await sbx.cli(['install', '--client', 'both', '--project', '--all', '--yes']);
    expect((await sbx.cli(['doctor', '--project'])).code).toBe(0);
  });
});
