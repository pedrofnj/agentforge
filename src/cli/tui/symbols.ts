/**
 * Glyphs for the interactive UI. Unicode only where the terminal is known to
 * render it; ASCII otherwise. Symbols always sit next to a word, so meaning
 * never depends on a glyph or a color alone.
 */
export interface Symbols {
  pointer: string;
  checked: string;
  unchecked: string;
  ok: string;
  warn: string;
  fail: string;
  info: string;
  bullet: string;
  arrow: string;
  question: string;
  bar: { full: string; empty: string };
  box: { tl: string; tr: string; bl: string; br: string; h: string; v: string };
  spinner: string[];
}

export const UNICODE_SYMBOLS: Symbols = {
  pointer: '❯',
  checked: '◉',
  unchecked: '◯',
  ok: '✔',
  warn: '▲',
  fail: '✖',
  info: '●',
  bullet: '•',
  arrow: '→',
  question: '?',
  bar: { full: '█', empty: '░' },
  box: { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' },
  spinner: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
};

export const ASCII_SYMBOLS: Symbols = {
  pointer: '>',
  checked: '[x]',
  unchecked: '[ ]',
  ok: '+',
  warn: '!',
  fail: 'x',
  info: '*',
  bullet: '-',
  arrow: '->',
  question: '?',
  bar: { full: '#', empty: '-' },
  box: { tl: '+', tr: '+', bl: '+', br: '+', h: '-', v: '|' },
  spinner: ['-', '\\', '|', '/'],
};

/** Conservative detection: legacy Windows consoles and the Linux VT get ASCII. */
export function unicodeSupported(
  platform: NodeJS.Platform,
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  if (env.AGENTFORGE_ASCII === '1') return false;
  if (platform !== 'win32') return env.TERM !== 'linux';
  return Boolean(
    env.WT_SESSION ||
    env.TERM_PROGRAM === 'vscode' ||
    env.TERMINAL_EMULATOR === 'JetBrains-JediTerm' ||
    env.ConEmuTask ||
    env.TERM === 'xterm-256color',
  );
}

export const symbolsFor = (unicode: boolean): Symbols =>
  unicode ? UNICODE_SYMBOLS : ASCII_SYMBOLS;
