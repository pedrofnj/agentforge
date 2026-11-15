import { createHash } from 'node:crypto';
import { lstat, mkdir, open, readFile, rename, rm, rmdir } from 'node:fs/promises';
import path from 'node:path';
import { PathSafetyError } from '../core/paths.js';

export const sha256 = (data: string | Uint8Array): string =>
  createHash('sha256').update(data).digest('hex');

export type PathStatus =
  | { kind: 'missing' }
  | { kind: 'file'; sha256: string }
  /** The target or a directory between root and target is a symbolic link (or junction). */
  | { kind: 'symlink' }
  /** The target is not a regular file, or an ancestor is not a directory. */
  | { kind: 'not-a-file' };

const isErrno = (e: unknown, code: string) => (e as NodeJS.ErrnoException)?.code === code;

/** Throws unless `target` is strictly inside `root` (lexically). */
export function assertInside(root: string, target: string): string {
  const rel = path.relative(root, target);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new PathSafetyError(`Path escapes install root: ${target}`);
  }
  return rel;
}

/**
 * Inspects `target` without following links below `root`. The root itself may
 * be a link (users often symlink config dirs); anything beneath it may not.
 */
export async function inspectPath(root: string, target: string): Promise<PathStatus> {
  const segments = assertInside(root, target).split(path.sep);
  let current = root;
  for (const [i, segment] of segments.entries()) {
    current = path.join(current, segment);
    let st;
    try {
      st = await lstat(current);
    } catch (e) {
      if (isErrno(e, 'ENOENT')) return { kind: 'missing' };
      if (isErrno(e, 'ENOTDIR')) return { kind: 'not-a-file' };
      throw e;
    }
    if (st.isSymbolicLink()) return { kind: 'symlink' };
    const last = i === segments.length - 1;
    if (!last && !st.isDirectory()) return { kind: 'not-a-file' };
    if (last) {
      if (!st.isFile()) return { kind: 'not-a-file' };
      return { kind: 'file', sha256: sha256(await readFile(current)) };
    }
  }
  return { kind: 'missing' };
}

/** Directories that `mkdir -p dir` would create, outermost first. */
export async function missingDirs(dir: string): Promise<string[]> {
  const missing: string[] = [];
  let current = path.resolve(dir);
  for (;;) {
    try {
      await lstat(current);
      break;
    } catch (e) {
      if (!isErrno(e, 'ENOENT')) throw e;
      missing.unshift(current);
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  return missing;
}

export const tempPathFor = (target: string) => `${target}.agentforge-tmp`;

/** Write to a sibling temp file, fsync, then rename over the target. */
export async function atomicWrite(target: string, content: string | Uint8Array): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true });
  const tmp = tempPathFor(target);
  await rm(tmp, { force: true });
  const handle = await open(tmp, 'wx');
  try {
    await handle.writeFile(content);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(tmp, target);
  } catch (e) {
    await rm(tmp, { force: true });
    throw e;
  }
}

/** Removes empty directories from `dir` up to (not including) `stopAt`. */
export async function pruneEmptyDirs(dir: string, stopAt: string): Promise<void> {
  let current = dir;
  for (;;) {
    const rel = path.relative(stopAt, current);
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return;
    try {
      await rmdir(current);
    } catch {
      return; // not empty, missing or not removable: stop quietly
    }
    current = path.dirname(current);
  }
}

export async function readIfExists(file: string): Promise<string | null> {
  try {
    return await readFile(file, 'utf8');
  } catch (e) {
    if (isErrno(e, 'ENOENT')) return null;
    throw e;
  }
}
