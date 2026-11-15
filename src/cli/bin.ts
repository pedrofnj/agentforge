#!/usr/bin/env node
import { homedir } from 'node:os';
import { run } from './index.js';
import { createReadlinePrompter, type Prompter } from './prompt.js';
import { colorEnabled, createStyle } from './style.js';
import { createTuiPrompter } from './tui/prompter.js';
import { symbolsFor, unicodeSupported } from './tui/symbols.js';
import { ESC, type Terminal } from './tui/terminal.js';

const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
const style = createStyle(colorEnabled(Boolean(process.stdout.isTTY), process.env));
const unicode = unicodeSupported(process.platform, process.env);

/**
 * A closed pipe (e.g. `agentforge list | head`) must not crash the process,
 * least of all in the middle of an install: drop further output instead.
 */
function safeWriter(stream: NodeJS.WriteStream): (line: string) => void {
  let closed = false;
  stream.on('error', (e: NodeJS.ErrnoException) => {
    if (e.code === 'EPIPE') closed = true;
    else throw e;
  });
  return (line) => {
    if (!closed) stream.write(`${line}\n`);
  };
}

/**
 * Arrow-key prompts need raw mode; AGENTFORGE_SIMPLE_PROMPTS=1 (or a terminal
 * without raw mode) falls back to numbered menus, which also suit screen readers.
 */
function prompter(): Prompter | undefined {
  if (!interactive) return undefined;
  const simple =
    process.env.AGENTFORGE_SIMPLE_PROMPTS === '1' || typeof process.stdin.setRawMode !== 'function';
  return simple
    ? createReadlinePrompter(process.stdin, process.stdout)
    : createTuiPrompter(process.stdin, process.stdout, { style, symbols: symbolsFor(unicode) });
}

const terminal: Terminal | undefined = interactive
  ? {
      write: (chunk) => void process.stdout.write(chunk),
      get columns() {
        return process.stdout.columns;
      },
      unicode,
    }
  : undefined;

// Ctrl+C outside a prompt (prompts handle it themselves in raw mode): restore the
// terminal and exit. An interrupted install leaves a journal that the next run
// rolls back before doing anything else.
process.once('SIGINT', () => {
  if (interactive) process.stdout.write(`${ESC.clearLine}${ESC.showCursor}`);
  process.stderr.write(
    '\nInterrupted. Any partial change is rolled back automatically on the next run.\n',
  );
  process.exit(130);
});

process.exitCode = await run(process.argv.slice(2), {
  out: safeWriter(process.stdout),
  err: safeWriter(process.stderr),
  homeDir: homedir(),
  cwd: process.cwd(),
  env: process.env,
  osPlatform: process.platform,
  interactive,
  style,
  ...(terminal ? { terminal } : {}),
  ...(interactive ? { prompter: prompter()! } : {}),
});
