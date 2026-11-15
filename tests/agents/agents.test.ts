import { existsSync, readdirSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { renderFor } from '../../src/adapters/index.js';
import { PROFILES, profilePlan } from '../../src/core/profiles.js';
import { PLATFORMS, type LoadedAgent } from '../../src/core/types.js';
import {
  discoverCatalog,
  lintInstructions,
  loadComponent,
  resolveSelection,
  type Catalog,
} from '../../src/registry/index.js';
import { DESCRIPTION_SOFT_LIMIT, validateManifest } from '../../src/validator/index.js';
import {
  checkRenderedFile,
  parseFrontmatter,
  parseTomlSubset,
} from '../../src/validator/rendered.js';
import { makeCatalog, makeSandbox, validAgent, validSkill, type Sandbox } from '../helpers.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const AGENTS = {
  'appsec-auditor': 'appsec',
  'architecture-reviewer': 'architecture',
  'code-quality-reviewer': 'quality',
  'performance-auditor': 'performance',
  'infrastructure-reviewer': 'infrastructure',
} as const;
const STACK_TERMS =
  /\b(python|django|flask|java|spring|javascript|typescript|node\.?js|express|react|angular|vue|php|laravel|symfony|ruby|rails|golang|rust|kotlin|swift|dotnet|c#|docker|kubernetes|terraform|github|gitlab|aws|azure|gcp)\b/i;

let catalog: Catalog;
let agents: LoadedAgent[];
beforeAll(async () => {
  catalog = await discoverCatalog(ROOT);
  agents = (await Promise.all(catalog.entries.map(loadComponent))).filter(
    (c): c is LoadedAgent => c.manifest.kind === 'agent',
  );
});

describe('bundled agents: definitions', () => {
  it('ships the five agents with unique ids, one domain each, and no catalog issues', () => {
    expect(catalog.issues).toEqual([]);
    expect(Object.fromEntries(agents.map((a) => [a.manifest.id, a.manifest.domain]))).toEqual(
      AGENTS,
    );
    const ids = catalog.entries.map((e) => e.manifest.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('are read-only, do not delegate, and keep discovery metadata small', () => {
    for (const { manifest: m } of agents) {
      expect(m.mode).toBe('read-only');
      expect(m.capabilities).toEqual(['read']);
      expect(m.budget?.maxSubagents).toBe(0);
      expect(m.description.length).toBeLessThanOrEqual(DESCRIPTION_SOFT_LIMIT);
      expect(m.description).not.toMatch(/proactive/i); // no automatic fan-out
      expect(m.preloadSkills).toEqual(['evidence-reporting']);
    }
  });

  it('have the required sections, name every skill they use, and stay stack-agnostic', () => {
    for (const a of agents) {
      expect(lintInstructions(a.instructions, a.manifest)).toEqual([]);
      expect(a.instructions, a.manifest.id).not.toMatch(STACK_TERMS);
    }
  });

  it('reuse the Phase 3 skills; every skill resolves and appsec uses all security skills', () => {
    for (const a of agents) {
      const ids = resolveSelection(catalog, [a.manifest.id]).map((e) => e.manifest.id);
      for (const s of a.manifest.skills ?? []) expect(ids).toContain(s);
      expect(ids).toContain('evidence-reporting');
    }
    expect(agents.find((a) => a.manifest.id === 'appsec-auditor')!.manifest.skills).toEqual([
      'repository-discovery',
      'secure-code-review',
      'authentication-audit',
      'authorization-audit',
      'evidence-reporting',
    ]);
  });

  it('share rules through the generator instead of copying them', () => {
    for (const a of agents) {
      expect(a.instructions).not.toMatch(/## (Operating rules|Analysis profiles|Report)\b/);
    }
  });
});

describe('analysis profiles', () => {
  it('quick, standard and deep are ordered and bounded by the agent budget', () => {
    for (const { manifest: m } of agents) {
      const [quick, standard, deep] = PROFILES.map((p) => profilePlan(m, p));
      expect(quick).toMatchObject({ depth: 1, delegation: 0, discovery: 'only-if-scope-unclear' });
      expect(standard!.depth).toBe(Math.min(2, m.budget!.maxDepth));
      expect(standard!.delegation).toBe(0);
      expect(deep!.depth).toBe(m.budget!.maxDepth);
      expect(deep!.delegation).toBe(m.budget!.maxSubagents);
      expect(quick!.depth).toBeLessThanOrEqual(standard!.depth);
      expect(standard!.depth).toBeLessThanOrEqual(deep!.depth);
    }
  });

  it.each(PLATFORMS)('%s: every agent prompt carries all three profiles', (platform) => {
    for (const a of agents) {
      const body = renderFor(platform, a).files[0]!.content;
      for (const p of PROFILES) expect(body).toContain(`- **${p}**`);
      expect(body).toContain('- **standard** (default)');
      expect(body).toContain('Deep never means loading every skill or agent.');
      expect(body).toContain(`follow-up depth ${a.manifest.budget!.maxDepth}`);
    }
  });
});

describe('client compatibility', () => {
  it('Claude Code: documented fields, read-only tools, plan mode, only the report skill preloaded', () => {
    for (const a of agents) {
      const file = renderFor('claude-code', a).files[0]!;
      expect(file).toMatchObject({ location: 'agents', relativePath: `${a.manifest.id}.md` });
      expect(checkRenderedFile('claude-code', file)).toEqual({ errors: [], warnings: [] });
      const { data } = parseFrontmatter(file.content);
      expect(data).toEqual({
        name: a.manifest.id,
        description: a.manifest.description,
        tools: 'Read, Grep, Glob, Bash, Skill',
        permissionMode: 'plan',
        skills: ['evidence-reporting'],
      });
    }
  });

  it('Codex: documented keys only, no sandbox override, honest warnings', () => {
    for (const a of agents) {
      const { files, warnings } = renderFor('codex', a);
      expect(checkRenderedFile('codex', files[0]!)).toEqual({ errors: [], warnings: [] });
      const toml = parseTomlSubset(files[0]!.content);
      expect(Object.keys(toml).sort()).toEqual(['description', 'developer_instructions', 'name']);
      expect(toml.developer_instructions).toContain('- Use in every run: evidence-reporting.');
      expect(warnings.join('\n')).toMatch(/sandbox_mode = "read-only"/);
      expect(warnings.join('\n')).toMatch(/direct request or a project\/skill instruction/);
    }
  });
});

describe('invalid agent configurations are rejected', () => {
  it.each([
    [{ preloadSkills: ['x'] }, 'not-in-skills'],
    [{ capabilities: ['read', 'edit'] }, 'read-only-violation'],
    [{ domain: 'devops' }, 'enum'],
    [{ budget: { maxDepth: 9, maxSubagents: 0 } }, 'range'],
    [{ mode: 'admin' }, 'enum'],
  ])('%j', (patch, code) => {
    expect(validateManifest({ ...validAgent, ...patch }).issues.map((i) => i.code)).toContain(code);
  });

  it('unknown skills, capability mismatches and duplicate ids are catalog errors', async () => {
    const root = await makeCatalog({
      'skills/needs-shell/manifest.json': {
        ...validSkill,
        id: 'needs-shell',
        capabilities: ['read', 'shell'],
      },
      'agents/a/demo-agent/manifest.json': { ...validAgent, skills: ['ghost'] },
      'agents/b/demo-agent/manifest.json': { ...validAgent },
      'agents/c/other-agent/manifest.json': {
        ...validAgent,
        id: 'other-agent',
        skills: ['needs-shell'],
      },
    });
    const codes = (await discoverCatalog(root)).issues.map((i) => `${i.source}:${i.code}`).sort();
    expect(codes).toEqual([
      'agents/a/demo-agent:unknown-skill',
      'agents/b/demo-agent:duplicate-id',
      'agents/c/other-agent:capability-mismatch',
    ]);
  });

  it('a declared skill the instructions never mention is flagged', () => {
    const m = validateManifest({ ...validAgent, skills: ['evidence-reporting'] }).manifest!;
    const text = '## Mission\n## Focus areas\n## Procedure\n## Out of scope\n## Done when\n';
    expect(lintInstructions(text, m).map((i) => i.code)).toEqual(['unused-requirement']);
  });
});

describe('installing agents', () => {
  let sbx: Sandbox;
  beforeEach(async () => {
    sbx = await makeSandbox();
  });

  it('global install for both clients writes native agent files', async () => {
    const r = await sbx.cli(['install', '--client', 'both', '--global', '--all', '--yes']);
    expect(r.code, r.err).toBe(0);
    for (const id of Object.keys(AGENTS)) {
      expect(existsSync(path.join(sbx.home, '.claude', 'agents', `${id}.md`))).toBe(true);
      expect(existsSync(path.join(sbx.home, '.codex', 'agents', `${id}.toml`))).toBe(true);
    }
  });

  it('selective project install brings only the agent and its skills', async () => {
    const r = await sbx.cli([
      'install',
      'performance-auditor',
      '--client',
      'claude',
      '--project',
      '--yes',
    ]);
    expect(r.code, r.err).toBe(0);
    expect(readdirSync(path.join(sbx.project, '.claude', 'agents'))).toEqual([
      'performance-auditor.md',
    ]);
    expect(readdirSync(path.join(sbx.project, '.claude', 'skills')).sort()).toEqual([
      'evidence-reporting',
      'repository-discovery',
    ]);
  });

  it('never overwrites a user agent with the same name and keeps other user agents', async () => {
    const dir = path.join(sbx.project, '.claude', 'agents');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'appsec-auditor.md'), 'my own agent');
    await writeFile(path.join(dir, 'team-agent.md'), 'team agent');

    const conflict = await sbx.cli([
      'install',
      'appsec-auditor',
      '--client',
      'claude',
      '--project',
      '--yes',
    ]);
    expect(conflict.code).toBe(3);
    expect(await readFile(path.join(dir, 'appsec-auditor.md'), 'utf8')).toBe('my own agent');

    await sbx.cli(['install', 'architecture-reviewer', '--client', 'claude', '--project', '--yes']);
    await sbx.cli(['uninstall', '--project', '--all', '--yes']);
    expect(readdirSync(dir).sort()).toEqual(['appsec-auditor.md', 'team-agent.md']);
  });

  it('list --type agent shows the five agents with their skills', async () => {
    const r = await sbx.cli(['list', '--type', 'agent']);
    expect(r.out.split('\n')).toHaveLength(5);
    expect(r.out).toContain(
      'needs: repository-discovery, secure-code-review, authentication-audit',
    );
  });

  it('doctor warns when Claude settings override the agents plan mode', async () => {
    await sbx.cli(['install', 'appsec-auditor', '--client', 'claude', '--project', '--yes']);
    await writeFile(
      path.join(sbx.project, '.claude', 'settings.json'),
      JSON.stringify({ permissions: { defaultMode: 'bypassPermissions' } }),
    );
    const r = await sbx.cli(['doctor', '--project']);
    expect(r.code).toBe(0);
    expect(r.out).toContain("overrides the agents' plan mode");
  });

  it('doctor reports the Codex read-only caveat for installed agents', async () => {
    await sbx.cli(['install', 'appsec-auditor', '--client', 'codex', '--project', '--yes']);
    const r = await sbx.cli(['doctor', '--project']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('sandbox_mode');
  });
});
