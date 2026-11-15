import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertSafeRelativePath, PathSafetyError } from '../../src/core/paths.js';
import { parseState } from '../../src/installer/state.js';
import { validateManifest } from '../../src/validator/index.js';
import { FIXTURE_ROOT, makeSandbox, validSkill } from '../helpers.js';

/** Regression tests for issues found in the Phase 6 installer audit. */
describe('Windows path handling', () => {
  it.each([
    'references/a.md:stream', // NTFS alternate data stream
    'references/CON',
    'references/nul.md',
    'references/com1.txt',
    'references/lpt9',
    'references/trailing.',
    'references/trailing ',
    'a//b.md',
    'references/',
    'a\tb.md',
    'what?.md',
    'pipe|name.md',
  ])('rejects %j', (p) => {
    expect(() => assertSafeRelativePath(p)).toThrow(PathSafetyError);
  });

  it.each(['references/console.md', 'references/con-tips.md', 'a/./b.md', 'v1.2/notes.md'])(
    'still accepts %j',
    (p) => {
      expect(() => assertSafeRelativePath(p)).not.toThrow();
    },
  );

  it('a tampered state file with an alternate data stream path is refused', () => {
    const state = {
      schemaVersion: 1,
      components: [
        {
          platform: 'codex',
          id: 'x',
          kind: 'skill',
          version: '1.0.0',
          files: [{ location: 'skills', path: 'x/SKILL.md:hidden', sha256: 'a'.repeat(64) }],
        },
      ],
    };
    expect(() => parseState(JSON.stringify(state), 'manifest.json')).toThrow(/not portable/);
  });

  it('references differing only by case are duplicates', () => {
    const r = validateManifest({
      ...validSkill,
      references: [
        { path: 'references/Guide.md', description: 'a' },
        { path: 'references/guide.md', description: 'b' },
      ],
    });
    expect(r.issues.map((i) => i.code)).toContain('duplicate');
  });
});

describe('global and project scopes cannot overlap', () => {
  it('refuses --project in the home directory (it would write to global locations)', async () => {
    const sbx = await makeSandbox();
    const r = await sbx.cli(
      ['install', '--client', 'both', '--project', '--all', '--yes', '--catalog', FIXTURE_ROOT],
      { cwd: sbx.home },
    );
    expect(r.code).toBe(2);
    expect(r.err).toContain('home directory');
  });

  it('a global install and a project install elsewhere keep separate manifests', async () => {
    const sbx = await makeSandbox();
    const args = ['--client', 'claude', '--all', '--yes', '--catalog', FIXTURE_ROOT];
    expect((await sbx.cli(['install', '--global', ...args])).code).toBe(0);
    expect((await sbx.cli(['install', '--project', ...args])).code).toBe(0);
    expect((await sbx.cli(['uninstall', '--project', '--all', '--yes'])).code).toBe(0);
    // The global copy is untouched by the project uninstall.
    const globalAgent = path.join(sbx.home, '.claude', 'agents', 'sample-reviewer.md');
    expect(await readFile(globalAgent, 'utf8')).toContain('name: "sample-reviewer"');
  });
});

describe('integrity', () => {
  it('doctor detects a managed file replaced after install', async () => {
    const sbx = await makeSandbox();
    await sbx.cli([
      'install',
      '--client',
      'codex',
      '--project',
      '--all',
      '--yes',
      '--catalog',
      FIXTURE_ROOT,
    ]);
    const file = path.join(sbx.project, '.codex', 'agents', 'sample-reviewer.toml');
    await writeFile(file, 'name = "evil"\n');
    const r = await sbx.cli(['doctor', '--project', '--catalog', FIXTURE_ROOT]);
    expect(r.out).toContain('modified locally');
    // And uninstall leaves the modified file in place rather than deleting unknown content.
    await sbx.cli(['uninstall', '--project', '--all', '--yes']);
    expect(await readFile(file, 'utf8')).toBe('name = "evil"\n');
  });
});
