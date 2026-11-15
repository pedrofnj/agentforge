/**
 * Minimal ANSI styling with no dependency. Colors are off unless the output is
 * a terminal, and always off with NO_COLOR or TERM=dumb (FORCE_COLOR turns them
 * on), so pipelines and CI logs stay plain text. Color never carries meaning on
 * its own: every colored status also has a text label (OK, WARN, FAIL...).
 */
export interface Style {
  bold(s: string): string;
  dim(s: string): string;
  green(s: string): string;
  yellow(s: string): string;
  red(s: string): string;
  cyan(s: string): string;
  /** Brand accents (256-color palette; terminals without it fall back to the default color). */
  teal(s: string): string;
  purple(s: string): string;
  /** Whether escapes are emitted (callers use it to skip decoration). */
  readonly enabled: boolean;
}

const wrap = (open: string, close: number) => (s: string) => `\x1b[${open}m${s}\x1b[${close}m`;
const id = (s: string) => s;

export const plainStyle: Style = {
  bold: id,
  dim: id,
  green: id,
  yellow: id,
  red: id,
  cyan: id,
  teal: id,
  purple: id,
  enabled: false,
};

const ansiStyle: Style = {
  bold: wrap('1', 22),
  dim: wrap('2', 22),
  green: wrap('32', 39),
  yellow: wrap('33', 39),
  red: wrap('31', 39),
  cyan: wrap('36', 39),
  teal: wrap('38;5;37', 39),
  purple: wrap('38;5;141', 39),
  enabled: true,
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

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;

/** Text without escape sequences (for measuring and for tests). */
export const stripAnsi = (s: string): string => s.replace(ANSI, '');
