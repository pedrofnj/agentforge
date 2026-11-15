import path from 'node:path';

export class PathSafetyError extends Error {
  override name = 'PathSafetyError';
}

/**
 * Validates a path declared inside a manifest. Canonical paths are portable:
 * relative, forward slashes only, no `..`, no drive letters, no NUL bytes.
 */
export function assertSafeRelativePath(p: string): void {
  if (p.length === 0) throw new PathSafetyError('Path is empty');
  if (p.includes('\0')) throw new PathSafetyError(`Path contains NUL byte: ${JSON.stringify(p)}`);
  if (p.includes('\\')) throw new PathSafetyError(`Path must use forward slashes: ${p}`);
  if (p.startsWith('/') || /^[A-Za-z]:/.test(p) || path.isAbsolute(p)) {
    throw new PathSafetyError(`Path must be relative: ${p}`);
  }
  if (p.split('/').some((seg) => seg === '..')) {
    throw new PathSafetyError(`Path must not contain "..": ${p}`);
  }
  // Portability rules that matter on Windows: no control characters, no ':'
  // (drive-relative paths and NTFS alternate data streams), no reserved device
  // names, and no segment ending in '.' or ' ' (Windows strips them, so two
  // different paths would alias the same file).
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f:*?"<>|]/.test(p)) {
    throw new PathSafetyError(
      `Path contains a character that is not portable: ${JSON.stringify(p)}`,
    );
  }
  for (const seg of p.split('/')) {
    if (seg === '') throw new PathSafetyError(`Path has an empty segment: ${p}`);
    if (/[. ]$/.test(seg) && seg !== '.') {
      throw new PathSafetyError(`Path segment must not end with "." or " ": ${p}`);
    }
    if (WINDOWS_RESERVED.test(seg)) {
      throw new PathSafetyError(`Path uses a reserved Windows device name: ${p}`);
    }
  }
}

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;

/**
 * Resolves `relative` under `root` and guarantees the result stays inside it.
 * Lexical check only: callers that write files must also check symlinks.
 */
export function resolveInside(root: string, relative: string): string {
  assertSafeRelativePath(relative);
  const base = path.resolve(root);
  const resolved = path.resolve(base, relative);
  const rel = path.relative(base, resolved);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new PathSafetyError(`Path escapes root: ${relative}`);
  }
  return resolved;
}
