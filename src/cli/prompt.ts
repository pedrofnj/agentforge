import { createInterface } from 'node:readline/promises';
import { CancelledError } from './context.js';

export interface Choice<T extends string = string> {
  value: T;
  label: string;
}

export interface Prompter {
  select<T extends string>(question: string, choices: Choice<T>[]): Promise<T>;
  /** Returns the selected values; "all" selects everything. */
  multiselect(question: string, choices: Choice[]): Promise<string[]>;
  confirm(question: string, defaultYes: boolean): Promise<boolean>;
  close(): void;
}

const MAX_ATTEMPTS = 3;

/** Minimal numbered-menu prompter on top of node:readline (no dependencies). */
export function createReadlinePrompter(
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream,
): Prompter {
  const rl = createInterface({ input, output });
  let closed = false;
  rl.on('close', () => {
    closed = true;
  });

  async function ask(question: string): Promise<string> {
    if (closed) throw new CancelledError('Input closed');
    const ac = new AbortController();
    const onClose = () => ac.abort();
    rl.once('close', onClose);
    try {
      return (await rl.question(question, { signal: ac.signal })).trim();
    } catch {
      throw new CancelledError('Input closed');
    } finally {
      rl.off('close', onClose);
    }
  }

  const menu = (question: string, choices: Choice[]) =>
    `${question}\n${choices.map((c, i) => `  ${i + 1}) ${c.label}`).join('\n')}\n`;

  async function retry<T>(fn: () => Promise<T | undefined>): Promise<T> {
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const result = await fn();
      if (result !== undefined) return result;
      output.write('Invalid choice.\n');
    }
    throw new CancelledError('Too many invalid answers');
  }

  return {
    select(question, choices) {
      return retry(async () => {
        const n = Number(await ask(`${menu(question, choices)}> `));
        return choices[n - 1]?.value;
      });
    },
    multiselect(question, choices) {
      return retry(async () => {
        const answer = await ask(
          `${menu(question, choices)}Numbers separated by commas, or "all": `,
        );
        if (answer.toLowerCase() === 'all') return choices.map((c) => c.value);
        const picks = answer.split(',').map((s) => Number(s.trim()));
        if (picks.length === 0 || picks.some((n) => !choices[n - 1])) return undefined;
        return [...new Set(picks.map((n) => choices[n - 1]!.value))];
      });
    },
    confirm(question, defaultYes) {
      return retry(async () => {
        const a = (await ask(`${question} ${defaultYes ? '[Y/n]' : '[y/N]'} `)).toLowerCase();
        if (a === '') return defaultYes;
        if (a === 'y' || a === 'yes') return true;
        if (a === 'n' || a === 'no') return false;
        return undefined;
      });
    },
    close() {
      rl.close();
    },
  };
}
