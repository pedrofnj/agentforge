import { cp, mkdir, mkdtemp, readdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverCatalog, loadComponent } from '../src/registry/index.js';
import type { LoadedAgent, LoadedSkill } from '../src/core/types.js';
import { run, type CliContext } from '../src/cli/index.js';
import type { Prompter } from '../src/cli/prompt.js';

export const FIXTURE_ROOT = fileURLToPath(new URL('./fixtures/catalog/', import.meta.url));

export async function loadFixtures(): Promise<{ skill: LoadedSkill; agent: LoadedAgent }> {
  const { entries } = await discoverCatalog(FIXTURE_ROOT);
  const loaded = await Promise.all(entries.map(loadComponent));
  const skill = loaded.find((c) => c.manifest.kind === 'skill') as LoadedSkill;
  const agent = loaded.find((c) => c.manifest.kind === 'agent') as LoadedAgent;
  return { skill, agent };
}

/** Creates a throwaway catalog: keys are relative paths, values are file contents. */
export async function makeCatalog(files: Record<string, string | object>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'agentforge-'));
  for (const [rel, content] of Object.entries(files)) {
    const file = path.join(root, rel);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, typeof content === 'string' ? content : JSON.stringify(content));
  }
  return root;
}

export const validSkill = {
  schemaVersion: 1,
  kind: 'skill',
  id: 'demo-skill',
  version: '0.1.0',
  description: 'Demo skill.',
  targets: ['claude-code', 'codex'],
};

export const validAgent = {
  schemaVersion: 1,
  kind: 'agent',
  id: 'demo-agent',
  version: '0.1.0',
  description: 'Demo agent.',
  targets: ['claude-code', 'codex'],
  domain: 'appsec',
  mode: 'read-only',
  capabilities: ['read'],
};

// ---- Isolated sandbox for installer/CLI tests (never touches the real user dirs) ----

export interface Sandbox {
  root: string;
  home: string;
  project: string;
  env: Record<string, string | undefined>;
  ctx(overrides?: Partial<CliContext>): CliContext & { output: string[]; errors: string[] };
  cli(argv: string[], overrides?: Partial<CliContext>): Promise<CliResult>;
}

export interface CliResult {
  code: number;
  out: string;
  err: string;
}

export async function makeSandbox(): Promise<Sandbox> {
  const root = await mkdtemp(path.join(tmpdir(), 'agentforge-sbx-'));
  const home = path.join(root, 'home');
  const project = path.join(root, 'project');
  await mkdir(path.join(project, '.git'), { recursive: true });
  await mkdir(home, { recursive: true });
  // Per-OS global state dirs are redirected into the sandbox.
  const env = {
    LOCALAPPDATA: path.join(root, 'localappdata'),
    XDG_STATE_HOME: path.join(root, 'xdg-state'),
  };
  const ctx = (overrides: Partial<CliContext> = {}) => {
    const output: string[] = [];
    const errors: string[] = [];
    return {
      out: (l: string) => output.push(l),
      err: (l: string) => errors.push(l),
      homeDir: home,
      cwd: project,
      env,
      osPlatform: process.platform,
      interactive: false,
      ...overrides,
      output,
      errors,
    };
  };
  const cli = async (argv: string[], overrides: Partial<CliContext> = {}) => {
    const c = ctx(overrides);
    const code = await run(argv, c);
    return { code, out: c.output.join('\n'), err: c.errors.join('\n') };
  };
  return { root, home, project, env, ctx, cli };
}

/** Scripted answers for interactive tests. */
export function fakePrompter(answers: unknown[]): Prompter & { asked: string[] } {
  const asked: string[] = [];
  const next = (q: string) => {
    asked.push(q);
    if (answers.length === 0) throw new Error(`Unexpected prompt: ${q}`);
    return Promise.resolve(answers.shift());
  };
  return {
    asked,
    select: (q) => next(q) as never,
    multiselect: (q) => next(q) as never,
    confirm: (q) => next(q) as never,
    close: () => undefined,
  };
}

/** Recursive snapshot: relative path -> content (or <dir>/<link>). */
export async function snapshot(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const walk = async (current: string) => {
    for (const d of await readdir(current, { withFileTypes: true })) {
      const full = path.join(current, d.name);
      const rel = path.relative(dir, full).split(path.sep).join('/');
      if (d.isSymbolicLink()) out[rel] = '<link>';
      else if (d.isDirectory()) {
        out[rel] = '<dir>';
        await walk(full);
      } else out[rel] = await readFile(full, 'utf8');
    }
  };
  await walk(dir);
  return out;
}

/** Copy of the fixture catalog that tests may modify. */
export async function copyFixtures(): Promise<string> {
  const dest = await mkdtemp(path.join(tmpdir(), 'agentforge-cat-'));
  await cp(FIXTURE_ROOT, dest, { recursive: true });
  return dest;
}

/** Directory link that works without admin rights on Windows (junction). */
export async function linkDir(target: string, link: string): Promise<void> {
  await mkdir(path.dirname(link), { recursive: true });
  await symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir');
}

/** File symlink; returns false where the OS forbids it (e.g. Windows without privilege). */
export async function tryLinkFile(target: string, link: string): Promise<boolean> {
  await mkdir(path.dirname(link), { recursive: true });
  try {
    await symlink(target, link, 'file');
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EPERM') return false;
    throw e;
  }
}
