import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { CancelledError } from '../../src/cli/context.js';
import { createReadlinePrompter } from '../../src/cli/prompt.js';

function setup(lines: string[]) {
  const input = new PassThrough();
  const output = new PassThrough();
  output.resume();
  const prompter = createReadlinePrompter(input, output);
  // Feed one answer per prompt, asynchronously, like a user typing.
  let i = 0;
  output.on('data', () => {
    if (i < lines.length) setImmediate(() => input.write(`${lines[i++]}\n`));
    else if (i === lines.length) setImmediate(() => input.end());
  });
  return prompter;
}

const choices = [
  { value: 'a', label: 'A' },
  { value: 'b', label: 'B' },
];

describe('readline prompter', () => {
  it('selects by number and re-asks on invalid input', async () => {
    const p = setup(['9', '2']);
    expect(await p.select('Pick', choices)).toBe('b');
    p.close();
  });

  it('multiselect accepts lists and "all"', async () => {
    const p = setup(['2,1,2']);
    expect(await p.multiselect('Pick', choices)).toEqual(['b', 'a']);
    p.close();
    const q = setup(['all']);
    expect(await q.multiselect('Pick', choices)).toEqual(['a', 'b']);
    q.close();
  });

  it('confirm uses the default on empty input', async () => {
    const p = setup(['']);
    expect(await p.confirm('Ok?', false)).toBe(false);
    p.close();
  });

  it('closed input cancels instead of hanging', async () => {
    const p = setup([]);
    await expect(p.confirm('Ok?', true)).rejects.toBeInstanceOf(CancelledError);
  });
});
