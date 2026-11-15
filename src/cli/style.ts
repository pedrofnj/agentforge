/**
 * Minimal ANSI styling with no dependency. Colors are off unless the output is
 * a terminal, and always off with NO_COLOR or TERM=dumb (FORCE_COLOR turns them
 * on), so pipelines and CI logs stay plain text.
 */
export interface Style {
  bold(s: string): string;
  dim(s: string): string;
  green(s: string): string;
  yellow(s: string): string;
  red(s: string): string;
  cyan(s: string): string;
}

const wrap = (open: number, close: number) => (s: string) => `\x1b[${open}m${s}\x1b[${close}m`;

export const plainStyle: Style = {
  bold: (s) => s,
  dim: (s) => s,
  green: (s) => s,
  yellow: (s) => s,
  red: (s) => s,
  cyan: (s) => s,
};

const ansiStyle: Style = {
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  green: wrap(32, 39),
  yellow: wrap(33, 39),
  red: wrap(31, 39),
  cyan: wrap(36, 39),
};

export function colorEnabled(
  isTTY: boolean,
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') return false;
  if (env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== '0') return true;
  return isTTY && env.TERM !== 'dumb';
}

export const createStyle = (enabled: boolean): Style => (enabled ? ansiStyle : plainStyle);
