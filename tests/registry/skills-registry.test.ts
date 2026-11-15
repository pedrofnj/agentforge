import { describe, expect, it } from 'vitest';
import {
  discoverCatalog,
  lintSkillInstructions,
  resolveSelection,
  toRegistryEntry,
} from '../../src/registry/index.js';
import { validateManifest } from '../../src/validator/index.js';
import { makeCatalog, validAgent, validSkill } from '../helpers.js';

const skill = (id: string, extra: object = {}) => ({ ...validSkill, id, ...extra });
const codes = async (files: Record<string, object | string>) =>
  (await discoverCatalog(await makeCatalog(files))).issues
    .map((i) => `${i.source}:${i.code}`)
    .sort();

describe('skill manifest fields', () => {
  it('accepts domain, capabilities and requires', () => {
    const m = skill('a', { domain: 'workflow', capabilities: ['read'], requires: ['b'] });
    expect(validateManifest(m).issues).toEqual([]);
  });

  it.each([
    [{ domain: 'php' }, 'enum'],
    [{ capabilities: ['root'] }, 'enum'],
    [{ requires: ['Bad_Id'] }, 'id'],
    [{ requires: ['a'] }, 'self-dependency'],
  ])('rejects %j', (extra, code) => {
    expect(validateManifest(skill('a', extra)).issues.map((i) => i.code)).toContain(code);
  });
});

describe('grouped catalog layout', () => {
  it('discovers skills one level inside group directories', async () => {
    const root = await makeCatalog({
      'skills/security/a/manifest.json': skill('a', { domain: 'appsec' }),
      'skills/b/manifest.json': skill('b'),
    });
    const { entries, issues } = await discoverCatalog(root);
    expect(issues).toEqual([]);
    expect(entries.map((e) => e.source).sort()).toEqual(['skills/b', 'skills/security/a']);
    expect(toRegistryEntry(entries.find((e) => e.manifest.id === 'a')!)).toMatchObject({
      domain: 'appsec',
      capabilities: ['read'],
      dependencies: [],
    });
  });

  it('rejects duplicate ids across groups and components missing a manifest', async () => {
    expect(
      await codes({
        'skills/one/a/manifest.json': skill('a'),
        'skills/two/a/manifest.json': skill('a'),
        'skills/two/b/instructions.md': '# no manifest',
      }),
    ).toEqual(['skills/two/a:duplicate-id', 'skills/two/b:manifest-missing']);
  });

  it('flags group names that are not kebab-case', async () => {
    expect(await codes({ 'skills/Bad Group/a/manifest.json': skill('a') })).toEqual([
      'skills/Bad Group:group-name',
    ]);
  });
});

describe('dependencies', () => {
  it('detects unknown, cyclic, target- and capability-incompatible requirements', async () => {
    expect(
      await codes({
        'skills/a/manifest.json': skill('a', { requires: ['b'] }),
        'skills/b/manifest.json': skill('b', { requires: ['a'] }),
        'skills/c/manifest.json': skill('c', { requires: ['ghost'] }),
        'skills/d/manifest.json': skill('d', { requires: ['e'] }),
        'skills/e/manifest.json': skill('e', { targets: ['codex'] }),
        'skills/f/manifest.json': skill('f', { requires: ['g'] }),
        'skills/g/manifest.json': skill('g', { capabilities: ['read', 'shell'] }),
      }),
    ).toEqual([
      'skills/a:dependency-cycle',
      'skills/c:unknown-skill',
      'skills/d:target-mismatch',
      'skills/f:capability-mismatch',
    ]);
  });

  it('a read-only agent cannot depend on a skill that needs a shell', async () => {
    expect(
      await codes({
        'skills/g/manifest.json': skill('g', { capabilities: ['read', 'shell'] }),
        'agents/demo-agent/manifest.json': { ...validAgent, skills: ['g'] },
      }),
    ).toEqual(['agents/demo-agent:capability-mismatch']);
  });

  it('selection expands requirements transitively and orders skills first', async () => {
    const catalog = await discoverCatalog(
      await makeCatalog({
        'skills/a/manifest.json': skill('a', { requires: ['b'] }),
        'skills/b/manifest.json': skill('b', { requires: ['c'] }),
        'skills/c/manifest.json': skill('c'),
        'agents/demo-agent/manifest.json': { ...validAgent, skills: ['a'] },
      }),
    );
    expect(resolveSelection(catalog, ['demo-agent']).map((e) => e.manifest.id)).toEqual([
      'a',
      'b',
      'c',
      'demo-agent',
    ]);
  });
});

describe('instruction lint', () => {
  const full = '## Goal\n## When to use\n## When not to use\n## Procedure\n## Done when\n';

  it('requires the authored sections', () => {
    expect(lintSkillInstructions(full)).toEqual([]);
    expect(lintSkillInstructions('## Goal\n').map((i) => i.message)).toContain(
      'missing "## Procedure" section',
    );
  });

  it('flags declared dependencies the text never mentions', () => {
    const m = validateManifest(skill('a', { requires: ['b'] })).manifest!;
    expect(lintSkillInstructions(full, m).map((i) => i.code)).toEqual(['unused-requirement']);
    expect(lintSkillInstructions(`${full}Use \`b\` to report.`, m)).toEqual([]);
  });
});
