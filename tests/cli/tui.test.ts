import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { CancelledError } from '../../src/cli/context.js';
import { createStyle, plainStyle, stripAnsi } from '../../src/cli/style.js';
import { keyAction } from '../../src/cli/tui/keys.js';
import { initialListState, reduceList, type ListConfig } from '../../src/cli/tui/list-state.js';
import { createProgress, renderProgress } from '../../src/cli/tui/progress.js';
import { createTuiPrompter, renderList } from '../../src/cli/tui/prompter.js';
import {
  ASCII_SYMBOLS,
  symbolsFor,
  UNICODE_SYMBOLS,
  unicodeSupported,
} from '../../src/cli/tui/symbols.js';
import { fit, wrapText } from '../../src/cli/tui/terminal.js';
import { banner, box, statusLine } from '../../src/cli/tui/ui.js';

const KEYS = {
  up: '\x1b[A',
  down: '\x1b[B',
  enter: '\r',
  space: ' ',
  ctrlC: '\x03',
  esc: '\x1b',
};

/** Fake TTY: records raw-mode changes and everything written. */
function terminal() {
  const input = Object.assign(new PassThrough(), {
    isTTY: true,
    rawModes: [] as boolean[],
    setRawMode(mode: boolean) {
      this.rawModes.push(mode);
      return this;
    },
  });
  let written = '';
  const output = {
    columns: 80,
    write(chunk: string) {
      written += chunk;
      return true;
    },
  };
  const prompter = createTuiPrompter(input, output, {
    style: plainStyle,
    symbols: ASCII_SYMBOLS,
  });
  /** Sends keys one per tick, after the prompt has attached its listener. */
  const press = (...keys: string[]) => {
    keys.forEach((k, i) => setTimeout(() => input.write(k), 5 * (i + 1)));
  };
  return { input, output, prompter, press, written: () => written };
}

const choices = [
  { value: 'a', label: 'Alpha', hint: 'first letter' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma' },
];

describe('key mapping', () => {
  it('maps arrows, vim keys, space, enter, escape and Ctrl+C', () => {
    expect(keyAction(undefined, { name: 'up' })).toBe('up');
    expect(keyAction('j', { name: 'j' })).toBe('down');
    expect(keyAction(' ', { name: 'space' })).toBe('toggle');
    expect(keyAction('\r', { name: 'return' })).toBe('submit');
    expect(keyAction(undefined, { name: 'escape' })).toBe('cancel');
    expect(keyAction('\x03', { name: 'c', ctrl: true })).toBe('cancel');
    expect(keyAction('a', { name: 'a' })).toBe('all');
    expect(keyAction('y', { name: 'y' })).toBe('yes');
    expect(keyAction('x', { name: 'x' })).toBeUndefined();
    expect(keyAction('a', { name: 'a', ctrl: true })).toBeUndefined();
  });
});

describe('list state', () => {
  const config: ListConfig = { count: 3, multi: true, required: true };

  it('moves with wrap-around and skips disabled items', () => {
    const disabled: ListConfig = { count: 3, multi: false, disabled: new Set([1]) };
    let s = initialListState(disabled);
    s = reduceList(s, 'down', disabled).state;
    expect(s.cursor).toBe(2);
    s = reduceList(s, 'down', disabled).state;
    expect(s.cursor).toBe(0);
    s = reduceList(s, 'up', disabled).state;
    expect(s.cursor).toBe(2);
    expect(initialListState({ count: 2, multi: false, disabled: new Set([0]) }).cursor).toBe(1);
  });

  it('toggles, selects all, inverts and refuses an empty required selection', () => {
    let s = initialListState(config);
    let r = reduceList(s, 'submit', config);
    expect(r.done).toBeUndefined();
    expect(r.state.error).toMatch(/at least one/);
    s = reduceList(r.state, 'toggle', config).state;
    expect([...s.selected]).toEqual([0]);
    s = reduceList(s, 'all', config).state;
    expect([...s.selected].sort()).toEqual([0, 1, 2]);
    s = reduceList(s, 'all', config).state;
    expect(s.selected.size).toBe(0);
    s = reduceList(s, 'invert', config).state;
    expect(s.selected.size).toBe(3);
    r = reduceList(s, 'submit', config);
    expect(r.done).toBe('submit');
    expect(reduceList(s, 'cancel', config).done).toBe('cancel');
  });

  it('allows an empty optional selection', () => {
    const optional = { ...config, required: false };
    expect(reduceList(initialListState(optional), 'submit', optional).done).toBe('submit');
  });
});

describe('rendering', () => {
  const env = { st: plainStyle, sym: ASCII_SYMBOLS, width: 40 };

  it('renders plain text without escape codes when colors are off', () => {
    const lines = renderList(
      'Pick',
      choices,
      initialListState({ count: 3, multi: true }),
      true,
      env,
    );
    expect(lines.join('\n')).not.toContain('\u001b');
    expect(lines[0]).toBe('? Pick');
    expect(lines[2]).toBe('  > [ ] Alpha');
    expect(lines.at(-1)).toContain('first letter');
  });

  it('marks disabled choices in words, not only by style', () => {
    const lines = renderList(
      'Pick',
      [{ value: 'x', label: 'Global', disabled: 'not writable: /x' }],
      initialListState({ count: 1, multi: false }),
      false,
      env,
    );
    expect(lines.join('\n')).toContain('Global (not writable: /x)');
  });

  it('truncates long labels so redraws never wrap', () => {
    const long = [{ value: 'x', label: 'y'.repeat(200) }];
    const lines = renderList('Q', long, initialListState({ count: 1, multi: false }), false, env);
    expect(Math.max(...lines.map((l) => l.length))).toBeLessThanOrEqual(40);
    expect(fit('abcdef', 4)).toBe('a...');
    expect(wrapText('one two three four', 12)).toEqual(['one two', 'three four']);
  });

  it('colored output uses brand colors and strips back to the same text', () => {
    const colored = renderList(
      'Pick',
      choices,
      initialListState({ count: 3, multi: false }),
      false,
      { ...env, st: createStyle(true) },
    );
    expect(colored.join('')).toContain('\u001b[36m');
    const plain = renderList(
      'Pick',
      choices,
      initialListState({ count: 3, multi: false }),
      false,
      env,
    );
    expect(colored.map(stripAnsi)).toEqual(plain);
  });

  it('status lines carry a text label next to the glyph', () => {
    expect(statusLine('warn', 'x', plainStyle, UNICODE_SYMBOLS)).toBe('▲ WARN x');
    expect(statusLine('fail', 'x', plainStyle, ASCII_SYMBOLS)).toBe('x FAIL x');
  });

  it('draws aligned boxes and the banner in ASCII and Unicode', () => {
    const b = box(['a', 'bbb'], plainStyle, false);
    expect(b).toEqual(['+-----+', '| a   |', '| bbb |', '+-----+']);
    const u = banner('9.9.9', plainStyle, true);
    expect(u[1]).toContain('AgentForge v9.9.9');
    expect(new Set(u.map((l) => l.length)).size).toBe(1);
  });

  it('renders real progress counts', () => {
    const line = renderProgress('-', 3, 12, 'create x', plainStyle, false, 80);
    expect(line).toBe(`- ${'#'.repeat(5)}${'-'.repeat(15)} 3/12 create x`);
  });

  it('progress is a no-op without a terminal and clears its line with one', () => {
    const quiet = createProgress(undefined, plainStyle);
    quiet.update(1, 2, 'x');
    quiet.stop();
    let out = '';
    const p = createProgress({ write: (c) => void (out += c), unicode: false }, plainStyle);
    p.update(1, 2, 'step');
    p.stop();
    expect(out).toContain('1/2 step');
    expect(out.endsWith('\x1b[?25h')).toBe(true);
  });
});

describe('symbols', () => {
  it('uses ASCII on legacy Windows consoles and Unicode elsewhere', () => {
    expect(unicodeSupported('win32', {})).toBe(false);
    expect(unicodeSupported('win32', { WT_SESSION: '1' })).toBe(true);
    expect(unicodeSupported('linux', {})).toBe(true);
    expect(unicodeSupported('linux', { TERM: 'linux' })).toBe(false);
    expect(unicodeSupported('darwin', { AGENTFORGE_ASCII: '1' })).toBe(false);
    expect(symbolsFor(false)).toBe(ASCII_SYMBOLS);
  });
});

describe('arrow-key prompter', () => {
  it('selects with arrows and enter, then restores the terminal', async () => {
    const t = terminal();
    t.press(KEYS.down, KEYS.down, KEYS.up, KEYS.enter);
    expect(await t.prompter.select('Pick', choices)).toBe('b');
    expect(t.input.rawModes).toEqual([true, false]);
    expect(t.written()).toContain('+ Pick -> Beta');
    expect(t.written().endsWith('\x1b[?25h')).toBe(true);
  });

  it('starts on the initial value', async () => {
    const t = terminal();
    t.press(KEYS.enter);
    expect(await t.prompter.select('Pick', choices, { initial: 'c' })).toBe('c');
  });

  it('multiselects with space, keeps catalog order and supports "a" for all', async () => {
    const t = terminal();
    t.press(KEYS.down, KEYS.down, KEYS.space, KEYS.up, KEYS.up, KEYS.space, KEYS.enter);
    expect(await t.prompter.multiselect('Pick', choices)).toEqual(['a', 'c']);
    const u = terminal();
    u.press('a', KEYS.enter);
    expect(await u.prompter.multiselect('Pick', choices)).toEqual(['a', 'b', 'c']);
  });

  it('requires a selection unless the question is optional', async () => {
    const t = terminal();
    t.press(KEYS.enter, KEYS.space, KEYS.enter);
    expect(await t.prompter.multiselect('Pick', choices)).toEqual(['a']);
    expect(t.written()).toContain('Select at least one item');
    const u = terminal();
    u.press(KEYS.enter);
    expect(await u.prompter.multiselect('Pick', choices, { required: false })).toEqual([]);
  });

  it('confirms with y, n or enter for the default', async () => {
    const t = terminal();
    t.press('n');
    expect(await t.prompter.confirm('Apply?', true)).toBe(false);
    const u = terminal();
    u.press(KEYS.enter);
    expect(await u.prompter.confirm('Apply?', true)).toBe(true);
    const v = terminal();
    v.press(KEYS.space, KEYS.enter);
    expect(await v.prompter.confirm('Apply?', true)).toBe(false);
  });

  it('Ctrl+C cancels and leaves the terminal usable', async () => {
    const t = terminal();
    t.press(KEYS.down, KEYS.ctrlC);
    await expect(t.prompter.select('Pick', choices)).rejects.toBeInstanceOf(CancelledError);
    expect(t.input.rawModes).toEqual([true, false]);
    expect(t.written()).toContain('Cancelled');
    expect(t.written().endsWith('\x1b[?25h')).toBe(true);
  });

  it('Escape cancels and closed input cancels instead of hanging', async () => {
    const t = terminal();
    t.press(KEYS.esc, KEYS.esc);
    await expect(t.prompter.confirm('Apply?', false)).rejects.toBeInstanceOf(CancelledError);
    const u = terminal();
    setTimeout(() => u.input.end(), 5);
    await expect(u.prompter.select('Pick', choices)).rejects.toBeInstanceOf(CancelledError);
  });

  it('close() is silent when no prompt was shown', () => {
    const t = terminal();
    t.prompter.close();
    expect(t.written()).toBe('');
  });
});
