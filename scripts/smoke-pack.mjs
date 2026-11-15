// Packs the project, installs the tarball into a throwaway directory and runs
// the packaged CLI against an isolated home. Never touches real ~/.claude,
// ~/.codex or ~/.agents. Usage: npm run smoke
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const tmp = mkdtempSync(path.join(tmpdir(), 'agentforge-smoke-'));
// Run npm through node + npm's own entry point (no shell); `npm run smoke` provides it.
const npmCli = process.env.npm_execpath;
if (!npmCli || !npmCli.endsWith('.js')) {
  throw new Error('Run this through npm: npm run smoke');
}
let failures = 0;

function check(label, ok, detail = '') {
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` - ${detail}` : ''}\n`);
  if (!ok) failures++;
}

const runNpm = (args, cwd) =>
  execFileSync(process.execPath, [npmCli, ...args], { cwd, encoding: 'utf8' });

try {
  // 1. Pack and inspect the file list.
  const packed = JSON.parse(runNpm(['pack', '--json', '--pack-destination', tmp], root))[0];
  const files = packed.files.map((f) => f.path.replace(/\\/g, '/'));
  const has = (p) => files.includes(p);
  check('tarball created', existsSync(path.join(tmp, packed.filename)), packed.filename);
  for (const required of [
    'package.json',
    'README.md',
    'LICENSE',
    'dist/cli/bin.js',
    'dist/index.js',
  ]) {
    check(`includes ${required}`, has(required));
  }
  check(
    'includes skills',
    files.some((f) => f.startsWith('skills/') && f.endsWith('/manifest.json')),
  );
  check(
    'includes agents',
    files.some((f) => f.startsWith('agents/') && f.endsWith('/manifest.json')),
  );
  check(
    'excludes evaluation data and intentionally vulnerable fixtures',
    !files.some((f) => f.startsWith('evals/')),
  );
  const forbidden = files.filter((f) =>
    /^(src|tests|scripts|\.github|node_modules)\/|(^|\/)\.env|\.tgz$|\.map$|(^|\/)\.agentforge\//.test(
      f,
    ),
  );
  check(
    'no source, tests, CI files, env files or maps',
    forbidden.length === 0,
    forbidden.join(', '),
  );
  check('no production dependencies', Object.keys(pkg.dependencies ?? {}).length === 0);
  check(
    'no install-time scripts',
    !['preinstall', 'install', 'postinstall', 'prepare'].some((s) => pkg.scripts?.[s]),
  );
  check('license is MIT', pkg.license === 'MIT');
  check('bin points to dist/cli/bin.js', pkg.bin?.agentforge === 'dist/cli/bin.js');
  check(
    'bin has a node shebang',
    readFileSync(path.join(root, 'dist/cli/bin.js'), 'utf8').startsWith('#!/usr/bin/env node'),
  );

  // 2. Install the tarball into an empty project.
  const pkgDir = path.join(tmp, 'consumer');
  mkdirSync(pkgDir);
  runNpm(['init', '-y'], pkgDir);
  runNpm(
    ['install', '--ignore-scripts', '--no-audit', '--no-fund', path.join(tmp, packed.filename)],
    pkgDir,
  );
  // Scoped names install under node_modules/@scope/name.
  const bin = path.join(pkgDir, 'node_modules', ...pkg.name.split('/'), 'dist', 'cli', 'bin.js');
  check('installed package has the CLI', existsSync(bin));

  // 3. Isolated environment: fake home, state dirs and project.
  const home = path.join(tmp, 'home');
  const project = path.join(tmp, 'project');
  mkdirSync(home);
  mkdirSync(path.join(project, '.git'), { recursive: true });
  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    LOCALAPPDATA: path.join(tmp, 'lad'),
    XDG_STATE_HOME: path.join(tmp, 'xdg'),
    NO_COLOR: '1',
  };
  for (const k of ['CODEX_HOME', 'CLAUDE_CONFIG_DIR', 'AGENTFORGE_HOME']) delete env[k];
  const cli = (args, cwd = project) => {
    const r = spawnSync(process.execPath, [bin, ...args], { cwd, env, encoding: 'utf8' });
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
  };
  const expectCode = (label, args, code, cwd) => {
    const r = cli(args, cwd);
    check(label, r.code === code, r.code === code ? '' : `exit ${r.code}: ${r.out.slice(0, 400)}`);
    return r;
  };

  check('version matches package.json', cli(['--version']).out.trim() === pkg.version);
  expectCode('help', ['help'], 0);
  expectCode('list agents', ['list', '--type', 'agent'], 0);
  expectCode('validate catalog', ['validate'], 0);
  const ev = expectCode('eval without bundled benchmarks', ['eval', 'validate'], 2);
  check('eval explains where benchmarks live', ev.out.includes('not included in the npm package'));
  expectCode('non-interactive install without choices is a usage error', ['install'], 2);
  expectCode(
    'dry-run install',
    ['install', '--client', 'both', '--global', '--all', '--dry-run'],
    0,
  );
  check('dry-run wrote nothing', !existsSync(path.join(home, '.claude')));
  expectCode(
    'global install, both clients',
    ['install', '--client', 'both', '--global', '--all', '--yes'],
    0,
  );
  check(
    'Claude Code agent installed',
    existsSync(path.join(home, '.claude', 'agents', 'appsec-auditor.md')),
  );
  check(
    'Codex agent installed',
    existsSync(path.join(home, '.codex', 'agents', 'appsec-auditor.toml')),
  );
  check(
    'Codex skill installed',
    existsSync(path.join(home, '.agents', 'skills', 'secure-code-review', 'SKILL.md')),
  );
  const again = expectCode(
    'repeated install',
    ['install', '--client', 'both', '--global', '--all', '--yes'],
    0,
  );
  check('repeated install is a no-op', again.out.includes('Nothing to do.'));
  expectCode('doctor (global)', ['doctor', '--global'], 0);
  expectCode(
    'project install, one agent, Claude Code',
    ['install', 'appsec-auditor', '--client', 'claude', '--project', '--yes'],
    0,
  );
  check(
    'project files in project only',
    existsSync(path.join(project, '.claude', 'agents', 'appsec-auditor.md')),
  );
  expectCode('update (project)', ['update', '--project', '--yes'], 0);
  expectCode('uninstall (project)', ['uninstall', '--project', '--all', '--yes'], 0);
  check(
    'project agent removed',
    !existsSync(path.join(project, '.claude', 'agents', 'appsec-auditor.md')),
  );
  expectCode('uninstall (global)', ['uninstall', '--global', '--all', '--yes'], 0);
  check(
    'global files removed',
    !existsSync(path.join(home, '.claude', 'agents', 'appsec-auditor.md')),
  );
  expectCode(
    '--project in the home directory is refused',
    ['install', '--client', 'claude', '--project', '--all', '--yes'],
    2,
    home,
  );
  check('tarball size is reasonable', statSync(path.join(tmp, packed.filename)).size < 512 * 1024);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

process.stdout.write(
  failures === 0 ? 'Smoke test passed.\n' : `Smoke test failed: ${failures} check(s).\n`,
);
process.exitCode = failures === 0 ? 0 : 1;
