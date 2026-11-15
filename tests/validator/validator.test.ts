import { describe, expect, it } from 'vitest';
import { validateManifest } from '../../src/validator/index.js';
import { validAgent, validSkill } from '../helpers.js';

const codes = (input: unknown) => validateManifest(input).issues.map((i) => i.code);

describe('validateManifest', () => {
  it('accepts minimal skill and agent manifests', () => {
    expect(validateManifest(validSkill)).toEqual({ manifest: validSkill, issues: [] });
    expect(validateManifest(validAgent)).toEqual({ manifest: validAgent, issues: [] });
  });

  it('rejects non-objects and wrong schema versions', () => {
    expect(codes(null)).toEqual(['type']);
    expect(codes({ ...validSkill, schemaVersion: 2 })).toContain('schema');
  });

  it.each(['Bad_Id', '-x', 'x-', 'a--b', 'a'.repeat(65)])('rejects id %j', (id) => {
    expect(codes({ ...validSkill, id })).toContain('id');
  });

  it('enforces semver, single-line description and known targets', () => {
    expect(codes({ ...validSkill, version: '1.0' })).toContain('semver');
    expect(codes({ ...validSkill, description: 'a\nb' })).toContain('single-line');
    expect(codes({ ...validSkill, targets: [] })).toContain('required');
    expect(codes({ ...validSkill, targets: ['cursor'] })).toContain('enum');
  });

  it('warns (not errors) on descriptions that are costly to discover', () => {
    const r = validateManifest({ ...validSkill, description: 'x'.repeat(301) });
    expect(r.manifest).toBeDefined();
    expect(r.issues).toMatchObject([{ severity: 'warning', code: 'discovery-cost' }]);
  });

  it('rejects unsafe or duplicate reference paths', () => {
    const ref = (path: string) => ({ path, description: 'd' });
    expect(codes({ ...validSkill, references: [ref('../x.md')] })).toContain('unsafe-path');
    expect(codes({ ...validSkill, references: [ref('SKILL.md')] })).toContain('reserved');
    expect(codes({ ...validSkill, references: [ref('a.md'), ref('a.md')] })).toContain('duplicate');
  });

  it('accepts optional specializations gated by opaque signals', () => {
    const references = [{ path: 'references/x.md', description: 'd', appliesWhen: ['any.signal'] }];
    expect(validateManifest({ ...validSkill, references }).issues).toEqual([]);
    expect(codes({ ...validSkill, references: [{ ...references[0], appliesWhen: [] }] })).toContain(
      'type',
    );
  });

  it('requires a universal domain for agents', () => {
    expect(codes({ ...validAgent, domain: undefined })).toContain('enum');
    expect(codes({ ...validAgent, domain: 'php' })).toContain('enum');
  });

  it('blocks write capabilities on read-only agents', () => {
    expect(codes({ ...validAgent, capabilities: ['read', 'edit'] })).toContain(
      'read-only-violation',
    );
    expect(codes({ ...validAgent, mode: 'read-write', capabilities: ['read', 'edit'] })).toEqual(
      [],
    );
  });

  it('enforces budget ranges', () => {
    expect(codes({ ...validAgent, budget: { maxDepth: 0, maxSubagents: 0 } })).toContain('range');
    expect(codes({ ...validAgent, budget: { maxDepth: 2, maxSubagents: 9 } })).toContain('range');
    expect(codes({ ...validAgent, budget: { maxDepth: 2, maxSubagents: 1 } })).toEqual([]);
  });
});
