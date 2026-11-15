import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { PathSafetyError } from '../core/paths.js';
import { BusyError } from '../installer/apply.js';
import { StateError } from '../installer/state.js';
import { UnknownComponentError } from '../registry/index.js';
import { runList, runStats, runValidate } from './commands/catalog.js';
import { runDoctor } from './commands/doctor.js';
import { runEval } from './commands/eval.js';
import { runOperation } from './commands/operations.js';
import { CancelledError, EXIT, UsageError, type CliContext, type Options } from './context.js';

export { EXIT, type CliContext } from './context.js';

/** Package root: two levels above this file in both `src/cli` and `dist/cli`. */
const PACKAGE_ROOT = fileURLToPath(new URL('../../', import.meta.url));

type Flag =
  | 'client'
  | 'global'
  | 'project'
  | 'yes'
  | 'dry-run'
  | 'verbose'
  | 'all'
  | 'catalog'
  | 'type'
  | 'domain'
  | 'json'
  | 'from'
  | 'agent'
  | 'fixture'
  | 'profile'
  | 'budget'
  | 'out'
  | 'category'
  | 'evals';

const FLAG_HELP: Record<Flag, string> = {
  client: '--client <claude|codex|both>  Client(s) to configure',
  global: '--global                      User-level install (all projects)',
  project: '--project                     Install into the current directory',
  yes: '--yes                         Apply without confirmation (never overwrites conflicts)',
  'dry-run': '--dry-run                     Show the plan; change nothing',
  verbose: '--verbose                     Show per-file actions and paths',
  all: '--all                         Select every component',
  catalog: '--catalog <dir>               Use another catalog directory (development)',
  type: '--type <skill|agent>           Only components of this kind',
  domain: '--domain <name>               Only components of this domain (e.g. appsec, workflow)',
  json: '--json                        Machine-readable output',
  from: '--from <claude-json|codex-jsonl|report-md|manual>  Format of the imported file',
  agent: '--agent <id>                  Agent that produced the run',
  fixture: '--fixture <name>              Benchmark fixture the run analyzed',
  profile: '--profile <quick|standard|deep>  Analysis profile used in the run',
  budget: '--budget <economy|balanced|thorough>  Resource budget used in the run',
  out: '--out <file>                  Write output to a new file (never overwrites)',
  category: '--category <name>             Only cases of this category',
  evals: '--evals <dir>                 Use another evals directory (cases, fixtures, baselines)',
};

interface CommandSpec {
  usage: string;
  summary: string;
  flags: Flag[];
  positionals: boolean;
}

const OP_FLAGS: Flag[] = ['client', 'global', 'project', 'yes', 'dry-run', 'verbose'];

const COMMANDS: Record<string, CommandSpec> = {
  install: {
    usage: 'install [ids...]',
    summary: 'Install components (asks for missing choices on a terminal)',
    flags: [...OP_FLAGS, 'all', 'catalog'],
    positionals: true,
  },
  list: {
    usage: 'list',
    summary: 'List available components',
    flags: ['verbose', 'catalog', 'type', 'domain'],
    positionals: false,
  },
  update: {
    usage: 'update [ids...]',
    summary: 'Update managed components; local edits are preserved',
    flags: [...OP_FLAGS, 'catalog'],
    positionals: true,
  },
  uninstall: {
    usage: 'uninstall [ids...]',
    summary: 'Remove files installed by AgentForge (only if unmodified)',
    flags: [...OP_FLAGS, 'all'],
    positionals: true,
  },
  doctor: {
    usage: 'doctor',
    summary: 'Diagnose installation and compatibility (read-only)',
    flags: ['client', 'global', 'project', 'verbose', 'catalog'],
    positionals: false,
  },
  validate: {
    usage: 'validate',
    summary: 'Validate catalog components',
    flags: ['catalog'],
    positionals: false,
  },
  eval: {
    usage: 'eval <validate|list|import|report|compare> [files...]',
    summary: 'Benchmarks, imported runs, quality and consumption reports (offline)',
    flags: [
      'catalog',
      'json',
      'from',
      'agent',
      'fixture',
      'profile',
      'budget',
      'out',
      'category',
      'evals',
    ],
    positionals: true,
  },
  stats: {
    usage: 'stats',
    summary: 'Measure skill sizes, discovery budget and duplication',
    flags: ['catalog', 'json'],
    positionals: false,
  },
  version: { usage: 'version', summary: 'Show version', flags: [], positionals: false },
};

const EXIT_HELP = 'Exit codes: 0 ok, 1 error, 2 usage, 3 conflicts (nothing changed), 4 cancelled';

function mainHelp(): string {
  const cmds = Object.values(COMMANDS).map((c) => `  ${c.usage.padEnd(20)} ${c.summary}`);
  return [
    'agentforge - token-efficient agents and skills for Claude Code and Codex',
    '',
    'Usage: agentforge <command> [options]',
    '',
    'Commands:',
    ...cmds,
    '',
    'Run "agentforge help <command>" for options.',
    EXIT_HELP,
  ].join('\n');
}

function commandHelp(name: string, spec: CommandSpec): string {
  return (
    [
      `Usage: agentforge ${spec.usage} [options]`,
      '',
      spec.summary,
      ...(spec.flags.length ? ['', 'Options:', ...spec.flags.map((f) => `  ${FLAG_HELP[f]}`)] : []),
      '',
      EXIT_HELP,
    ].join('\n') +
    (name === 'install'
      ? '\n\nNon-interactive example: agentforge install --client both --project --all --yes'
      : '')
  );
}

function version(): string {
  const pkg = JSON.parse(readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8')) as {
    version: string;
  };
  return pkg.version;
}

export async function run(argv: string[], ctx: CliContext): Promise<number> {
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        client: { type: 'string' },
        global: { type: 'boolean' },
        project: { type: 'boolean' },
        yes: { type: 'boolean', short: 'y' },
        'dry-run': { type: 'boolean' },
        verbose: { type: 'boolean' },
        all: { type: 'boolean' },
        catalog: { type: 'string' },
        type: { type: 'string' },
        domain: { type: 'string' },
        json: { type: 'boolean' },
        from: { type: 'string' },
        agent: { type: 'string' },
        fixture: { type: 'string' },
        profile: { type: 'string' },
        budget: { type: 'string' },
        out: { type: 'string' },
        category: { type: 'string' },
        evals: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    });
    const [command, ...rest] = positionals;

    if (values.version && !command) return (ctx.out(version()), EXIT.OK);
    if (!command || (command === 'help' && rest.length === 0))
      return (ctx.out(mainHelp()), EXIT.OK);
    const helpTarget = command === 'help' ? rest[0]! : command;
    const spec = COMMANDS[helpTarget];
    if (!spec) throw new UsageError(`Unknown command: ${helpTarget}. Run "agentforge help".`);
    if (values.help || command === 'help') return (ctx.out(commandHelp(helpTarget, spec)), EXIT.OK);

    const given = (Object.keys(values) as Array<Flag | 'help' | 'version'>).filter(
      (k) => values[k] !== undefined,
    );
    const unsupported = given.filter((k) => !(spec.flags as string[]).includes(k));
    if (unsupported.length > 0) {
      throw new UsageError(
        `Option(s) not supported by "${command}": ${unsupported.map((f) => `--${f}`).join(', ')}`,
      );
    }
    if (!spec.positionals && rest.length > 0)
      throw new UsageError(`Unexpected arguments: ${rest.join(' ')}`);
    if (values.all && rest.length > 0)
      throw new UsageError('Use either component ids or --all, not both');

    const opts: Options = {
      ...(values.client !== undefined ? { client: values.client } : {}),
      global: values.global ?? false,
      project: values.project ?? false,
      yes: values.yes ?? false,
      dryRun: values['dry-run'] ?? false,
      verbose: values.verbose ?? false,
      all: values.all ?? false,
      ...(values.catalog !== undefined ? { catalog: values.catalog } : {}),
      ...(values.type !== undefined ? { type: values.type } : {}),
      ...(values.domain !== undefined ? { domain: values.domain } : {}),
      json: values.json ?? false,
      ...(values.from !== undefined ? { from: values.from } : {}),
      ...(values.agent !== undefined ? { agent: values.agent } : {}),
      ...(values.fixture !== undefined ? { fixture: values.fixture } : {}),
      ...(values.profile !== undefined ? { profile: values.profile } : {}),
      ...(values.budget !== undefined ? { budget: values.budget } : {}),
      ...(values.out !== undefined ? { out: values.out } : {}),
      ...(values.category !== undefined ? { category: values.category } : {}),
      ...(values.evals !== undefined ? { evals: values.evals } : {}),
    };
    const catalogRoot = path.resolve(ctx.cwd, opts.catalog ?? PACKAGE_ROOT);

    switch (command) {
      case 'version':
        ctx.out(version());
        return EXIT.OK;
      case 'list':
        return await runList(ctx, opts, catalogRoot);
      case 'validate':
        return await runValidate(ctx, catalogRoot);
      case 'eval':
        return await runEval(
          ctx,
          opts,
          rest,
          catalogRoot,
          path.resolve(ctx.cwd, opts.evals ?? path.join(PACKAGE_ROOT, 'evals')),
          version(),
        );
      case 'stats':
        return await runStats(ctx, opts, catalogRoot);
      case 'doctor':
        return await runDoctor(ctx, opts, catalogRoot);
      case 'install':
      case 'update':
      case 'uninstall':
        return await runOperation(command, ctx, opts, rest, catalogRoot);
      default:
        throw new UsageError(`Unknown command: ${command}`);
    }
  } catch (e) {
    if (
      e instanceof UsageError ||
      (e as NodeJS.ErrnoException).code?.startsWith('ERR_PARSE_ARGS')
    ) {
      ctx.err(`${(e as Error).message}`);
      return EXIT.USAGE;
    }
    if (e instanceof UnknownComponentError) {
      ctx.err(e.message);
      return EXIT.USAGE;
    }
    if (e instanceof CancelledError) {
      ctx.err(`Cancelled: ${e.message}. Nothing was changed.`);
      return EXIT.CANCELLED;
    }
    const known = e instanceof BusyError || e instanceof StateError || e instanceof PathSafetyError;
    ctx.err(known ? (e as Error).message : `Error: ${(e as Error).message}`);
    return EXIT.ERROR;
  } finally {
    ctx.prompter?.close();
  }
}
