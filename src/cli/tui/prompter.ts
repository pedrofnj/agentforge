import { emitKeypressEvents } from 'node:readline';
import { CancelledError } from '../context.js';
import type { Choice, MultiselectOptions, Prompter, SelectOptions } from '../prompt.js';
import type { Style } from '../style.js';
import { keyAction, type Key, type KeyAction } from './keys.js';
import { initialListState, reduceList, type ListConfig, type ListState } from './list-state.js';
import type { Symbols } from './symbols.js';
import { ESC, fit, wrapText } from './terminal.js';

export interface TuiInput extends NodeJS.EventEmitter {
  isTTY?: boolean;
  setRawMode?: (mode: boolean) => unknown;
  resume(): unknown;
  pause(): unknown;
}

export interface TuiOutput {
  write(chunk: string): unknown;
  columns?: number | undefined;
}

export interface RenderEnv {
  st: Style;
  sym: Symbols;
  width: number;
}

function helpLine(multi: boolean, unicode: boolean): string {
  const move = unicode ? '↑/↓ move' : 'up/down move';
  const sep = unicode ? ' · ' : ', ';
  const parts = multi
    ? [move, 'space select', 'a all', 'enter confirm', 'esc cancel']
    : [move, 'enter confirm', 'esc cancel'];
  return parts.join(sep);
}

/** Pure render of a list prompt (exported for tests). */
export function renderList(
  question: string,
  choices: readonly Choice[],
  state: ListState,
  multi: boolean,
  { st, sym, width }: RenderEnv,
): string[] {
  const unicode = sym.pointer !== '>';
  const lines = [
    `${st.cyan(sym.question)} ${st.bold(fit(question, width - 2))}`,
    st.dim(`  ${fit(helpLine(multi, unicode), width - 2)}`),
  ];
  choices.forEach((c, i) => {
    const active = i === state.cursor;
    const mark = multi ? `${state.selected.has(i) ? sym.checked : sym.unchecked} ` : '';
    const reason = c.disabled ? ` (${c.disabled})` : '';
    const text = fit(`${mark}${c.label}${reason}`, width - 4);
    const pointer = active ? st.cyan(sym.pointer) : ' '.repeat(sym.pointer.length);
    let body = text;
    if (c.disabled) body = st.dim(text);
    else if (active) body = st.cyan(text);
    else if (multi && state.selected.has(i)) body = st.teal(text);
    lines.push(`  ${pointer} ${body}`);
  });
  const hint = choices[state.cursor]?.hint;
  if (hint) {
    for (const l of wrapText(hint, width - 6).slice(0, 3)) lines.push(st.dim(`      ${l}`));
  }
  if (state.error) lines.push(st.yellow(`  ${sym.warn} ${state.error}`));
  return lines;
}

export function renderConfirm(question: string, value: boolean, { st, sym }: RenderEnv): string[] {
  const yes = value ? st.cyan(st.bold('[Yes]')) : st.dim(' Yes ');
  const no = value ? st.dim(' No ') : st.cyan(st.bold('[No]'));
  return [
    `${st.cyan(sym.question)} ${st.bold(question)}  ${yes} / ${no}  ${st.dim('(y/n, enter)')}`,
  ];
}

export function renderAnswer(question: string, answer: string, { st, sym }: RenderEnv): string {
  return `${st.green(sym.ok)} ${st.bold(question)} ${st.dim(sym.arrow)} ${st.teal(answer)}`;
}

/**
 * Arrow-key prompter built on node:readline keypress events and raw mode (no
 * dependency). Ctrl+C and Esc cancel with CancelledError; the terminal is always
 * restored (raw mode off, cursor visible), also when the input ends.
 */
export function createTuiPrompter(
  input: TuiInput,
  output: TuiOutput,
  options: { style: Style; symbols: Symbols },
): Prompter {
  emitKeypressEvents(input as unknown as NodeJS.ReadableStream);
  const env = (): RenderEnv => ({
    st: options.style,
    sym: options.symbols,
    width: Math.max(20, (output.columns ?? 80) - 1),
  });
  let busy = false;
  let used = false;

  function interact<T>(
    draw: () => string[],
    onKey: (action: KeyAction | undefined) => { value: T } | 'cancel' | undefined,
    summary: (value: T) => string,
  ): Promise<T> {
    if (busy) return Promise.reject(new Error('Another prompt is active'));
    busy = true;
    used = true;
    let height = 0;
    const paint = (lines: string[]) => {
      const reset = height > 0 ? `\r${ESC.up(height - 1)}${ESC.clearDown}` : '';
      output.write(`${reset}${lines.join('\n')}`);
      height = lines.length;
    };
    return new Promise<T>((resolve, reject) => {
      const finish = (end: () => void, lastLine: string) => {
        input.off('keypress', onKeypress);
        input.off('end', onEnd);
        if (input.isTTY) input.setRawMode?.(false);
        input.pause();
        paint([lastLine]);
        output.write(`\n${ESC.showCursor}`);
        busy = false;
        end();
      };
      const cancel = (why: string) =>
        finish(
          () => reject(new CancelledError(why)),
          `${options.style.yellow(options.symbols.fail)} ${options.style.dim('Cancelled')}`,
        );
      const onEnd = () => cancel('Input closed');
      const onKeypress = (str: string | undefined, key: Key | undefined) => {
        const result = onKey(keyAction(str, key));
        if (result === 'cancel') cancel('Interrupted');
        else if (result) finish(() => resolve(result.value), summary(result.value));
        else paint(draw());
      };
      input.on('keypress', onKeypress);
      input.once('end', onEnd);
      if (input.isTTY) input.setRawMode?.(true);
      input.resume();
      output.write(ESC.hideCursor);
      paint(draw());
    });
  }

  function list(
    question: string,
    choices: readonly Choice[],
    multi: boolean,
    cursor: number,
    selected: number[],
    required: boolean,
  ): Promise<number[]> {
    const config: ListConfig = {
      count: choices.length,
      multi,
      required,
      disabled: new Set(choices.flatMap((c, i) => (c.disabled ? [i] : []))),
    };
    let state = initialListState(config, cursor, selected);
    return interact<number[]>(
      () => renderList(question, choices, state, multi, env()),
      (action) => {
        if (!action) return undefined;
        const r = reduceList(state, action, config);
        state = r.state;
        if (r.done === 'cancel') return 'cancel';
        if (r.done === 'submit')
          return { value: multi ? [...state.selected].sort((a, b) => a - b) : [state.cursor] };
        return undefined;
      },
      (picked) =>
        renderAnswer(
          question,
          picked.length === 0 ? 'none' : picked.map((i) => choices[i]!.label).join(', '),
          env(),
        ),
    );
  }

  return {
    async select<T extends string>(q: string, choices: Choice<T>[], o: SelectOptions<T> = {}) {
      if (choices.length === 0) throw new Error(`No choices for: ${q}`);
      const start = Math.max(
        0,
        choices.findIndex((c) => c.value === o.initial),
      );
      const [i] = await list(q, choices, false, start, [], true);
      return choices[i!]!.value;
    },
    async multiselect(q: string, choices: Choice[], o: MultiselectOptions = {}) {
      if (choices.length === 0) return [];
      const initial = choices.flatMap((c, i) => (o.initial?.includes(c.value) ? [i] : []));
      const picked = await list(q, choices, true, 0, initial, o.required ?? true);
      return picked.map((i) => choices[i]!.value);
    },
    confirm(q: string, defaultYes: boolean) {
      let value = defaultYes;
      return interact<boolean>(
        () => renderConfirm(q, value, env()),
        (action) => {
          if (action === 'cancel') return 'cancel';
          if (action === 'yes') return { value: true };
          if (action === 'no') return { value: false };
          if (action === 'submit') return { value };
          if (action === 'left' || action === 'right' || action === 'toggle') value = !value;
          return undefined;
        },
        (v) => renderAnswer(q, v ? 'Yes' : 'No', env()),
      );
    },
    close() {
      if (!used) return;
      if (input.isTTY) input.setRawMode?.(false);
      input.pause();
      output.write(ESC.showCursor);
    },
  };
}
