import { assertSafeRelativePath, PathSafetyError } from '../core/paths.js';
import { BUDGET_LIMITS, forbiddenCapabilities } from '../core/policy.js';
import {
  AGENT_DOMAINS,
  AGENT_MODES,
  CAPABILITIES,
  COMPONENT_KINDS,
  MANIFEST_SCHEMA_VERSION,
  MODEL_TIERS,
  PLATFORMS,
  SKILL_DOMAINS,
  type ComponentManifest,
} from '../core/types.js';

export interface ValidationIssue {
  severity: 'error' | 'warning';
  code: string;
  path: string;
  message: string;
}

export interface ValidationResult {
  /** Present only when there are no errors. */
  manifest?: ComponentManifest;
  issues: ValidationIssue[];
}

/** Aligned with the Agent Skills naming rules used by both platforms. */
export const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const ID_MAX_LENGTH = 64;
export const NAME_MAX_LENGTH = 64;
export const DESCRIPTION_MAX_LENGTH = 1024;
/**
 * Above this, the description still validates but crowds the always-loaded skill
 * list: Codex caps the whole list at 2% of context (8,000 chars when unknown),
 * and the Agent Skills spec budgets ~100 tokens of metadata per skill.
 */
export const DESCRIPTION_SOFT_LIMIT = 300;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const RESERVED_REFERENCE_PATHS = new Set(['SKILL.md', 'manifest.json', 'instructions.md']);

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string');

class Collector {
  readonly issues: ValidationIssue[] = [];
  error(path: string, code: string, message: string) {
    this.issues.push({ severity: 'error', code, path, message });
  }
  warn(path: string, code: string, message: string) {
    this.issues.push({ severity: 'warning', code, path, message });
  }
  get hasErrors() {
    return this.issues.some((i) => i.severity === 'error');
  }
}

function checkSingleLine(c: Collector, value: unknown, path: string, max: number): boolean {
  if (typeof value !== 'string' || value.trim().length === 0) {
    c.error(path, 'required', `${path} must be a non-empty string`);
    return false;
  }
  if (/[\r\n]/.test(value)) c.error(path, 'single-line', `${path} must be a single line`);
  if (value.length > max) c.error(path, 'too-long', `${path} exceeds ${max} characters`);
  return true;
}

function checkEnumArray<T extends string>(
  c: Collector,
  value: unknown,
  path: string,
  allowed: readonly T[],
  { nonEmpty }: { nonEmpty: boolean },
): void {
  if (!isStringArray(value)) {
    c.error(path, 'type', `${path} must be an array of strings`);
    return;
  }
  if (nonEmpty && value.length === 0) c.error(path, 'required', `${path} must not be empty`);
  if (new Set(value).size !== value.length) c.error(path, 'duplicate', `${path} has duplicates`);
  for (const v of value) {
    if (!(allowed as readonly string[]).includes(v)) {
      c.error(path, 'enum', `${path} has unknown value "${v}" (allowed: ${allowed.join(', ')})`);
    }
  }
}

function checkEnum(c: Collector, value: unknown, path: string, allowed: readonly string[]) {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    c.error(path, 'enum', `${path} must be one of: ${allowed.join(', ')}`);
  }
}

function checkId(c: Collector, value: unknown, path: string) {
  if (typeof value !== 'string' || !ID_PATTERN.test(value) || value.length > ID_MAX_LENGTH) {
    c.error(path, 'id', `${path} must be kebab-case [a-z0-9-], max ${ID_MAX_LENGTH} chars`);
  }
}

function checkReferences(c: Collector, value: unknown) {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    c.error('references', 'type', 'references must be an array');
    return;
  }
  const seen = new Set<string>();
  value.forEach((ref, i) => {
    const p = `references[${i}]`;
    if (!isObj(ref)) {
      c.error(p, 'type', `${p} must be an object`);
      return;
    }
    if (typeof ref.path !== 'string') {
      c.error(`${p}.path`, 'required', `${p}.path must be a string`);
    } else {
      try {
        assertSafeRelativePath(ref.path);
        if (RESERVED_REFERENCE_PATHS.has(ref.path)) {
          c.error(`${p}.path`, 'reserved', `${p}.path uses a reserved file name`);
        }
        // Case-insensitive: these paths collide on Windows and default macOS file systems.
        const key = ref.path.toLowerCase();
        if (seen.has(key))
          c.error(
            `${p}.path`,
            'duplicate',
            `${p}.path is duplicated (paths are compared case-insensitively)`,
          );
        seen.add(key);
      } catch (e) {
        if (!(e instanceof PathSafetyError)) throw e;
        c.error(`${p}.path`, 'unsafe-path', e.message);
      }
    }
    checkSingleLine(c, ref.description, `${p}.description`, DESCRIPTION_MAX_LENGTH);
    if (ref.appliesWhen !== undefined) {
      const ok =
        isStringArray(ref.appliesWhen) &&
        ref.appliesWhen.length > 0 &&
        ref.appliesWhen.every((s) => s.trim().length > 0 && !/[\r\n]/.test(s));
      if (!ok) {
        c.error(
          `${p}.appliesWhen`,
          'type',
          `${p}.appliesWhen must be non-empty single-line strings`,
        );
      }
    }
  });
}

function checkBudget(c: Collector, value: unknown) {
  if (value === undefined) return;
  if (!isObj(value)) {
    c.error('budget', 'type', 'budget must be an object');
    return;
  }
  for (const key of ['maxDepth', 'maxSubagents'] as const) {
    const v = value[key];
    const { min, max } = BUDGET_LIMITS[key];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
      c.error(`budget.${key}`, 'range', `budget.${key} must be an integer in [${min}, ${max}]`);
    }
  }
}

/** Validates parsed JSON and narrows it to a typed manifest. No I/O. */
export function validateManifest(input: unknown): ValidationResult {
  const c = new Collector();
  if (!isObj(input)) {
    c.error('', 'type', 'manifest must be a JSON object');
    return { issues: c.issues };
  }

  if (input.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    c.error('schemaVersion', 'schema', `schemaVersion must be ${MANIFEST_SCHEMA_VERSION}`);
  }
  checkEnum(c, input.kind, 'kind', COMPONENT_KINDS);
  checkId(c, input.id, 'id');
  if (input.name !== undefined) checkSingleLine(c, input.name, 'name', NAME_MAX_LENGTH);
  if (typeof input.version !== 'string' || !SEMVER.test(input.version)) {
    c.error('version', 'semver', 'version must be a semantic version (x.y.z)');
  }
  if (checkSingleLine(c, input.description, 'description', DESCRIPTION_MAX_LENGTH)) {
    if ((input.description as string).length > DESCRIPTION_SOFT_LIMIT) {
      c.warn(
        'description',
        'discovery-cost',
        `description over ${DESCRIPTION_SOFT_LIMIT} chars is loaded in every session; move detail to instructions`,
      );
    }
  }
  checkEnumArray(c, input.targets, 'targets', PLATFORMS, { nonEmpty: true });
  if (input.tags !== undefined && !isStringArray(input.tags)) {
    c.error('tags', 'type', 'tags must be an array of strings');
  }

  if (input.kind === 'skill') {
    checkReferences(c, input.references);
    if (input.domain !== undefined) checkEnum(c, input.domain, 'domain', SKILL_DOMAINS);
    if (input.capabilities !== undefined) {
      checkEnumArray(c, input.capabilities, 'capabilities', CAPABILITIES, { nonEmpty: true });
    }
    if (input.requires !== undefined) {
      if (!isStringArray(input.requires)) c.error('requires', 'type', 'requires must be an array');
      else {
        input.requires.forEach((s, i) => checkId(c, s, `requires[${i}]`));
        if (input.requires.includes(input.id as string)) {
          c.error('requires', 'self-dependency', 'a skill cannot require itself');
        }
      }
    }
  } else if (input.kind === 'agent') {
    checkEnum(c, input.domain, 'domain', AGENT_DOMAINS);
    checkEnum(c, input.mode, 'mode', AGENT_MODES);
    checkEnumArray(c, input.capabilities, 'capabilities', CAPABILITIES, { nonEmpty: true });
    if (input.model !== undefined) checkEnum(c, input.model, 'model', MODEL_TIERS);
    if (input.skills !== undefined) {
      if (!isStringArray(input.skills)) c.error('skills', 'type', 'skills must be an array');
      else input.skills.forEach((s, i) => checkId(c, s, `skills[${i}]`));
    }
    if (input.preloadSkills !== undefined) {
      const skills = isStringArray(input.skills) ? input.skills : [];
      if (!isStringArray(input.preloadSkills)) {
        c.error('preloadSkills', 'type', 'preloadSkills must be an array');
      } else {
        for (const s of input.preloadSkills) {
          if (!skills.includes(s)) {
            c.error(
              'preloadSkills',
              'not-in-skills',
              `preloaded skill "${s}" must also be listed in skills`,
            );
          }
        }
      }
    }
    checkBudget(c, input.budget);
    if (
      (input.mode === 'read-only' || input.mode === 'read-write') &&
      isStringArray(input.capabilities)
    ) {
      const forbidden = forbiddenCapabilities(
        input.mode,
        input.capabilities.filter((x): x is (typeof CAPABILITIES)[number] =>
          (CAPABILITIES as readonly string[]).includes(x),
        ),
      );
      if (forbidden.length > 0) {
        c.error(
          'capabilities',
          'read-only-violation',
          `read-only agents cannot request: ${forbidden.join(', ')}`,
        );
      }
    }
  }

  if (c.hasErrors) return { issues: c.issues };
  return { manifest: input as unknown as ComponentManifest, issues: c.issues };
}
