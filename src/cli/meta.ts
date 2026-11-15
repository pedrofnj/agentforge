import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/** Package root: two levels above this file in both `src/cli` and `dist/cli`. */
export const PACKAGE_ROOT = fileURLToPath(new URL('../../', import.meta.url));

let cached: string | undefined;

export function packageVersion(): string {
  cached ??= (
    JSON.parse(readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8')) as {
      version: string;
    }
  ).version;
  return cached;
}
