import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertSafeRelativePath, PathSafetyError, resolveInside } from '../../src/core/paths.js';
import { forbiddenCapabilities } from '../../src/core/policy.js';
import { estimateTokens } from '../../src/core/tokens.js';

describe('path safety', () => {
  it.each(['references/a.md', 'a.md', 'dir/sub/file.md'])('accepts %s', (p) => {
    expect(() => assertSafeRelativePath(p)).not.toThrow();
  });

  it.each([
    '',
    '../x.md',
    'a/../../x.md',
    '/etc/passwd',
    'C:/Windows/x',
    'c:x',
    'a\\b.md',
    '..\\x',
    'a\0b',
  ])('rejects %j', (p) => {
    expect(() => assertSafeRelativePath(p)).toThrow(PathSafetyError);
  });

  it('resolves inside the root and refuses the root itself', () => {
    const root = path.resolve('some-root');
    expect(resolveInside(root, 'a/b.md')).toBe(path.join(root, 'a', 'b.md'));
    expect(() => resolveInside(root, '.')).toThrow(PathSafetyError);
    expect(() => resolveInside(root, 'a/../..')).toThrow(PathSafetyError);
  });
});

describe('policy', () => {
  it('forbids write capabilities in read-only mode only', () => {
    expect(forbiddenCapabilities('read-only', ['read', 'edit', 'shell', 'web'])).toEqual([
      'edit',
      'shell',
    ]);
    expect(forbiddenCapabilities('read-write', ['edit', 'shell'])).toEqual([]);
  });
});

describe('token estimates', () => {
  it('is always labeled as an estimate', () => {
    expect(estimateTokens('12345678')).toEqual({
      tokens: 2,
      source: 'estimated',
      method: 'chars/4 heuristic',
    });
  });
});
