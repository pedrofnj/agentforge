import type { Style } from '../style.js';
import { stripAnsi } from '../style.js';
import { symbolsFor, type Symbols } from './symbols.js';

export type Level = 'ok' | 'warn' | 'fail' | 'info';

/** Status line: glyph + text label, so meaning never depends on color or glyph alone. */
export function statusLine(level: Level, message: string, st: Style, sym: Symbols): string {
  switch (level) {
    case 'ok':
      return `${st.green(`${sym.ok} OK  `)} ${message}`;
    case 'warn':
      return `${st.yellow(`${sym.warn} WARN`)} ${message}`;
    case 'fail':
      return `${st.red(`${sym.fail} FAIL`)} ${message}`;
    default:
      return `${st.cyan(`${sym.info} INFO`)} ${message}`;
  }
}

/** Section heading used by the wizard and summaries. */
export const heading = (title: string, st: Style): string => `\n${st.bold(st.purple(title))}`;

/** Two-column key/value rows, aligned on the plain-text width of the keys. */
export function rows(pairs: Array<[string, string]>, st: Style, indent = '  '): string[] {
  const w = Math.max(...pairs.map(([k]) => k.length));
  return pairs.map(([k, v]) => `${indent}${st.dim(k.padEnd(w))}  ${v}`);
}

/** Box around lines (used for the banner and the final summary). */
export function box(lines: string[], st: Style, unicode: boolean): string[] {
  const { box: b } = symbolsFor(unicode);
  const width = Math.max(...lines.map((l) => stripAnsi(l).length));
  const edge = (l: string, r: string) => st.teal(`${l}${b.h.repeat(width + 2)}${r}`);
  return [
    edge(b.tl, b.tr),
    ...lines.map(
      (l) => `${st.teal(b.v)} ${l}${' '.repeat(width - stripAnsi(l).length)} ${st.teal(b.v)}`,
    ),
    edge(b.bl, b.br),
  ];
}

/** Product banner: shown only on an interactive terminal. */
export function banner(version: string, st: Style, unicode: boolean): string[] {
  const mark = unicode ? '◆' : '*';
  const name = `${st.bold(st.cyan('Agent'))}${st.bold(st.purple('Forge'))}`;
  return box(
    [
      `${st.teal(mark)} ${name} ${st.dim(`v${version}`)}`,
      st.dim('Read-only review agents and skills for Claude Code and Codex'),
    ],
    st,
    unicode,
  );
}
