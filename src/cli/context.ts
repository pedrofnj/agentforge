import { lstat } from 'node:fs/promises';
import path from 'node:path';
import { PLATFORMS, type InstallScope, type Platform } from '../core/types.js';
import type { InstallEnvironment } from '../installer/state.js';
import type { Prompter } from './prompt.js';
import { plainStyle, type Style } from './style.js';
import type { Terminal } from './tui/terminal.js';

export const styleOf = (ctx: { style?: Style }): Style => ctx.style ?? plainStyle;

export const EXIT = {
  OK: 0,
  /** Runtime failure, invalid catalog, doctor found problems. */
  ERROR: 1,
  /** Bad arguments or missing input in non-interactive mode. */
  USAGE: 2,
  /** Conflicts block the operation; nothing was changed. */
  CONFLICT: 3,
  /** The user declined; nothing was changed. */
  CANCELLED: 4,
} as const;

export interface CliContext extends InstallEnvironment {
  out: (line: string) => void;
  err: (line: string) => void;
  /** True when stdin and stdout are terminals. */
  interactive: boolean;
  prompter?: Prompter;
  /** Terminal styling; plain text when absent. */
  style?: Style;
  /** Live terminal output (spinner, progress); only on an interactive terminal. */
  terminal?: Terminal;
}

export interface Options {
  client?: string;
  global: boolean;
  project: boolean;
  yes: boolean;
  dryRun: boolean;
  verbose: boolean;
  all: boolean;
  catalog?: string;
  type?: string;
  domain?: string;
  json: boolean;
  from?: string;
  agent?: string;
  fixture?: string;
  profile?: string;
  budget?: string;
  out?: string;
  category?: string;
  evals?: string;
}

export class UsageError extends Error {
  override name = 'UsageError';
}

export class CancelledError extends Error {
  override name = 'CancelledError';
}

/** Prompts are allowed only on a terminal and when --yes was not given. */
export function promptFor(ctx: CliContext, opts: Options): Prompter | undefined {
  return ctx.interactive && !opts.yes ? ctx.prompter : undefined;
}

export const CLIENTS: Record<string, Platform[]> = {
  claude: ['claude-code'],
  'claude-code': ['claude-code'],
  codex: ['codex'],
  both: [...PLATFORMS],
};

export async function resolveClients(
  ctx: CliContext,
  opts: Options,
  { required, ask }: { required: boolean; ask?: (prompter: Prompter) => Promise<Platform[]> },
): Promise<Platform[]> {
  if (opts.client !== undefined) {
    const platforms = CLIENTS[opts.client];
    if (!platforms)
      throw new UsageError(
        `--client/--provider must be one of: ${Object.keys(CLIENTS).join(', ')}`,
      );
    return platforms;
  }
  if (!required) return [...PLATFORMS];
  const prompter = promptFor(ctx, opts);
  if (!prompter)
    throw new UsageError(
      '--client claude|codex|both (or --provider) is required in non-interactive mode',
    );
  if (ask) return ask(prompter);
  const choice = await prompter.select('Which client do you want to configure?', [
    { value: 'claude', label: 'Claude Code' },
    { value: 'codex', label: 'Codex' },
    { value: 'both', label: 'Both' },
  ]);
  return CLIENTS[choice]!;
}

export async function resolveScope(
  ctx: CliContext,
  opts: Options,
  ask?: (prompter: Prompter) => Promise<InstallScope>,
): Promise<InstallScope> {
  if (opts.global && opts.project)
    throw new UsageError('Use either --global or --project, not both');
  if (opts.global) return 'global';
  if (opts.project) return 'project';
  const prompter = promptFor(ctx, opts);
  if (!prompter)
    throw new UsageError(
      '--global or --project (or --scope global|project) is required in non-interactive mode',
    );
  if (ask) return ask(prompter);
  return prompter.select('Install globally or in the current project?', [
    { value: 'global', label: `Global (user: ${ctx.homeDir})` },
    { value: 'project', label: `Project (${ctx.cwd})` },
  ]);
}

/** Nearest ancestor (or self) containing `.git`, if any. */
export async function findGitRoot(start: string): Promise<string | undefined> {
  let current = path.resolve(start);
  for (;;) {
    try {
      await lstat(path.join(current, '.git'));
      return current;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return undefined;
      current = parent;
    }
  }
}
