import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { assertSafeRelativePath, PathSafetyError, resolveInside } from '../../core/paths.js';
import type { Catalog } from '../../registry/index.js';
import { ID_PATTERN } from '../../validator/index.js';
import { CASE_CATEGORIES, SEVERITIES, type BenchmarkCase, type ResolvedCase } from './types.js';

export interface CaseIssue {
  severity: 'error' | 'warning';
  caseId: string;
  message: string;
}

export interface CaseSuite {
  root: string;
  cases: ResolvedCase[];
  issues: CaseIssue[];
  /** sha256 over the case files, for reproducible reports. */
  digest: string;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const nonEmptyStrings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'string' && x.trim() !== '');

/** Structural checks on one parsed case (no file access). */
export function validateCaseShape(raw: unknown): string[] {
  const e: string[] = [];
  if (!isObj(raw)) return ['case must be an object'];
  const c = raw;
  if (typeof c.id !== 'string' || !ID_PATTERN.test(c.id)) e.push('id must be kebab-case');
  if (!(CASE_CATEGORIES as readonly unknown[]).includes(c.category))
    e.push(`category must be one of ${CASE_CATEGORIES.join(', ')}`);
  for (const k of ['subcategory', 'description', 'fixture', 'agent'] as const) {
    if (typeof c[k] !== 'string' || (c[k] as string).trim() === '') e.push(`${k} is required`);
  }
  if (c.kind !== 'vulnerable' && c.kind !== 'safe') e.push('kind must be vulnerable or safe');
  if (!nonEmptyStrings(c.files)) e.push('files must list at least one path');
  for (const k of ['acceptance', 'falsePositive'] as const) {
    if (!nonEmptyStrings(c[k])) e.push(`${k} must list at least one criterion`);
  }
  if (!Array.isArray(c.limitations)) e.push('limitations must be an array (may be empty)');
  if (c.references !== undefined && !nonEmptyStrings(c.references))
    e.push('references must be non-empty strings');
  if (c.kind === 'vulnerable') {
    const x = c.expected;
    if (!isObj(x)) e.push('vulnerable cases need expected');
    else {
      if (typeof x.issue !== 'string' || x.issue.trim() === '')
        e.push('expected.issue is required');
      if (!(SEVERITIES as readonly unknown[]).includes(x.severity))
        e.push(`expected.severity must be one of ${SEVERITIES.join(', ')}`);
      if (!nonEmptyStrings(x.keywords)) e.push('expected.keywords must list at least one keyword');
      if (x.cwe !== undefined && (typeof x.cwe !== 'string' || !/^CWE-\d+$/.test(x.cwe)))
        e.push('expected.cwe must look like CWE-79');
      if (!Array.isArray(x.evidence) || x.evidence.length === 0)
        e.push('expected.evidence must list at least one item');
      else
        for (const ev of x.evidence) {
          if (
            !isObj(ev) ||
            typeof ev.file !== 'string' ||
            typeof ev.contains !== 'string' ||
            ev.contains === ''
          ) {
            e.push('evidence items need file and contains');
          }
        }
    }
  } else if (c.kind === 'safe') {
    if (c.expected !== undefined) e.push('safe cases must not have expected');
    if (!nonEmptyStrings(c.keywords))
      e.push('safe cases need keywords that define a false positive');
  }
  return e;
}

/**
 * Loads every `*.json` file in `casesDir`, validates shape, uniqueness, fixture
 * files, evidence uniqueness and (with a catalog) agents, skills and references.
 */
export async function loadCaseSuite(
  casesDir: string,
  fixturesDir: string,
  catalog?: Catalog,
): Promise<CaseSuite> {
  const issues: CaseIssue[] = [];
  const cases: ResolvedCase[] = [];
  const hash = createHash('sha256');
  const files = (await readdir(casesDir)).filter((f) => f.endsWith('.json')).sort();
  const seen = new Set<string>();

  for (const file of files) {
    const text = await readFile(path.join(casesDir, file), 'utf8');
    hash.update(file).update(text);
    let doc: unknown;
    try {
      doc = JSON.parse(text);
    } catch (err) {
      issues.push({
        severity: 'error',
        caseId: file,
        message: `invalid JSON: ${(err as Error).message}`,
      });
      continue;
    }
    if (!isObj(doc) || doc.schemaVersion !== 1 || !Array.isArray(doc.cases)) {
      issues.push({
        severity: 'error',
        caseId: file,
        message: 'expected { "schemaVersion": 1, "cases": [...] }',
      });
      continue;
    }
    for (const raw of doc.cases) {
      const id = isObj(raw) && typeof raw.id === 'string' ? raw.id : `${file}#?`;
      const shape = validateCaseShape(raw);
      if (shape.length > 0) {
        shape.forEach((m) => issues.push({ severity: 'error', caseId: id, message: m }));
        continue;
      }
      if (seen.has(id))
        issues.push({ severity: 'error', caseId: id, message: 'duplicate case id' });
      seen.add(id);
      const resolved = await resolveCase(raw as unknown as BenchmarkCase, fixturesDir, issues);
      if (resolved) cases.push(resolved);
    }
  }

  if (catalog) {
    const byId = new Map(catalog.entries.map((e) => [e.manifest.id, e.manifest]));
    for (const c of cases) {
      const agent = byId.get(c.agent);
      if (!agent || agent.kind !== 'agent')
        issues.push({ severity: 'error', caseId: c.id, message: `unknown agent "${c.agent}"` });
      if (c.skill) {
        const skill = byId.get(c.skill);
        if (!skill || skill.kind !== 'skill') {
          issues.push({ severity: 'error', caseId: c.id, message: `unknown skill "${c.skill}"` });
        } else {
          const refs = (skill.references ?? []).map((r) => r.path);
          for (const r of c.references ?? []) {
            if (!refs.includes(r))
              issues.push({
                severity: 'error',
                caseId: c.id,
                message: `skill "${c.skill}" has no reference ${r}`,
              });
          }
        }
      } else if (c.references) {
        issues.push({ severity: 'error', caseId: c.id, message: 'references require a skill' });
      }
    }
  }
  return { root: casesDir, cases, issues, digest: hash.digest('hex') };
}

async function resolveCase(
  c: BenchmarkCase,
  fixturesDir: string,
  issues: CaseIssue[],
): Promise<ResolvedCase | undefined> {
  const err = (message: string) => issues.push({ severity: 'error', caseId: c.id, message });
  let fixtureRoot: string;
  try {
    assertSafeRelativePath(c.fixture);
    fixtureRoot = resolveInside(fixturesDir, c.fixture);
  } catch (e) {
    err(e instanceof PathSafetyError ? e.message : String(e));
    return undefined;
  }
  const contents = new Map<string, string>();
  for (const f of new Set([...c.files, ...(c.expected?.evidence.map((e) => e.file) ?? [])])) {
    try {
      contents.set(f, await readFile(resolveInside(fixtureRoot, f), 'utf8'));
    } catch (e) {
      err(e instanceof PathSafetyError ? e.message : `missing fixture file ${c.fixture}/${f}`);
    }
  }
  const evidenceLines: ResolvedCase['evidenceLines'] = [];
  for (const ev of c.expected?.evidence ?? []) {
    if (!c.files.includes(ev.file)) err(`evidence file ${ev.file} must be listed in files`);
    const text = contents.get(ev.file);
    if (text === undefined) continue;
    const lines = text.split('\n');
    const hits = lines.flatMap((l, i) => (l.includes(ev.contains) ? [i + 1] : []));
    if (hits.length !== 1)
      err(
        `evidence "${ev.contains}" must match exactly one line in ${ev.file} (found ${hits.length})`,
      );
    else evidenceLines.push({ file: ev.file, line: hits[0]! });
  }
  return issues.some((i) => i.caseId === c.id && i.severity === 'error')
    ? undefined
    : { ...c, evidenceLines };
}

/** Lines in a fixture file (for evidence validity checks); undefined when absent or unsafe. */
export async function fixtureFileLines(
  fixturesDir: string,
  fixture: string,
  file: string,
): Promise<string[] | undefined> {
  try {
    return (await readFile(resolveInside(resolveInside(fixturesDir, fixture), file), 'utf8')).split(
      '\n',
    );
  } catch {
    return undefined;
  }
}
