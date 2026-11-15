import type { Style } from '../style.js';
import { symbolsFor } from './symbols.js';
import { ESC, fit, type Terminal } from './terminal.js';

export interface Progress {
  /** Real progress: `done` of `total` steps finished; label describes the current step. */
  update(done: number, total: number, label: string): void;
  /** Stops the animation and clears the live line. */
  stop(): void;
}

const NOOP: Progress = { update: () => undefined, stop: () => undefined };

/** Pure render of the progress line (exported for tests). */
export function renderProgress(
  frame: string,
  done: number,
  total: number,
  label: string,
  st: Style,
  unicode: boolean,
  width: number,
): string {
  const sym = symbolsFor(unicode);
  const size = 20;
  const filled = total > 0 ? Math.round((done / total) * size) : size;
  const bar = st.teal(sym.bar.full.repeat(filled)) + st.dim(sym.bar.empty.repeat(size - filled));
  const count = `${done}/${total}`;
  const room = Math.max(10, width - size - count.length - 6);
  return `${st.cyan(frame)} ${bar} ${count} ${st.dim(fit(label, room))}`;
}

/**
 * Spinner plus progress bar on a single live line. Only on a terminal: without
 * one it does nothing and callers print plain result lines instead.
 */
export function createProgress(terminal: Terminal | undefined, st: Style): Progress {
  if (!terminal) return NOOP;
  const frames = symbolsFor(terminal.unicode).spinner;
  let frame = 0;
  let last = { done: 0, total: 0, label: '' };
  const width = () => Math.max(30, (terminal.columns ?? 80) - 1);
  const draw = () =>
    terminal.write(
      `${ESC.clearLine}${renderProgress(frames[frame % frames.length]!, last.done, last.total, last.label, st, terminal.unicode, width())}`,
    );
  const timer = setInterval(() => {
    frame++;
    draw();
  }, 80);
  timer.unref();
  terminal.write(ESC.hideCursor);
  return {
    update(done, total, label) {
      last = { done, total, label };
      draw();
    },
    stop() {
      clearInterval(timer);
      terminal.write(`${ESC.clearLine}${ESC.showCursor}`);
    },
  };
}
