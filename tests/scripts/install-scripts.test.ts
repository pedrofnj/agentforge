import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sh = readFileSync('scripts/install.sh', 'utf8');
const ps = readFileSync('scripts/install.ps1', 'utf8');
/** Executable lines only (comments and help text may mention what the script never does). */
const code = (text: string, comment: RegExp) =>
  text
    .split('\n')
    .filter((l) => !comment.test(l) && !/^\s*(say|Write-Output) /.test(l))
    .join('\n');
const shCode = code(sh, /^\s*#/);
const psCode = code(ps.replace(/<#[\s\S]*?#>/, ''), /^\s*#/);

const has = (cmd: string) =>
  spawnSync(cmd, ['-c', 'exit 0'], { stdio: 'ignore', shell: false }).status === 0;

describe('install scripts: safety rules', () => {
  it('never elevate, change execution policy or fetch remote code', () => {
    for (const text of [shCode, psCode]) {
      expect(text).not.toMatch(/\bsudo\b|\bdoas\b|\bsu -/);
      expect(text).not.toMatch(/Set-ExecutionPolicy|RunAs|-Verb\s+RunAs/i);
      expect(text).not.toMatch(
        /\bcurl\b|\bwget\b|Invoke-WebRequest|Invoke-RestMethod|\biwr\b|\birm\b/i,
      );
      expect(text).not.toMatch(/Invoke-Expression|\biex\b|\beval\b/i);
      expect(text).not.toMatch(/npm (install|i) (-g|--global)/);
    }
  });

  it('resolve paths from the script location and keep the caller directory', () => {
    expect(sh).toContain('ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)');
    expect(sh).toContain('npm --prefix "$ROOT" ci --ignore-scripts');
    expect(sh).toContain('node "$ROOT/dist/cli/bin.js" install "$@"');
    expect(ps).toContain('$Root = Split-Path -Parent $PSScriptRoot');
    expect(ps).toContain("& node (Join-Path $Root 'dist\\cli\\bin.js') install @args");
  });

  it('check Node 22+ and npm and propagate the installer exit code', () => {
    expect(sh).toContain('MIN_NODE=22');
    expect(sh).toContain('exit "$code"');
    expect(ps).toContain('$MinNode = 22');
    expect(ps).toContain('exit $LASTEXITCODE');
    expect(sh.startsWith('#!/usr/bin/env sh\n')).toBe(true);
    expect(sh).toContain('set -eu');
    expect(ps).toContain("$ErrorActionPreference = 'Stop'");
  });
});

describe('install scripts: execution', () => {
  it.skipIf(!has('sh'))('install.sh parses and prints help', () => {
    expect(spawnSync('sh', ['-n', 'scripts/install.sh']).status).toBe(0);
    const r = spawnSync('sh', ['scripts/install.sh', '--help'], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Usage: scripts/install.sh');
  });

  const pwsh = process.platform === 'win32' ? 'powershell' : 'pwsh';
  it.skipIf(!has(pwsh))('install.ps1 prints help', () => {
    const r = spawnSync(
      pwsh,
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/install.ps1', '--help'],
      { encoding: 'utf8' },
    );
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('Usage: scripts\\install.ps1');
  });
});
