import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveInside } from '../../core/paths.js';
import type { LoadedComponent } from '../../core/types.js';
import type { ResolvedCase } from '../core/types.js';

/**
 * Deterministic, model-free check: do the searches a component documents,
 * plus those of the skills it depends on, reach the file holding a case's
 * evidence? Two machine-readable conventions are recognized in instructions:
 *   Search (case-insensitive) for: `regex`        (file contents)
 *   ... path matches (case-insensitive): `regex`  (file paths)
 * "Reach" = a hit, or a file named by a hit (one hop, like following a route
 * or an import). This measures procedure design, not what a model reads.
 */
const SEARCH = /Search \(case-insensitive\) for: `([^`]+)`/g;
const PATH_SEARCH = /path matches \(case-insensitive\): `([^`]+)`/g;

export const searchPatterns = (text: string): RegExp[] =>
  [...text.matchAll(SEARCH)].map((m) => new RegExp(m[1]!, 'i'));
export const pathPatterns = (text: string): RegExp[] =>
  [...text.matchAll(PATH_SEARCH)].map((m) => new RegExp(m[1]!, 'i'));

export interface Patterns {
  content: RegExp[];
  path: RegExp[];
}

export interface ReachResult {
  caseId: string;
  component: string;
  reached: boolean;
  filesReachable: number;
  filesTotal: number;
}

export interface ReachSummary {
  reached: number;
  total: number;
  /** Mean share of fixture files reachable: lower means more targeted searches. */
  meanReachableShare: number;
  misses: string[];
}

async function fixtureFiles(dir: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  for (const d of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (!d.isFile()) continue;
    const full = path.join(d.parentPath, d.name);
    files.set(path.relative(dir, full).split(path.sep).join('/'), await readFile(full, 'utf8'));
  }
  return files;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function reachableFiles(files: Map<string, string>, patterns: Patterns): Set<string> {
  const hits = [...files]
    .filter(
      ([f, t]) => patterns.content.some((p) => p.test(t)) || patterns.path.some((p) => p.test(f)),
    )
    .map(([f]) => f);
  const out = new Set(hits);
  for (const [f] of files) {
    const stem = escapeRegExp(path.basename(f).replace(/\.[^.]+$/, ''));
    if (stem && hits.some((h) => new RegExp(`\\b${stem}\\b`, 'i').test(files.get(h)!))) {
      out.add(f);
    }
  }
  return out;
}

/** Patterns of a component and, transitively, of the skills it depends on. */
export function patternsFor(
  id: string,
  byId: Map<string, LoadedComponent>,
  seen = new Set<string>(),
): Patterns {
  const c = byId.get(id);
  if (!c || seen.has(id)) return { content: [], path: [] };
  seen.add(id);
  const deps = (c.manifest.kind === 'agent' ? c.manifest.skills : c.manifest.requires) ?? [];
  const nested = deps.map((d) => patternsFor(d, byId, seen));
  return {
    content: [...searchPatterns(c.instructions), ...nested.flatMap((n) => n.content)],
    path: [...pathPatterns(c.instructions), ...nested.flatMap((n) => n.path)],
  };
}

/** For each vulnerable case: does its agent (and its skill, if set) reach the evidence file? */
export async function checkReachability(
  cases: ResolvedCase[],
  components: LoadedComponent[],
  fixturesDir: string,
): Promise<ReachResult[]> {
  const byId = new Map(components.map((c) => [c.manifest.id, c]));
  const cache = new Map<string, Map<string, string>>();
  const results: ReachResult[] = [];
  for (const c of cases.filter((x) => x.kind === 'vulnerable')) {
    if (!cache.has(c.fixture)) {
      cache.set(c.fixture, await fixtureFiles(resolveInside(fixturesDir, c.fixture)));
    }
    const files = cache.get(c.fixture)!;
    for (const component of [c.agent, ...(c.skill ? [c.skill] : [])]) {
      const reach = reachableFiles(files, patternsFor(component, byId));
      results.push({
        caseId: c.id,
        component,
        reached: c.evidenceLines.every((e) => reach.has(e.file)),
        filesReachable: reach.size,
        filesTotal: files.size,
      });
    }
  }
  return results;
}

export function summarizeReach(results: ReachResult[]): ReachSummary {
  const share = results.reduce((n, r) => n + r.filesReachable / r.filesTotal, 0);
  return {
    reached: results.filter((r) => r.reached).length,
    total: results.length,
    meanReachableShare:
      results.length === 0 ? 0 : Math.round((share / results.length) * 1000) / 1000,
    misses: results.filter((r) => !r.reached).map((r) => `${r.caseId}:${r.component}`),
  };
}
