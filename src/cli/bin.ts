#!/usr/bin/env node
import { homedir } from 'node:os';
import { run } from './index.js';
import { createReadlinePrompter } from './prompt.js';
import { colorEnabled, createStyle } from './style.js';

const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

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

process.exitCode = await run(process.argv.slice(2), {
  out: safeWriter(process.stdout),
  err: safeWriter(process.stderr),
  homeDir: homedir(),
  cwd: process.cwd(),
  env: process.env,
  osPlatform: process.platform,
  interactive,
  style: createStyle(colorEnabled(Boolean(process.stdout.isTTY), process.env)),
  ...(interactive ? { prompter: createReadlinePrompter(process.stdin, process.stdout) } : {}),
});
