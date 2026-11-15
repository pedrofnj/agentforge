import { constants } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ADAPTERS } from '../adapters/index.js';
import { PLATFORMS, type InstallScope, type Platform } from '../core/types.js';
import { readJournal } from '../installer/apply.js';
import {
  locationDir,
  readState,
  stateDirFor,
  type InstallEnvironment,
} from '../installer/state.js';
import { findGitRoot } from './context.js';

/** Executable names looked up on PATH. Only looked up, never executed. */
export const CLIENT_EXECUTABLES: Record<Platform, string> = {
  'claude-code': 'claude',
  codex: 'codex',
};

export interface ClientInfo {
  platform: Platform;
  displayName: string;
  /** Absolute path of the executable found on PATH, if any. */
  executable?: string;
  /** User config dir (~/.claude, CODEX_HOME or ~/.codex). */
  configDir: string;
  configDirExists: boolean;
  /** Found on PATH or has a user config dir. */
  detected: boolean;
}

export interface ScopeInfo {
  scope: InstallScope;
  stateDir: string;
  /** Managed components per platform. */
  components: Record<Platform, number>;
  pendingJournal: boolean;
  error?: string;
}

export interface DetectedEnvironment {
  os: string;
  node: { version: string; supported: boolean };
  cwd: string;
  gitRoot?: string;
  cwdIsHome: boolean;
  clients: Record<Platform, ClientInfo>;
  scopes: Record<InstallScope, ScopeInfo>;
}

const isFile = (p: string) =>
  stat(p).then(
    (s) => s.isFile(),
    () => false,
  );
const isDir = (p: string) =>
  stat(p).then(
    (s) => s.isDirectory(),
    () => false,
  );

/**
 * PATH lookup like `which`/`where`, without spawning anything. On Windows the
 * PATHEXT extensions are tried; elsewhere the file must be executable.
 */
export async function findExecutable(
  name: string,
  env: Readonly<Record<string, string | undefined>>,
  platform: NodeJS.Platform,
): Promise<string | undefined> {
  const win = platform === 'win32';
  const pathVar = env.PATH ?? env.Path ?? env.path ?? '';
  const dirs = pathVar.split(win ? ';' : ':').filter((d) => d.trim() !== '');
  const exts = win ? (env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean) : [''];
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path.join(dir.replace(/^"(.*)"$/, '$1'), name + ext.toLowerCase());
      if (!(await isFile(candidate))) continue;
      if (win) return candidate;
      try {
        await access(candidate, constants.X_OK);
        return candidate;
      } catch {
        // not executable: keep looking
      }
    }
  }
  return undefined;
}

export function clientConfigDir(platform: Platform, e: InstallEnvironment): string {
  return platform === 'codex'
    ? e.env.CODEX_HOME || path.join(e.homeDir, '.codex')
    : path.join(e.homeDir, '.claude');
}

/** Nearest existing ancestor of a path (the directory that would be created under). */
export async function nearestExisting(p: string): Promise<string> {
  let current = path.resolve(p);
  for (;;) {
    if (
      await stat(current).then(
        () => true,
        () => false,
      )
    )
      return current;
    const parent = path.dirname(current);
    if (parent === current) return current;
    current = parent;
  }
}

/** True when the path, or the directory it would be created in, is writable. */
export async function canWrite(p: string): Promise<boolean> {
  try {
    await access(await nearestExisting(p), constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/** Every directory an operation in this scope may write to, for the given clients. */
export function scopeTargets(
  scope: InstallScope,
  platforms: readonly Platform[],
  e: InstallEnvironment,
): string[] {
  const dirs = platforms.flatMap((p) =>
    (['skills', 'agents'] as const).map((loc) => locationDir(p, loc, scope, e)),
  );
  return [...new Set([...dirs, stateDirFor(scope, e)])];
}

/** Paths in this scope that are not writable (empty when everything is fine). */
export async function unwritable(
  scope: InstallScope,
  platforms: readonly Platform[],
  e: InstallEnvironment,
): Promise<string[]> {
  const out: string[] = [];
  for (const dir of scopeTargets(scope, platforms, e)) if (!(await canWrite(dir))) out.push(dir);
  return out;
}

function osLabel(platform: NodeJS.Platform): string {
  const names: Partial<Record<NodeJS.Platform, string>> = {
    win32: 'Windows',
    darwin: 'macOS',
    linux: 'Linux',
  };
  const name = names[platform] ?? platform;
  return platform === process.platform ? `${name} ${os.release()} (${os.arch()})` : name;
}

/** Read-only snapshot of the machine: nothing is executed or written. */
export async function detectEnvironment(e: InstallEnvironment): Promise<DetectedEnvironment> {
  const clients = {} as Record<Platform, ClientInfo>;
  for (const platform of PLATFORMS) {
    const executable = await findExecutable(CLIENT_EXECUTABLES[platform], e.env, e.osPlatform);
    const configDir = clientConfigDir(platform, e);
    const configDirExists = await isDir(configDir);
    clients[platform] = {
      platform,
      displayName: ADAPTERS[platform].displayName,
      ...(executable ? { executable } : {}),
      configDir,
      configDirExists,
      detected: Boolean(executable) || configDirExists,
    };
  }
  const scopes = {} as Record<InstallScope, ScopeInfo>;
  for (const scope of ['global', 'project'] as const) {
    const stateDir = stateDirFor(scope, e);
    const components = Object.fromEntries(PLATFORMS.map((p) => [p, 0])) as Record<Platform, number>;
    const info: ScopeInfo = { scope, stateDir, components, pendingJournal: false };
    try {
      info.pendingJournal = (await readJournal(stateDir)) !== null;
      for (const c of (await readState(stateDir)).components) components[c.platform]++;
    } catch (err) {
      info.error = (err as Error).message;
    }
    scopes[scope] = info;
  }
  const gitRoot = await findGitRoot(e.cwd);
  const major = Number(process.versions.node.split('.')[0]);
  return {
    os: osLabel(e.osPlatform),
    node: { version: process.versions.node, supported: major >= 22 },
    cwd: e.cwd,
    ...(gitRoot ? { gitRoot } : {}),
    cwdIsHome: path.resolve(e.cwd) === path.resolve(e.homeDir),
    clients,
    scopes,
  };
}
