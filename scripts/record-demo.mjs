// Records a real, reproducible CLI transcript in an isolated temporary project
// (copy of evals/fixtures/php-app) with a fake home. Output is the actual CLI
// output with temporary paths replaced. Usage: npm run build && node scripts/record-demo.mjs
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const bin = path.join(root, 'dist', 'cli', 'bin.js');
const tmp = mkdtempSync(path.join(tmpdir(), 'agentforge-demo-'));
const home = path.join(tmp, 'home');
const project = path.join(tmp, 'my-app');
mkdirSync(home);
cpSync(path.join(root, 'evals', 'fixtures', 'php-app'), project, { recursive: true });
mkdirSync(path.join(project, '.git'));

const env = {
  ...process.env,
  HOME: home,
  USERPROFILE: home,
  LOCALAPPDATA: path.join(tmp, 'state'),
  XDG_STATE_HOME: path.join(tmp, 'state'),
  NO_COLOR: '1',
};
for (const k of ['CODEX_HOME', 'CLAUDE_CONFIG_DIR', 'AGENTFORGE_HOME']) delete env[k];

const clean = (s) =>
  s
    .split(project)
    .join('~/my-app')
    .split(home)
    .join('~')
    .split(tmp)
    .join('/tmp/agentforge-demo')
    .split(root)
    .join('<agentforge>')
    .replace(/\\/g, '/');

const steps = [
  ['--version'],
  ['list', '--type', 'agent'],
  ['install', 'appsec-auditor', '--client', 'claude', '--project', '--dry-run'],
  ['install', 'appsec-auditor', '--client', 'claude', '--project', '--yes'],
  ['doctor', '--project', '--client', 'claude'],
];
const out = [];
try {
  for (const args of steps) {
    const r = spawnSync(process.execPath, [bin, ...args], { cwd: project, env, encoding: 'utf8' });
    out.push(
      `$ agentforge ${args.join(' ')}`,
      clean(`${r.stdout}${r.stderr}`).trimEnd(),
      `(exit ${r.status})`,
      '',
    );
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
process.stdout.write(`${out.join('\n')}\n`);
