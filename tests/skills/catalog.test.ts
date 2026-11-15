import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { renderFor } from '../../src/adapters/index.js';
import { PLATFORMS, type LoadedSkill } from '../../src/core/types.js';
import { computeCatalogStats } from '../../src/evaluation/metrics/context.js';
import {
  discoverCatalog,
  lintSkillInstructions,
  loadComponent,
  type Catalog,
} from '../../src/registry/index.js';
import { DESCRIPTION_SOFT_LIMIT } from '../../src/validator/index.js';
import {
  checkRenderedFile,
  parseFrontmatter,
  SKILL_MD_RECOMMENDED_MAX_LINES,
} from '../../src/validator/rendered.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const EXPECTED = [
  'authentication-audit',
  'authorization-audit',
  'evidence-reporting',
  'repository-discovery',
  'review-planning',
  'secure-code-review',
];
/** Technology names that must not appear in universal skills. */
const STACK_TERMS =
  /\b(python|django|flask|java|spring|javascript|typescript|node\.?js|express|react|angular|vue|php|laravel|symfony|ruby|rails|golang|rust|kotlin|swift|dotnet|asp\.net|c#)\b/i;

let catalog: Catalog;
let skills: LoadedSkill[];
beforeAll(async () => {
  catalog = await discoverCatalog(ROOT);
  skills = (await Promise.all(catalog.entries.map(loadComponent))).filter(
    (c): c is LoadedSkill => c.manifest.kind === 'skill',
  );
});

describe('bundled universal skills', () => {
  it('ships exactly the six skills, with no catalog issues', () => {
    expect(catalog.issues).toEqual([]);
    expect(skills.map((s) => s.manifest.id).sort()).toEqual(EXPECTED);
  });

  it('every skill has the required sections and uses each dependency it declares', () => {
    for (const s of skills) expect(lintSkillInstructions(s.instructions, s.manifest)).toEqual([]);
  });

  it('is stack-agnostic: no language or framework names in skills or references', () => {
    for (const s of skills) {
      const texts = [s.manifest.description, s.instructions, ...s.references.map((r) => r.content)];
      for (const t of texts) expect(t, s.manifest.id).not.toMatch(STACK_TERMS);
    }
  });

  it('audits are read-only and their dependencies resolve', () => {
    for (const s of skills) expect(s.manifest.capabilities).toEqual(['read']);
  });

  it.each(PLATFORMS)('%s: generated files are valid and minimal', (platform) => {
    for (const s of skills) {
      const { files } = renderFor(platform, s);
      for (const f of files)
        expect(checkRenderedFile(platform, f)).toEqual({ errors: [], warnings: [] });
      const md = files.find((f) => f.relativePath === `${s.manifest.id}/SKILL.md`)!;
      // Discovery metadata = the two standard fields only; catalog metadata stays out.
      expect(Object.keys(parseFrontmatter(md.content).data)).toEqual(['name', 'description']);
      expect(md.content).not.toMatch(/\b(requires|capabilities|domain):/);
      // Reference bodies are not inlined into SKILL.md.
      for (const r of s.references) {
        expect(md.content).toContain(`](${r.path})`);
        expect(md.content).not.toContain(r.content.split('\n').find((l) => l.length > 40)!);
      }
    }
  });

  it('identical SKILL.md for both clients (single source of truth)', () => {
    for (const s of skills) {
      const [a, b] = PLATFORMS.map((p) =>
        renderFor(p, s)
          .files.map((f) => f.content)
          .join('\0'),
      );
      expect(a).toBe(b);
    }
  });
});

describe('verifiable token-efficiency standards', () => {
  it('discovery metadata stays small (documented client budgets)', async () => {
    const stats = await computeCatalogStats(catalog);
    for (const s of stats.skills) {
      expect(s.discoveryChars, s.id).toBeLessThanOrEqual(DESCRIPTION_SOFT_LIMIT + 64);
      expect(s.skillMdLines, s.id).toBeLessThan(SKILL_MD_RECOMMENDED_MAX_LINES);
    }
    // The whole catalog must leave most of Codex's fallback skill-list budget free.
    expect(stats.totals.codexFallbackBudgetShare).toBeLessThan(0.25);
  });

  it('every skill keeps detail in on-demand references', async () => {
    const stats = await computeCatalogStats(catalog);
    for (const s of stats.skills) expect(s.referenceCount, s.id).toBeGreaterThan(0);
  });

  it('authored duplication across skills stays minimal', async () => {
    const stats = await computeCatalogStats(catalog);
    const authored = stats.duplicates.filter((d) => !d.generated);
    expect(authored.length).toBeLessThanOrEqual(1);
    expect(stats.method).toMatch(/estimates/);
  });
});
