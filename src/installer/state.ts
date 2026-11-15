import path from 'node:path';
import { ADAPTERS } from '../adapters/index.js';
import type { ArtifactLocation, ResolveContext } from '../adapters/types.js';
import { assertSafeRelativePath, resolveInside } from '../core/paths.js';
import {
  COMPONENT_KINDS,
  PLATFORMS,
  type ComponentKind,
  type InstallScope,
  type Platform,
} from '../core/types.js';
import { atomicWrite, readIfExists } from './fs-safe.js';

/** Everything the installer needs from the outside world, injected for testability. */
export interface InstallEnvironment {
  homeDir: string;
  cwd: string;
  env: Readonly<Record<string, string | undefined>>;
  osPlatform: NodeJS.Platform;
}

export const STATE_FILE = 'manifest.json';
export const JOURNAL_FILE = 'journal.json';
export const BACKUP_DIR = 'backups';
export const PRESERVED_DIR = 'overwritten';
export const STATE_SCHEMA_VERSION = 1;

/** Paths are relative to the client's location dir for the scope, never absolute. */
export interface ManagedFile {
  location: ArtifactLocation;
  path: string;
  sha256: string;
}

export interface ManagedComponent {
  platform: Platform;
  id: string;
  kind: ComponentKind;
  version: string;
  /** Skills this component depends on (for uninstall warnings). */
  requires?: string[];
  files: ManagedFile[];
}

export interface StateManifest {
  schemaVersion: typeof STATE_SCHEMA_VERSION;
  components: ManagedComponent[];
}

export class StateError extends Error {
  override name = 'StateError';
}

export const emptyState = (): StateManifest => ({
  schemaVersion: STATE_SCHEMA_VERSION,
  components: [],
});

/**
 * Where AgentForge keeps its own manifest, journal and backups. Never inside a
 * client's config dir. Global: per-OS user state dir (or AGENTFORGE_HOME).
 */
export function stateDirFor(scope: InstallScope, e: InstallEnvironment): string {
  if (scope === 'project') return path.join(e.cwd, '.agentforge');
  if (e.env.AGENTFORGE_HOME) return path.resolve(e.env.AGENTFORGE_HOME);
  switch (e.osPlatform) {
    case 'win32':
      return path.join(
        e.env.LOCALAPPDATA || path.join(e.homeDir, 'AppData', 'Local'),
        'agentforge',
      );
    case 'darwin':
      return path.join(e.homeDir, 'Library', 'Application Support', 'agentforge');
    default:
      return path.join(
        e.env.XDG_STATE_HOME || path.join(e.homeDir, '.local', 'state'),
        'agentforge',
      );
  }
}

export function resolveContext(scope: InstallScope, e: InstallEnvironment): ResolveContext {
  return { scope, homeDir: e.homeDir, projectRoot: e.cwd, env: e.env };
}

export function locationDir(
  platform: Platform,
  location: ArtifactLocation,
  scope: InstallScope,
  e: InstallEnvironment,
): string {
  return ADAPTERS[platform].resolveLocation(location, resolveContext(scope, e));
}

/** Absolute path of a managed file; confined to its location dir. */
export function managedFilePath(
  platform: Platform,
  file: Pick<ManagedFile, 'location' | 'path'>,
  scope: InstallScope,
  e: InstallEnvironment,
): { root: string; abs: string } {
  const root = locationDir(platform, file.location, scope, e);
  return { root, abs: resolveInside(root, file.path) };
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Strict parse: a tampered or corrupt manifest stops the operation. */
export function parseState(text: string, source: string): StateManifest {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new StateError(`${source}: invalid JSON (${(e as Error).message})`);
  }
  const fail = (msg: string): never => {
    throw new StateError(`${source}: ${msg}`);
  };
  if (!isObj(raw) || raw.schemaVersion !== STATE_SCHEMA_VERSION || !Array.isArray(raw.components)) {
    fail('unsupported or malformed state manifest');
  }
  const seen = new Set<string>();
  for (const c of (raw as { components: unknown[] }).components) {
    if (!isObj(c)) fail('component entry must be an object');
    const comp = c as Record<string, unknown>;
    if (!(PLATFORMS as readonly unknown[]).includes(comp.platform)) fail('unknown platform');
    if (!(COMPONENT_KINDS as readonly unknown[]).includes(comp.kind)) fail('unknown kind');
    if (typeof comp.id !== 'string' || typeof comp.version !== 'string') fail('missing id/version');
    const key = `${comp.platform as string}/${comp.id as string}`;
    if (seen.has(key)) fail(`duplicate component ${key}`);
    seen.add(key);
    if (comp.requires !== undefined) {
      const ok = Array.isArray(comp.requires) && comp.requires.every((r) => typeof r === 'string');
      if (!ok) fail(`${key}: requires must be an array of strings`);
    }
    if (!Array.isArray(comp.files)) fail(`${key}: files must be an array`);
    for (const f of comp.files as unknown[]) {
      if (!isObj(f) || (f.location !== 'skills' && f.location !== 'agents')) {
        fail(`${key}: invalid file location`);
      }
      const file = f as Record<string, unknown>;
      if (typeof file.path !== 'string' || typeof file.sha256 !== 'string') {
        fail(`${key}: invalid file entry`);
      }
      try {
        assertSafeRelativePath(file.path as string);
      } catch (e) {
        fail(`${key}: ${(e as Error).message}`);
      }
      if (!/^[0-9a-f]{64}$/.test(file.sha256 as string)) fail(`${key}: invalid sha256`);
    }
  }
  return raw as unknown as StateManifest;
}

export async function readState(stateDir: string): Promise<StateManifest> {
  const file = path.join(stateDir, STATE_FILE);
  const text = await readIfExists(file);
  return text === null ? emptyState() : parseState(text, file);
}

export const serializeState = (s: StateManifest): string => `${JSON.stringify(s, null, 2)}\n`;

export async function writeState(stateDir: string, s: StateManifest): Promise<void> {
  await atomicWrite(path.join(stateDir, STATE_FILE), serializeState(s));
}

export const componentKey = (c: { platform: Platform; id: string }) => `${c.platform}/${c.id}`;
