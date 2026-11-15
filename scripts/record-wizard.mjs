// Records the interactive install wizard: the real CLI (dist/) runs with the real
// arrow-key prompter, fed by scripted keystrokes through a fake terminal, in a
// temporary project with an isolated home. The transcript is what the terminal
// shows at the end (redraws applied, colors removed, temporary paths shortened).
// Usage: npm run build && node scripts/record-wizard.mjs
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { PassThrough } from 'node:stream';
import { clearInterval, setInterval } from 'node:timers';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const load = (rel) => import(pathToFileURL(path.join(root, 'dist', 'cli', rel)).href);
const { run } = await load('index.js');
const { createTuiPrompter } = await load('tui/prompter.js');
const { plainStyle } = await load('style.js');
const { UNICODE_SYMBOLS } = await load('tui/symbols.js');

const tmp = mkdtempSync(path.join(tmpdir(), 'agentforge-wizard-'));
const home = path.join(tmp, 'home');
const project = path.join(tmp, 'my-app');
mkdirSync(home);
mkdirSync(path.join(project, '.git'), { recursive: true });
mkdirSync(path.join(home, '.claude'));

/** Minimal screen: applies \r, \n, cursor-up and clear-down/line like a terminal. */
function screen() {
  const lines = [''];
  let row = 0;
  let col = 0;
  return {
    write(chunk) {
      // eslint-disable-next-line no-control-regex
      const re = /\x1b\[(\??)(\d*)([A-Za-z])|\r|\n|[^\x1b\r\n]+/g;
      for (const m of chunk.matchAll(re)) {
        const t = m[0];
        if (t === '\r') col = 0;
        else if (t === '\n') {
          row++;
          col = 0;
          if (lines.length <= row) lines.push('');
        } else if (t.startsWith('\x1b')) {
          const n = Number(m[2] || 1);
          if (m[3] === 'A') row = Math.max(0, row - n);
          else if (m[3] === 'J') {
            lines[row] = lines[row].slice(0, col);
            lines.length = row + 1;
          } else if (m[3] === 'K') lines[row] = '';
        } else {
          const line = lines[row].padEnd(col);
          lines[row] = line.slice(0, col) + t + line.slice(col + t.length);
          col += t.length;
        }
      }
    },
    text: () => lines.join('\n'),
  };
}

const term = screen();
const input = Object.assign(new PassThrough(), { isTTY: true, setRawMode: () => input });
const KEYS = { down: '\x1b[B', space: ' ', enter: '\r' };
// Claude Code (detected) -> Project -> select appsec-auditor and code-quality-reviewer
// -> no extra skills -> apply.
const script = [
  KEYS.enter,
  KEYS.enter,
  KEYS.down,
  KEYS.down,
  KEYS.down,
  KEYS.space,
  KEYS.down,
  KEYS.space,
  KEYS.enter,
  KEYS.enter,
  'y',
];
let step = 0;
const pump = setInterval(() => {
  if (step < script.length) input.write(script[step++]);
}, 15);

const env = {
  PATH: '',
  LOCALAPPDATA: path.join(tmp, 'state'),
  XDG_STATE_HOME: path.join(tmp, 'state'),
};
const out = (l) => term.write(`${l}\n`);
let code;
try {
  code = await run(['install'], {
    out,
    err: out,
    homeDir: home,
    cwd: project,
    env,
    osPlatform: process.platform,
    interactive: true,
    style: plainStyle,
    terminal: { write: (c) => term.write(c), columns: 100, unicode: true },
    prompter: createTuiPrompter(
      input,
      { write: (c) => term.write(c), columns: 100 },
      {
        style: plainStyle,
        symbols: UNICODE_SYMBOLS,
      },
    ),
  });
} finally {
  clearInterval(pump);
  rmSync(tmp, { recursive: true, force: true });
}
const clean = (s) =>
  s
    .split(project)
    .join('~/my-app')
    .split(home)
    .join('~')
    .split(tmp)
    .join('/tmp/agentforge-demo')
    .replace(/^(\s*System\s+).*$/m, '$1<your OS>')
    .replace(/(Node\.js\s+)\d+\.\d+\.\d+/, '$1<your Node.js>')
    .replace(/\\/g, '/');
/** Re-pads box lines after paths were shortened. */
function rebox(text) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('╭')) continue;
    let end = i;
    while (end < lines.length && !lines[end].startsWith('╰')) end++;
    const body = lines.slice(i + 1, end).map((l) => l.slice(2).replace(/\s*│$/, ''));
    const w = Math.max(...body.map((l) => l.length));
    lines[i] = `╭${'─'.repeat(w + 2)}╮`;
    body.forEach((l, k) => (lines[i + 1 + k] = `│ ${l.padEnd(w)} │`));
    lines[end] = `╰${'─'.repeat(w + 2)}╯`;
    i = end;
  }
  return lines.join('\n');
}
process.stdout.write(
  `$ agentforge install\n${rebox(clean(term.text())).trimEnd()}\n(exit ${code})\n`,
);
