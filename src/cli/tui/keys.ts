/** Keypress (from node:readline emitKeypressEvents) mapped to a UI action. */
export interface Key {
  name?: string | undefined;
  ctrl?: boolean | undefined;
  meta?: boolean | undefined;
  shift?: boolean | undefined;
  sequence?: string | undefined;
}

export type KeyAction =
  | 'up'
  | 'down'
  | 'home'
  | 'end'
  | 'toggle'
  | 'all'
  | 'invert'
  | 'submit'
  | 'cancel'
  | 'yes'
  | 'no'
  | 'left'
  | 'right';

export function keyAction(str: string | undefined, key: Key | undefined): KeyAction | undefined {
  const name = key?.name;
  if (key?.ctrl && (name === 'c' || name === 'd')) return 'cancel';
  if (name === 'escape') return 'cancel';
  if (name === 'return' || name === 'enter') return 'submit';
  if (name === 'up' || (key?.ctrl && name === 'p')) return 'up';
  if (name === 'down' || (key?.ctrl && name === 'n')) return 'down';
  if (name === 'tab') return key?.shift ? 'up' : 'down';
  if (name === 'home' || name === 'pageup') return 'home';
  if (name === 'end' || name === 'pagedown') return 'end';
  if (name === 'left') return 'left';
  if (name === 'right') return 'right';
  if (name === 'space' || str === ' ') return 'toggle';
  if (key?.ctrl || key?.meta) return undefined;
  switch (str) {
    case 'k':
      return 'up';
    case 'j':
      return 'down';
    case 'a':
      return 'all';
    case 'i':
      return 'invert';
    case 'y':
    case 'Y':
      return 'yes';
    case 'n':
    case 'N':
      return 'no';
    default:
      return undefined;
  }
}
