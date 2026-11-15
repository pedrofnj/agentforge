import { fileURLToPath } from 'node:url';
import type * as FsPromises from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';

const reads: string[] = [];
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>();
  return {
    ...actual,
    readFile: ((file: Parameters<typeof actual.readFile>[0], ...rest: unknown[]) => {
      reads.push(String(file));
      return (actual.readFile as (...a: unknown[]) => unknown)(file, ...rest);
    }) as typeof actual.readFile,
  };
});

const { discoverCatalog } = await import('../../src/registry/index.js');
const { computeCatalogStats } = await import('../../src/evaluation/metrics/context.js');

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

describe('progressive disclosure at discovery time', () => {
  it('discovery and listing read manifest.json files only', async () => {
    reads.length = 0;
    const { entries } = await discoverCatalog(ROOT);
    expect(entries.length).toBeGreaterThan(0);
    // One read per component, plus a probe per group directory (which has no manifest).
    expect(reads.every((f) => f.endsWith('manifest.json'))).toBe(true);
    expect(reads.some((f) => /instructions\.md|references[\\/]/.test(f))).toBe(false);
  });

  it('instructions and references are read only when a component is loaded', async () => {
    const catalog = await discoverCatalog(ROOT);
    reads.length = 0;
    await computeCatalogStats(catalog);
    expect(reads.some((f) => f.endsWith('instructions.md'))).toBe(true);
    expect(reads.some((f) => /references[\\/]/.test(f))).toBe(true);
  });
});
