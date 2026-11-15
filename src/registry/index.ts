import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveInside } from '../core/paths.js';
import type {
  Capability,
  ComponentKind,
  ComponentManifest,
  LoadedComponent,
  LoadedReference,
} from '../core/types.js';
import { ID_PATTERN, validateManifest, type ValidationIssue } from '../validator/index.js';

export const MANIFEST_FILE = 'manifest.json';
export const INSTRUCTIONS_FILE = 'instructions.md';
const KIND_DIRS: Record<ComponentKind, string> = { skill: 'skills', agent: 'agents' };

export interface CatalogEntry {
  manifest: ComponentManifest;
  dir: string;
  /** Catalog-relative location, e.g. `skills/security/secure-code-review`. */
  source: string;
}

export interface CatalogIssue extends ValidationIssue {
  /** Component directory (or catalog root) the issue belongs to. */
  source: string;
}

export interface Catalog {
  entries: CatalogEntry[];
  issues: CatalogIssue[];
}

const isErrno = (e: unknown, code: string) => (e as NodeJS.ErrnoException)?.code === code;

async function listDirs(dir: string): Promise<string[]> {
  try {
    const items = await readdir(dir, { withFileTypes: true });
    return items
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
  } catch (e) {
    if (isErrno(e, 'ENOENT')) return [];
    throw e;
  }
}

/** Skill capabilities default to read-only. */
export const capabilitiesOf = (m: ComponentManifest): readonly Capability[] =>
  m.capabilities ?? ['read'];

/** Skills a component delegates to: agent `skills` or skill `requires`. */
export const dependenciesOf = (m: ComponentManifest): readonly string[] =>
  (m.kind === 'agent' ? m.skills : m.requires) ?? [];

/**
 * Discovery reads manifests only (minimal metadata). Instructions and
 * references are never touched here: they load on demand via `loadComponent`.
 * Layout: `<kind>/<id>/` or `<kind>/<group>/<id>/` (one organizational level;
 * groups never reach clients, which use flat ids).
 */
export async function discoverCatalog(root: string): Promise<Catalog> {
  const entries: CatalogEntry[] = [];
  const issues: CatalogIssue[] = [];

  async function visit(
    kind: ComponentKind,
    dir: string,
    source: string,
    name: string,
    inGroup: boolean,
  ) {
    const push = (i: ValidationIssue) => issues.push({ ...i, source });
    let text: string;
    try {
      text = await readFile(path.join(dir, MANIFEST_FILE), 'utf8');
    } catch (e) {
      if (!isErrno(e, 'ENOENT')) throw e;
      if (inGroup) {
        push({
          severity: 'error',
          code: 'manifest-missing',
          path: MANIFEST_FILE,
          message: 'component directory has no manifest.json',
        });
        return;
      }
      if (!ID_PATTERN.test(name)) {
        push({
          severity: 'error',
          code: 'group-name',
          path: '',
          message: 'group directory names must be kebab-case',
        });
        return;
      }
      const children = await listDirs(dir);
      if (children.length === 0) {
        push({
          severity: 'warning',
          code: 'empty-group',
          path: '',
          message: 'directory has neither manifest.json nor components',
        });
      }
      for (const child of children)
        await visit(kind, path.join(dir, child), `${source}/${child}`, child, true);
      return;
    }

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (e) {
      push({
        severity: 'error',
        code: 'manifest-unreadable',
        path: MANIFEST_FILE,
        message: (e as Error).message,
      });
      return;
    }
    const { manifest, issues: found } = validateManifest(raw);
    found.forEach(push);
    if (!manifest) return;
    if (manifest.kind !== kind) {
      push({
        severity: 'error',
        code: 'kind-mismatch',
        path: 'kind',
        message: `"${manifest.kind}" found under ${KIND_DIRS[kind]}/`,
      });
      return;
    }
    if (manifest.id !== name) {
      push({
        severity: 'error',
        code: 'id-mismatch',
        path: 'id',
        message: `id "${manifest.id}" must match directory "${name}"`,
      });
      return;
    }
    entries.push({ manifest, dir, source });
  }

  for (const [kind, sub] of Object.entries(KIND_DIRS) as [ComponentKind, string][]) {
    for (const name of await listDirs(path.join(root, sub))) {
      await visit(kind, path.join(root, sub, name), `${sub}/${name}`, name, false);
    }
  }

  issues.push(...crossValidate(entries));
  return { entries, issues };
}

function crossValidate(entries: CatalogEntry[]): CatalogIssue[] {
  const issues: CatalogIssue[] = [];
  const err = (source: string, code: string, path: string, message: string) =>
    issues.push({ severity: 'error', code, path, message, source });
  const byId = new Map<string, CatalogEntry>();

  for (const e of entries) {
    const first = byId.get(e.manifest.id);
    if (first)
      err(
        e.source,
        'duplicate-id',
        'id',
        `id "${e.manifest.id}" is already used by ${first.source}`,
      );
    else byId.set(e.manifest.id, e);
  }

  for (const { manifest: m, source } of entries) {
    const field = m.kind === 'agent' ? 'skills' : 'requires';
    for (const depId of dependenciesOf(m)) {
      const dep = byId.get(depId)?.manifest;
      if (!dep || dep.kind !== 'skill') {
        err(source, 'unknown-skill', field, `unknown skill "${depId}"`);
        continue;
      }
      const missing = m.targets.filter((t) => !dep.targets.includes(t));
      if (missing.length > 0) {
        err(
          source,
          'target-mismatch',
          field,
          `skill "${depId}" does not support: ${missing.join(', ')}`,
        );
      }
      const own = capabilitiesOf(m);
      const extra = capabilitiesOf(dep).filter((c) => !own.includes(c));
      if (extra.length > 0) {
        err(
          source,
          'capability-mismatch',
          field,
          `skill "${depId}" needs capabilities this component lacks: ${extra.join(', ')}`,
        );
      }
    }
  }

  // Cycles among skill `requires` (agents cannot be required, so they cannot be in a cycle).
  const state = new Map<string, 'visiting' | 'done'>();
  const reported = new Set<string>();
  const dfs = (id: string, trail: string[]) => {
    const entry = byId.get(id);
    if (!entry || entry.manifest.kind !== 'skill' || state.get(id) === 'done') return;
    if (state.get(id) === 'visiting') {
      const cycle = [...trail.slice(trail.indexOf(id)), id];
      const key = [...cycle].sort().join(',');
      if (!reported.has(key)) {
        reported.add(key);
        err(
          entry.source,
          'dependency-cycle',
          'requires',
          `dependency cycle: ${cycle.join(' -> ')}`,
        );
      }
      return;
    }
    state.set(id, 'visiting');
    for (const dep of dependenciesOf(entry.manifest)) dfs(dep, [...trail, id]);
    state.set(id, 'done');
  };
  for (const id of byId.keys()) dfs(id, []);
  return issues;
}

/** Sections every canonical skill must author; safety and references are generated. */
export const REQUIRED_SKILL_SECTIONS = [
  'Goal',
  'When to use',
  'When not to use',
  'Procedure',
  'Done when',
];

/** Sections every canonical agent must author; rules, profiles and report fields are generated. */
export const REQUIRED_AGENT_SECTIONS = [
  'Mission',
  'Focus areas',
  'Procedure',
  'Out of scope',
  'Done when',
];

/**
 * Structure lint for authored instructions (catalog quality, not a client rule):
 * required sections present, and every dependency actually named in the text
 * (otherwise it is dead weight or the text never says when to use it).
 */
export function lintInstructions(text: string, manifest?: ComponentManifest): ValidationIssue[] {
  const required = manifest?.kind === 'agent' ? REQUIRED_AGENT_SECTIONS : REQUIRED_SKILL_SECTIONS;
  const headings = new Set([...text.matchAll(/^##\s+(.+?)\s*$/gm)].map((m) => m[1]!.toLowerCase()));
  const issues: ValidationIssue[] = required
    .filter((s) => !headings.has(s.toLowerCase()))
    .map((s) => ({
      severity: 'warning' as const,
      code: 'missing-section',
      path: INSTRUCTIONS_FILE,
      message: `missing "## ${s}" section`,
    }));
  for (const dep of manifest ? dependenciesOf(manifest) : []) {
    if (!new RegExp(`\\b${dep}\\b`).test(text)) {
      issues.push({
        severity: 'warning',
        code: 'unused-requirement',
        path: INSTRUCTIONS_FILE,
        message: `depends on "${dep}" but the instructions never say when to use it`,
      });
    }
  }
  return issues;
}

/** @deprecated kept for compatibility; use lintInstructions. */
export const lintSkillInstructions = lintInstructions;

/** Loads the full content of one component. Paths are confined to its directory. */
export async function loadComponent(entry: CatalogEntry): Promise<LoadedComponent> {
  const instructions = await readFile(resolveInside(entry.dir, INSTRUCTIONS_FILE), 'utf8');
  if (instructions.trim().length === 0) {
    throw new Error(`${entry.manifest.id}: ${INSTRUCTIONS_FILE} is empty`);
  }
  if (entry.manifest.kind === 'agent') {
    return { manifest: entry.manifest, dir: entry.dir, instructions };
  }
  const references: LoadedReference[] = [];
  for (const ref of entry.manifest.references ?? []) {
    const content = await readFile(resolveInside(entry.dir, ref.path), 'utf8');
    references.push({ ...ref, content });
  }
  return { manifest: entry.manifest, dir: entry.dir, instructions, references };
}

/** Minimal metadata view of a catalog entry (no instructions or references). */
export interface RegistryEntry {
  id: string;
  name: string;
  description: string;
  kind: ComponentKind;
  domain: string | undefined;
  version: string;
  targets: readonly string[];
  capabilities: readonly Capability[];
  /** Skills installed together with this component. */
  dependencies: readonly string[];
  source: string;
}

export function toRegistryEntry({ manifest: m, source }: CatalogEntry): RegistryEntry {
  return {
    id: m.id,
    name: m.name ?? m.id,
    description: m.description,
    kind: m.kind,
    domain: m.domain,
    version: m.version,
    targets: m.targets,
    capabilities: capabilitiesOf(m),
    dependencies: dependenciesOf(m),
    source,
  };
}

export class UnknownComponentError extends Error {
  override name = 'UnknownComponentError';
}

/**
 * Expands a selection with its declared dependencies, transitively. Skills come
 * first so nothing references a skill that is not installed yet. Unknown ids throw.
 */
export function resolveSelection(catalog: Catalog, ids: readonly string[]): CatalogEntry[] {
  const byId = new Map(catalog.entries.map((e) => [e.manifest.id, e]));
  const selected = new Map<string, CatalogEntry>();
  const unknown: string[] = [];
  const queue = [...ids];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (selected.has(id)) continue;
    const entry = byId.get(id);
    if (!entry) {
      if (!unknown.includes(id)) unknown.push(id);
      continue;
    }
    selected.set(id, entry);
    queue.push(...dependenciesOf(entry.manifest));
  }
  if (unknown.length > 0) {
    throw new UnknownComponentError(`Unknown component(s): ${unknown.join(', ')}`);
  }
  return [...selected.values()].sort(
    (a, b) =>
      Number(a.manifest.kind === 'agent') - Number(b.manifest.kind === 'agent') ||
      a.manifest.id.localeCompare(b.manifest.id),
  );
}
