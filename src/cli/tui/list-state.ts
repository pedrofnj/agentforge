import type { KeyAction } from './keys.js';

/** Pure state of a select/multiselect list; rendering and I/O live elsewhere. */
export interface ListState {
  cursor: number;
  selected: ReadonlySet<number>;
  /** One-shot hint shown under the list (e.g. "select at least one"). */
  error?: string;
}

export interface ListConfig {
  count: number;
  multi: boolean;
  /** Indexes that cannot be chosen. */
  disabled?: ReadonlySet<number>;
  /** Multiselect: submitting with nothing selected is refused. */
  required?: boolean;
}

export type ListResult =
  { state: ListState; done?: undefined } | { state: ListState; done: 'submit' | 'cancel' };

export function initialListState(
  config: ListConfig,
  cursor = 0,
  selected: Iterable<number> = [],
): ListState {
  const disabled = config.disabled ?? new Set<number>();
  let start = Math.min(Math.max(cursor, 0), Math.max(config.count - 1, 0));
  for (let i = 0; i < config.count && disabled.has(start); i++) start = (start + 1) % config.count;
  return { cursor: start, selected: new Set([...selected].filter((i) => !disabled.has(i))) };
}

function move(state: ListState, config: ListConfig, step: 1 | -1): number {
  const disabled = config.disabled ?? new Set<number>();
  let next = state.cursor;
  for (let i = 0; i < config.count; i++) {
    next = (next + step + config.count) % config.count;
    if (!disabled.has(next)) return next;
  }
  return state.cursor;
}

function edge(config: ListConfig, fromEnd: boolean): number {
  const disabled = config.disabled ?? new Set<number>();
  const order = [...Array(config.count).keys()];
  if (fromEnd) order.reverse();
  return order.find((i) => !disabled.has(i)) ?? 0;
}

export function reduceList(state: ListState, action: KeyAction, config: ListConfig): ListResult {
  const disabled = config.disabled ?? new Set<number>();
  const base = { cursor: state.cursor, selected: state.selected };
  const enabled = [...Array(config.count).keys()].filter((i) => !disabled.has(i));
  switch (action) {
    case 'up':
      return { state: { ...base, cursor: move(state, config, -1) } };
    case 'down':
      return { state: { ...base, cursor: move(state, config, 1) } };
    case 'home':
      return { state: { ...base, cursor: edge(config, false) } };
    case 'end':
      return { state: { ...base, cursor: edge(config, true) } };
    case 'cancel':
      return { state, done: 'cancel' };
    case 'toggle': {
      if (!config.multi || disabled.has(state.cursor)) return { state: base };
      const selected = new Set(state.selected);
      if (selected.has(state.cursor)) selected.delete(state.cursor);
      else selected.add(state.cursor);
      return { state: { ...base, selected } };
    }
    case 'all': {
      if (!config.multi) return { state: base };
      const everything = enabled.every((i) => state.selected.has(i));
      return { state: { ...base, selected: new Set(everything ? [] : enabled) } };
    }
    case 'invert': {
      if (!config.multi) return { state: base };
      return {
        state: { ...base, selected: new Set(enabled.filter((i) => !state.selected.has(i))) },
      };
    }
    case 'submit':
      if (config.multi && config.required && state.selected.size === 0) {
        return { state: { ...base, error: 'Select at least one item (space to select).' } };
      }
      if (!config.multi && disabled.has(state.cursor)) return { state: base };
      return { state: base, done: 'submit' };
    default:
      return { state: base };
  }
}
