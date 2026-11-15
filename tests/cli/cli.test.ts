import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { compareVersions } from '../../src/updater/index.js';
import { FIXTURE_ROOT, makeCatalog, makeSandbox, validSkill, type Sandbox } from '../helpers.js';

let sbx: Sandbox;
beforeEach(async () => {
  sbx = await makeSandbox();
});

describe('cli basics', () => {
  it('prints help, command help and version', async () => {
    expect((await sbx.cli([])).out).toContain('Commands:');
    const help = await sbx.cli(['help', 'install']);
    expect(help.out).toContain('--client <claude|codex|both>');
    expect((await sbx.cli(['uninstall', '--help'])).out).not.toContain('--catalog');
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
    expect(await sbx.cli(['version'])).toMatchObject({ code: 0, out: pkg.version });
    expect(await sbx.cli(['--version'])).toMatchObject({ code: 0, out: pkg.version });
  });

  it('lists components from manifests with estimated cost and dependencies', async () => {
    const r = await sbx.cli(['list', '--catalog', FIXTURE_ROOT, '--verbose']);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(
      /skill\s+sample-skill@1\.0\.0\s+\[claude-code, codex\]\s+~\d+ tokens \(estimated\)/,
    );
    expect(r.out).toContain('needs: sample-skill');
    expect(r.out).toContain('Sample skill: Fixture skill used by tests.');
  });

  it('validates catalogs', async () => {
    expect(await sbx.cli(['validate', '--catalog', FIXTURE_ROOT])).toMatchObject({
      code: 0,
      out: '2 component(s) checked, 0 error(s), 0 warning(s).',
    });
    const root = await makeCatalog({
      'skills/demo-skill/manifest.json': {
        ...validSkill,
        references: [{ path: 'references/missing.md', description: 'd' }],
      },
      'skills/demo-skill/instructions.md': '# Demo\n',
    });
    const r = await sbx.cli(['validate', '--catalog', root]);
    expect(r.code).toBe(1);
    expect(r.err).toContain('ERROR skills/demo-skill [load-failed]');
  });

  it('rejects unknown commands and options', async () => {
    expect((await sbx.cli(['deploy'])).code).toBe(2);
    expect((await sbx.cli(['list', '--bogus'])).code).toBe(2);
    expect((await sbx.cli(['version', 'extra'])).code).toBe(2);
  });

  it('the bundled catalog is empty but valid', async () => {
    expect(await sbx.cli(['validate'])).toMatchObject({ code: 0 });
  });
});

describe('compareVersions', () => {
  it.each([
    ['1.0.0', '1.0.0', 0],
    ['1.0.1', '1.0.0', 1],
    ['1.10.0', '1.9.0', 1],
    ['1.0.0-beta.2', '1.0.0', -1],
    ['1.0.0-beta.10', '1.0.0-beta.2', 1],
    ['1.0.0+build', '1.0.0', 0],
  ])('%s vs %s -> %i', (a, b, expected) => {
    expect(compareVersions(a, b)).toBe(expected);
  });
});
