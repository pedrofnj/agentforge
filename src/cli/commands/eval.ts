import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { BUDGETS } from '../../core/budgets.js';
import { PROFILES } from '../../core/profiles.js';
import type { LoadedComponent } from '../../core/types.js';
import {
  checkReachability,
  summarizeReach,
  type ReachSummary,
} from '../../evaluation/analyzers/reachability.js';
import { checkStructure } from '../../evaluation/analyzers/structure.js';
import { compareReports } from '../../evaluation/analyzers/compare.js';
import { loadCaseSuite, type CaseSuite } from '../../evaluation/core/cases.js';
import { buildRun, validateRun } from '../../evaluation/core/run.js';
import { CASE_CATEGORIES, type RunResult } from '../../evaluation/core/types.js';
import {
  COLLECTORS,
  CollectorError,
  type CollectorName,
} from '../../evaluation/collectors/index.js';
import { computeCatalogStats, type CatalogStats } from '../../evaluation/metrics/context.js';
import {
  renderComparisonMarkdown,
  renderReportMarkdown,
} from '../../evaluation/reporters/markdown.js';
import { buildReport, type EvaluationReport } from '../../evaluation/reporters/report.js';
import { sanitizeDeep } from '../../evaluation/reporters/sanitize.js';
import { discoverCatalog, loadComponent } from '../../registry/index.js';
import { EXIT, UsageError, type CliContext, type Options } from '../context.js';

export const EVAL_SUBCOMMANDS = ['validate', 'list', 'import', 'report', 'compare'] as const;

/** Imported files are user-provided outputs; refuse anything unreasonably large. */
const MAX_INPUT_BYTES = 50 * 1024 * 1024;
/** Allowed rise in mean reachable share before searches count as broader. */
const REACH_SHARE_TOLERANCE = 0.05;

interface EvalPaths {
  root: string;
  cases: string;
  fixtures: string;
  baseline: string;
  reachBaseline: string;
}

const pathsFor = (root: string): EvalPaths => ({
  root,
  cases: path.join(root, 'cases'),
  fixtures: path.join(root, 'fixtures'),
  baseline: path.join(root, 'baselines', 'context.json'),
  reachBaseline: path.join(root, 'baselines', 'reachability.json'),
});

async function readInput(file: string): Promise<string> {
  const info = await stat(file).catch(() => undefined);
  if (!info?.isFile()) throw new UsageError(`Not a file: ${file}`);
  if (info.size > MAX_INPUT_BYTES) throw new UsageError(`File too large (> 50 MB): ${file}`);
  return readFile(file, 'utf8');
}

/** Writes output files without ever overwriting an existing file. */
async function emit(ctx: CliContext, opts: Options, text: string): Promise<void> {
  if (!opts.out) return void ctx.out(text);
  await writeFile(path.resolve(ctx.cwd, opts.out), `${text}\n`, { flag: 'wx' }).catch(
    (e: NodeJS.ErrnoException) => {
      if (e.code === 'EEXIST') throw new UsageError(`Refusing to overwrite ${opts.out}`);
      throw e;
    },
  );
  ctx.out(`Wrote ${opts.out}`);
}

function allowOnly(sub: string, opts: Options, allowed: Array<keyof Options>) {
  const given = (Object.keys(opts) as Array<keyof Options>).filter((k) => {
    const v = opts[k];
    return v !== undefined && v !== false;
  });
  const bad = given.filter((k) => !allowed.includes(k));
  if (bad.length > 0)
    throw new UsageError(`Option(s) not supported by "eval ${sub}": ${bad.join(', ')}`);
}

async function loadSuite(p: EvalPaths, catalogRoot: string): Promise<CaseSuite> {
  return loadCaseSuite(p.cases, p.fixtures, await discoverCatalog(catalogRoot));
}

async function loadRun(ctx: CliContext, file: string): Promise<RunResult> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readInput(path.resolve(ctx.cwd, file)));
  } catch (e) {
    if (e instanceof UsageError) throw e;
    throw new UsageError(`${file}: not valid JSON`);
  }
  const errors = validateRun(raw);
  if (errors.length > 0) throw new UsageError(`${file}: invalid run (${errors.join('; ')})`);
  return sanitizeDeep(raw as RunResult, ctx.homeDir);
}

async function reportFrom(
  ctx: CliContext,
  file: string,
  suite: CaseSuite,
  p: EvalPaths,
  version: string,
): Promise<EvaluationReport> {
  const raw = JSON.parse(await readInput(path.resolve(ctx.cwd, file))) as { kind?: unknown };
  if (raw.kind === 'agentforge-evaluation-report') return raw as EvaluationReport;
  return buildReport([await loadRun(ctx, file)], suite, p.fixtures, version);
}

export async function runEval(
  ctx: CliContext,
  opts: Options,
  args: string[],
  catalogRoot: string,
  evalsRoot: string,
  version: string,
): Promise<number> {
  const [sub, ...rest] = args;
  const p = pathsFor(evalsRoot);
  // Benchmarks and fixtures live in the repository only; the npm package does not ship them.
  if (sub !== 'import' && (EVAL_SUBCOMMANDS as readonly string[]).includes(sub ?? '')) {
    const present = await stat(p.cases).then(
      (s) => s.isDirectory(),
      () => false,
    );
    if (!present) {
      throw new UsageError(
        `No evaluation data at ${p.root}. Benchmarks are not included in the npm package: clone https://github.com/pedrofnj/agentforge and run from the repository, or pass --evals <dir>.`,
      );
    }
  }
  switch (sub) {
    case 'validate': {
      allowOnly(sub, opts, ['catalog', 'evals']);
      if (rest.length) throw new UsageError(`Unexpected arguments: ${rest.join(' ')}`);
      const catalog = await discoverCatalog(catalogRoot);
      const suite = await loadCaseSuite(p.cases, p.fixtures, catalog);
      for (const i of suite.issues)
        (i.severity === 'error' ? ctx.err : ctx.out)(
          `${i.severity.toUpperCase()} ${i.caseId}: ${i.message}`,
        );
      const vuln = suite.cases.filter((c) => c.kind === 'vulnerable').length;
      const byCat = CASE_CATEGORIES.map(
        (c) => `${c} ${suite.cases.filter((x) => x.category === c).length}`,
      ).join(', ');
      ctx.out(
        `Benchmarks: ${suite.cases.length} valid case(s) (${vuln} vulnerable, ${suite.cases.length - vuln} safe): ${byCat}.`,
      );

      const components: LoadedComponent[] = await Promise.all(catalog.entries.map(loadComponent));
      const current = await computeCatalogStats(catalog);
      let baseline: CatalogStats | undefined;
      try {
        baseline = JSON.parse(await readFile(p.baseline, 'utf8')) as CatalogStats;
      } catch {
        ctx.out(`No context baseline at ${p.baseline}; growth checks skipped.`);
      }
      const structure = checkStructure(current, baseline, components);
      for (const i of structure)
        (i.severity === 'error' ? ctx.err : ctx.out)(
          `${i.severity.toUpperCase()} structure ${i.subject} [${i.code}] ${i.message}`,
        );
      // Static search reachability (procedure design, not model behavior).
      const reach = summarizeReach(await checkReachability(suite.cases, components, p.fixtures));
      let reachErrors = 0;
      ctx.out(
        `Search reachability (static): ${reach.reached}/${reach.total}; mean share of fixture files reachable ${(reach.meanReachableShare * 100).toFixed(1)}%.`,
      );
      for (const m of reach.misses)
        ctx.out(`WARNING reachability ${m}: documented searches do not reach the evidence file`);
      try {
        const base = JSON.parse(await readFile(p.reachBaseline, 'utf8')) as ReachSummary;
        if (reach.reached < base.reached) {
          reachErrors++;
          ctx.err(`ERROR reachability dropped from ${base.reached} to ${reach.reached}`);
        }
        if (reach.meanReachableShare > base.meanReachableShare + REACH_SHARE_TOLERANCE) {
          reachErrors++;
          ctx.err(
            `ERROR searches got broader: reachable share ${reach.meanReachableShare} vs baseline ${base.meanReachableShare}`,
          );
        }
      } catch {
        ctx.out(`No reachability baseline at ${p.reachBaseline}; regression check skipped.`);
      }
      const errors =
        suite.issues.filter((i) => i.severity === 'error').length +
        structure.filter((i) => i.severity === 'error').length +
        reachErrors;
      ctx.out(
        `Structure: ${structure.length} issue(s). ${errors === 0 ? 'OK' : `${errors} error(s)`}.`,
      );
      return errors > 0 ? EXIT.ERROR : EXIT.OK;
    }
    case 'list': {
      allowOnly(sub, opts, ['category', 'json', 'evals', 'catalog']);
      if (opts.category && !(CASE_CATEGORIES as readonly string[]).includes(opts.category)) {
        throw new UsageError(`--category must be one of: ${CASE_CATEGORIES.join(', ')}`);
      }
      const suite = await loadSuite(p, catalogRoot);
      const cases = suite.cases.filter((c) => !opts.category || c.category === opts.category);
      if (opts.json) {
        ctx.out(JSON.stringify(cases, null, 2));
        return EXIT.OK;
      }
      for (const c of cases) {
        ctx.out(
          `${c.id.padEnd(34)} ${c.category.padEnd(14)} ${c.kind.padEnd(10)} ${c.agent.padEnd(24)} ${c.fixture}`,
        );
      }
      ctx.out(`${cases.length} case(s).`);
      return suite.issues.some((i) => i.severity === 'error') ? EXIT.ERROR : EXIT.OK;
    }
    case 'import': {
      allowOnly(sub, opts, ['from', 'agent', 'fixture', 'profile', 'budget', 'out']);
      if (rest.length !== 1)
        throw new UsageError('Usage: agentforge eval import <file> --from <format> ...');
      const from = opts.from;
      const text = await readInput(path.resolve(ctx.cwd, rest[0]!));
      let run: RunResult;
      if (from === 'manual') {
        run = await loadRun(ctx, rest[0]!);
      } else if (from && from in COLLECTORS) {
        if (!opts.agent || !opts.fixture)
          throw new UsageError('--agent and --fixture are required');
        if (opts.profile && !(PROFILES as readonly string[]).includes(opts.profile))
          throw new UsageError(`--profile must be one of: ${PROFILES.join(', ')}`);
        if (opts.budget && !(BUDGETS as readonly string[]).includes(opts.budget))
          throw new UsageError(`--budget must be one of: ${BUDGETS.join(', ')}`);
        const c = COLLECTORS[from as CollectorName];
        try {
          run = buildRun(
            c.collect(text),
            {
              source: c.source,
              client: c.client,
              agent: opts.agent,
              fixture: opts.fixture,
              agentforgeVersion: version,
              ...(opts.profile ? { profile: opts.profile as RunResult['profile'] & string } : {}),
              ...(opts.budget ? { budget: opts.budget as RunResult['budget'] & string } : {}),
            },
            ctx.homeDir,
          );
        } catch (e) {
          if (e instanceof CollectorError) throw new UsageError(`${rest[0]}: ${e.message}`);
          throw e;
        }
      } else {
        throw new UsageError(
          `--from must be one of: ${[...Object.keys(COLLECTORS), 'manual'].join(', ')}`,
        );
      }
      await emit(ctx, opts, JSON.stringify(run, null, 2));
      return EXIT.OK;
    }
    case 'report': {
      allowOnly(sub, opts, ['json', 'out', 'evals', 'catalog']);
      const suite = await loadSuite(p, catalogRoot);
      if (suite.issues.some((i) => i.severity === 'error'))
        throw new UsageError('Benchmark cases are invalid; run "agentforge eval validate"');
      const runs = await Promise.all(rest.map((f) => loadRun(ctx, f)));
      const report = await buildReport(runs, suite, p.fixtures, version);
      await emit(
        ctx,
        opts,
        opts.json ? JSON.stringify(report, null, 2) : renderReportMarkdown(report),
      );
      return EXIT.OK;
    }
    case 'compare': {
      allowOnly(sub, opts, ['json', 'out', 'evals', 'catalog']);
      if (rest.length !== 2)
        throw new UsageError('Usage: agentforge eval compare <before.json> <after.json>');
      const suite = await loadSuite(p, catalogRoot);
      const [a, b] = await Promise.all(rest.map((f) => reportFrom(ctx, f, suite, p, version)));
      const result = compareReports(a!, b!, [rest[0]!, rest[1]!]);
      await emit(
        ctx,
        opts,
        opts.json ? JSON.stringify(result, null, 2) : renderComparisonMarkdown(result),
      );
      return result.regressions.length > 0 ? EXIT.ERROR : EXIT.OK;
    }
    default:
      throw new UsageError(
        `Usage: agentforge eval <${EVAL_SUBCOMMANDS.join('|')}> (see "agentforge help eval")`,
      );
  }
}
