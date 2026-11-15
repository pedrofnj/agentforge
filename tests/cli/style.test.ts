import { describe, expect, it } from 'vitest';
import { colorEnabled, createStyle } from '../../src/cli/style.js';
import { FIXTURE_ROOT, makeSandbox } from '../helpers.js';

describe('terminal styling', () => {
  it('is off for pipes, NO_COLOR and dumb terminals; FORCE_COLOR enables it', () => {
    expect(colorEnabled(false, {})).toBe(false);
    expect(colorEnabled(true, {})).toBe(true);
    expect(colorEnabled(true, { NO_COLOR: '1' })).toBe(false);
    expect(colorEnabled(true, { TERM: 'dumb' })).toBe(false);
    expect(colorEnabled(false, { FORCE_COLOR: '1' })).toBe(true);
    expect(createStyle(false).red('x')).toBe('x');
    expect(createStyle(true).red('x')).toBe('\x1b[31mx\x1b[39m');
  });
});

describe('first-run feedback', () => {
  it('confirms installed components and prints client-specific next steps', async () => {
    const sbx = await makeSandbox();
    const r = await sbx.cli([
      'install',
      '--client',
      'both',
      '--project',
      '--all',
      '--yes',
      '--catalog',
      FIXTURE_ROOT,
    ]);
    expect(r.code).toBe(0);
    expect(r.out).toContain('Applying');
    expect(r.out).toMatch(/Installed: .*sample-reviewer \(Claude Code\)/);
    expect(r.out).toContain('Claude Code: start a new session in this project');
    expect(r.out).toContain('Codex loads project agents only for trusted projects.');
    expect(r.out).toContain('agentforge doctor');
    expect(r.out).not.toContain('\x1b['); // no ANSI codes without a terminal
  });
});
