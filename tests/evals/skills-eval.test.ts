import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { LoadedComponent, LoadedSkill } from '../../src/core/types.js';
import {
  checkReachability,
  patternsFor,
  reachableFiles,
  summarizeReach,
  type ReachSummary,
} from '../../src/evaluation/analyzers/reachability.js';
import { loadCaseSuite, type CaseSuite } from '../../src/evaluation/core/cases.js';
import { discoverCatalog, loadComponent } from '../../src/registry/index.js';

/**
 * Deterministic evaluation of procedures over the benchmark cases (no model
 * calls): stack independence of the documented searches, reference usage per
 * task, and a reachability baseline guarding against regressions. Structural
 * results like these do not prove audit effectiveness.
 */
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const FIXTURES = path.join(ROOT, 'evals', 'fixtures');

/** Ecosystem marker and entry point per fixture, used to check repository-discovery. */
const PROJECTS: Record<string, { ecosystemFile: string; entryPoint: string }> = {
  'python-service': { ecosystemFile: 'requirements.txt', entryPoint: 'app/main.py' },
  'go-service': { ecosystemFile: 'go.mod', entryPoint: 'cmd/server/main.go' },
  'typescript-api': { ecosystemFile: 'package.json', entryPoint: 'src/server.ts' },
  'php-app': { ecosystemFile: 'composer.json', entryPoint: 'public/index.php' },
  'rust-cli': { ecosystemFile: 'Cargo.toml', entryPoint: 'src/main.rs' },
  'java-service': {
    ecosystemFile: 'pom.xml',
    entryPoint: 'src/main/java/example/AuditController.java',
  },
};

let suite: CaseSuite;
let components: LoadedComponent[];
let byId: Map<string, LoadedComponent>;
beforeAll(async () => {
  const catalog = await discoverCatalog(ROOT);
  components = await Promise.all(catalog.entries.map(loadComponent));
  byId = new Map(components.map((c) => [c.manifest.id, c]));
  suite = await loadCaseSuite(path.join(ROOT, 'evals', 'cases'), FIXTURES, catalog);
});

async function files(project: string): Promise<Map<string, string>> {
  const dir = path.join(FIXTURES, project);
  const out = new Map<string, string>();
  for (const d of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (!d.isFile()) continue;
    const full = path.join(d.parentPath, d.name);
    out.set(path.relative(dir, full).split(path.sep).join('/'), await readFile(full, 'utf8'));
  }
  return out;
}

describe('repository-discovery across languages', () => {
  it.each(Object.entries(PROJECTS))(
    '%s: ecosystem and entry point are found',
    async (project, p) => {
      const f = await files(project);
      expect(f.has(p.ecosystemFile)).toBe(true); // identified by file name, no reading needed
      expect(reachableFiles(f, patternsFor('repository-discovery', byId)).has(p.entryPoint)).toBe(
        true,
      );
    },
  );
});

describe('references needed per task', () => {
  it('each case needs a strict subset of its skill references, all of which exist', () => {
    const withRefs = suite.cases.filter((c) => c.skill && c.references);
    expect(withRefs.length).toBeGreaterThan(10);
    let used = 0;
    let available = 0;
    for (const c of withRefs) {
      const skill = byId.get(c.skill!) as LoadedSkill;
      const declared = (skill.manifest.references ?? []).map((r) => r.path);
      for (const r of c.references!) expect(declared).toContain(r);
      expect(c.references!.length).toBeLessThan(declared.length);
      used += c.references!.length;
      available += declared.length;
    }
    // Baseline 2026-11-15: about a third of a skill's references per task.
    expect(used / available).toBeLessThanOrEqual(0.45);
  });
});

describe('search reachability (static)', () => {
  it('does not regress against the accepted baseline', async () => {
    const summary = summarizeReach(await checkReachability(suite.cases, components, FIXTURES));
    const baseline = JSON.parse(
      await readFile(path.join(ROOT, 'evals', 'baselines', 'reachability.json'), 'utf8'),
    ) as ReachSummary;
    expect(summary.reached).toBeGreaterThanOrEqual(baseline.reached);
    expect(summary.meanReachableShare).toBeLessThanOrEqual(baseline.meanReachableShare + 0.05);
    expect(summary.misses).toEqual([]);
  });

  it('improved on the pre-Phase-5 procedures', async () => {
    const before = JSON.parse(
      await readFile(path.join(ROOT, 'evals', 'baselines', 'reachability-phase4.json'), 'utf8'),
    ) as ReachSummary;
    const now = summarizeReach(await checkReachability(suite.cases, components, FIXTURES));
    expect(before.reached).toBe(40);
    expect(now.reached).toBeGreaterThan(before.reached);
  });
});
