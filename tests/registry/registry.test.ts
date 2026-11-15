import { describe, expect, it } from 'vitest';
import { discoverCatalog, loadComponent } from '../../src/registry/index.js';
import { FIXTURE_ROOT, makeCatalog, validAgent, validSkill } from '../helpers.js';

describe('registry', () => {
  it('discovers the fixture catalog without issues', async () => {
    const { entries, issues } = await discoverCatalog(FIXTURE_ROOT);
    expect(issues).toEqual([]);
    expect(entries.map((e) => e.manifest.id).sort()).toEqual(['sample-reviewer', 'sample-skill']);
  });

  it('returns an empty catalog for a missing root', async () => {
    expect(await discoverCatalog('does-not-exist-xyz')).toEqual({ entries: [], issues: [] });
  });

  it('loads instructions and references on demand', async () => {
    const { entries } = await discoverCatalog(FIXTURE_ROOT);
    const skill = await loadComponent(entries.find((e) => e.manifest.kind === 'skill')!);
    expect(skill.instructions).toContain('# Sample skill');
    expect('references' in skill && skill.references.map((r) => r.content)).toEqual([
      '# Checklist\n\n- Item one\n',
      '# Example stack notes\n',
    ]);
  });

  it('reports mismatched ids, wrong kind dirs, bad JSON and unknown skills', async () => {
    const root = await makeCatalog({
      'skills/other-name/manifest.json': validSkill,
      'skills/demo-agent/manifest.json': validAgent,
      'skills/broken/manifest.json': '{not json',
      'agents/demo-agent/manifest.json': { ...validAgent, skills: ['missing-skill'] },
    });
    const { entries, issues } = await discoverCatalog(root);
    expect(entries.map((e) => e.manifest.id)).toEqual(['demo-agent']);
    expect(issues.map((i) => `${i.source}:${i.code}`).sort()).toEqual([
      'agents/demo-agent:unknown-skill',
      'skills/broken:manifest-unreadable',
      'skills/demo-agent:kind-mismatch',
      'skills/other-name:id-mismatch',
    ]);
  });

  it('flags agents that use skills not available on their targets', async () => {
    const root = await makeCatalog({
      'skills/demo-skill/manifest.json': { ...validSkill, targets: ['codex'] },
      'agents/demo-agent/manifest.json': { ...validAgent, skills: ['demo-skill'] },
    });
    const { issues } = await discoverCatalog(root);
    expect(issues).toMatchObject([{ code: 'target-mismatch', source: 'agents/demo-agent' }]);
  });

  it('fails to load a component with empty instructions', async () => {
    const root = await makeCatalog({
      'skills/demo-skill/manifest.json': validSkill,
      'skills/demo-skill/instructions.md': '  \n',
    });
    const { entries } = await discoverCatalog(root);
    await expect(loadComponent(entries[0]!)).rejects.toThrow(/empty/);
  });
});
