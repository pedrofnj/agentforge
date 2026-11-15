import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { renderFor } from '../../src/adapters/index.js';
import { BUDGETS, BUDGET_GUIDANCE } from '../../src/core/budgets.js';
import type { LoadedAgent } from '../../src/core/types.js';
import { compareReports } from '../../src/evaluation/analyzers/compare.js';
import { checkStructure, FULL_READ, LIMITS } from '../../src/evaluation/analyzers/structure.js';
import {
  CollectorError,
  collectClaudeJson,
  collectCodexJsonl,
  collectReportMarkdown,
} from '../../src/evaluation/collectors/index.js';
import { parseReportMarkdown } from '../../src/evaluation/collectors/report-markdown.js';
import {
  loadCaseSuite,
  validateCaseShape,
  type CaseSuite,
} from '../../src/evaluation/core/cases.js';
import { buildRun, validateRun } from '../../src/evaluation/core/run.js';
import type { RunResult } from '../../src/evaluation/core/types.js';
import { computeCatalogStats, type CatalogStats } from '../../src/evaluation/metrics/context.js';
import { evaluateQuality, normalizeFindingPath } from '../../src/evaluation/metrics/quality.js';
import {
  renderComparisonMarkdown,
  renderReportMarkdown,
} from '../../src/evaluation/reporters/markdown.js';
import { buildReport } from '../../src/evaluation/reporters/report.js';
import { sanitizeDeep, sanitizeText } from '../../src/evaluation/reporters/sanitize.js';
import { discoverCatalog, loadComponent } from '../../src/registry/index.js';
import { makeSandbox } from '../helpers.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const EVALS = path.join(ROOT, 'evals');
const FIXTURES = path.join(EVALS, 'fixtures');

let suite: CaseSuite;
beforeAll(async () => {
  suite = await loadCaseSuite(path.join(EVALS, 'cases'), FIXTURES, await discoverCatalog(ROOT));
});

/** A report in the evidence-reporting format with known ground-truth outcomes on php-app. */
const PHP_REPORT = `## Findings
### SEC-001 [CRITICAL] SQL injection in login query
- Category: Injection (CWE-89)
- Location: src/Auth.php:3
- Evidence: \`$db->query("SELECT password FROM users WHERE name = '" . $user . "'")\`
- Status: confirmed
### SEC-002 [HIGH] Weak password hashing with MD5
- Category: Cryptography (CWE-916)
- Location: \`php-app/src/Auth.php:4\`
- Status: likely
### SEC-003 [MEDIUM] SQL injection in report lookup
- Category: Injection
- Location: src/Report.php:4
- Status: likely
### SEC-004 [HIGH] MD5 used for passwords
- Category: Weak hash
- Location: src/Auth.php:4-4
- Status: confirmed
### SEC-005 [HIGH] Injection risk somewhere
- Category: SQL injection
- Status: likely

## Needs investigation
- SEC-006 Report lookup may lack an ownership check at src/Report.php:4; to confirm: check callers

## Coverage
- Reviewed: src/
`;

const run = (
  findings = parseReportMarkdown(PHP_REPORT),
  extra: Partial<RunResult> = {},
): RunResult =>
  buildRun(
    {
      findings,
      usage: collectReportMarkdown('').usage,
      execution: collectReportMarkdown('').execution,
      notes: [],
    },
    {
      source: 'report-markdown',
      client: 'unknown',
      agent: 'appsec-auditor',
      fixture: 'php-app',
      profile: 'standard',
      budget: 'balanced',
      ...extra,
    },
  );

describe('benchmark suite and ground truth', () => {
  it('bundled cases are valid and cover every category with vulnerable and safe cases', () => {
    expect(suite.issues).toEqual([]);
    expect(suite.cases.length).toBeGreaterThanOrEqual(40);
    for (const cat of ['security', 'architecture', 'quality', 'performance', 'infrastructure']) {
      const cs = suite.cases.filter((c) => c.category === cat);
      expect(
        cs.some((c) => c.kind === 'vulnerable'),
        cat,
      ).toBe(true);
      expect(
        cs.some((c) => c.kind === 'safe'),
        cat,
      ).toBe(true);
    }
    const ids = suite.cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of suite.cases.filter((x) => x.kind === 'vulnerable')) {
      expect(c.evidenceLines.length, c.id).toBe(c.expected!.evidence.length);
    }
  });

  it('spans several languages and configuration formats', () => {
    expect(new Set(suite.cases.map((c) => c.fixture)).size).toBeGreaterThanOrEqual(7);
  });

  it.each([
    [{ kind: 'vulnerable' }, 'vulnerable cases need expected'],
    [{ kind: 'safe', expected: {} }, 'safe cases must not have expected'],
    [{ category: 'style' }, 'category must be one of'],
    [{ acceptance: [] }, 'acceptance must list at least one criterion'],
    [{ id: 'Bad Id' }, 'id must be kebab-case'],
  ])('rejects malformed case %j', (patch, message) => {
    const base = {
      id: 'x',
      category: 'security',
      subcategory: 's',
      kind: 'safe',
      description: 'd',
      fixture: 'php-app',
      agent: 'appsec-auditor',
      files: ['src/Auth.php'],
      keywords: ['sql'],
      acceptance: ['a'],
      falsePositive: ['b'],
      limitations: [],
    };
    expect(validateCaseShape({ ...base, ...patch }).join('\n')).toContain(message);
  });

  it('rejects ambiguous or missing evidence, unknown agents, traversal and duplicates', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'af-cases-'));
    const mk = (id: string, patch: object) => ({
      id,
      category: 'security',
      subcategory: 'injection',
      kind: 'vulnerable',
      description: 'd',
      fixture: 'php-app',
      agent: 'appsec-auditor',
      files: ['src/Auth.php'],
      expected: {
        issue: 'i',
        evidence: [{ file: 'src/Auth.php', contains: 'md5($password)' }],
        severity: 'high',
        keywords: ['md5'],
      },
      acceptance: ['a'],
      falsePositive: ['b'],
      limitations: [],
      ...patch,
    });
    await writeFile(
      path.join(dir, 'a.json'),
      JSON.stringify({
        schemaVersion: 1,
        cases: [
          mk('ambiguous', {
            expected: {
              issue: 'i',
              evidence: [{ file: 'src/Auth.php', contains: '$' }],
              severity: 'high',
              keywords: ['x'],
            },
          }),
          mk('missing-file', {
            files: ['src/Nope.php'],
            expected: {
              issue: 'i',
              evidence: [{ file: 'src/Nope.php', contains: 'x' }],
              severity: 'high',
              keywords: ['x'],
            },
          }),
          mk('bad-agent', { agent: 'ghost-agent' }),
          mk('escape', { fixture: '../outside' }),
          mk('dup', {}),
          mk('dup', {}),
        ],
      }),
    );
    const s = await loadCaseSuite(dir, FIXTURES, await discoverCatalog(ROOT));
    const msgs = s.issues.map((i) => `${i.caseId}: ${i.message}`).join('\n');
    expect(msgs).toMatch(/ambiguous: evidence "\$" must match exactly one line/);
    expect(msgs).toMatch(/missing-file: missing fixture file/);
    expect(msgs).toMatch(/bad-agent: unknown agent/);
    expect(msgs).toMatch(/escape: .*\.\./);
    expect(msgs).toMatch(/dup: duplicate case id/);
  });
});

describe('quality metrics', () => {
  it('computes precision, recall, F1, FP rate, evidence validity and task success with stated denominators', async () => {
    const q = await evaluateQuality(run(), suite.cases, FIXTURES);
    expect(q.scope).toEqual({ vulnerable: 3, safe: 1 });
    expect([q.truePositives, q.falsePositives, q.duplicates, q.needsInvestigation]).toEqual([
      2, 2, 1, 1,
    ]);
    expect(q.precision).toMatchObject({ status: 'measured', value: 0.5, note: '2/4' });
    expect(q.recall).toMatchObject({ status: 'measured', note: '2/3' });
    expect(q.recall.value).toBeCloseTo(2 / 3);
    expect(q.f1.value).toBeCloseTo((2 * 0.5 * (2 / 3)) / (0.5 + 2 / 3));
    expect(q.falsePositiveRate).toMatchObject({ value: 1, note: '1/1' });
    expect(q.evidenceValidity).toMatchObject({ note: '5/6' });
    expect(q.severityAgreement).toMatchObject({ value: 1, note: '2/2' });
    expect(q.taskSuccess).toMatchObject({ value: 0.5, note: '2/4' });
    expect(q.outcomes.find((o) => o.caseId === 'sec-idor-php')).toMatchObject({
      hit: false,
      investigatedOnly: true,
    });
  });

  it('naming the category without the right location is not a detection', async () => {
    const q = await evaluateQuality(
      run([
        {
          title: 'SQL injection (CWE-89)',
          cwe: 'CWE-89',
          status: 'confirmed',
          location: { file: 'src/Auth.php', startLine: 40 },
        },
      ]),
      suite.cases,
      FIXTURES,
    );
    expect(q.truePositives).toBe(0);
    expect(q.falsePositives).toBe(1);
    expect(q.evidenceValidity.value).toBe(0); // line 40 does not exist
  });

  it('a run without findings: precision and F1 unavailable, recall 0, safe cases pass', async () => {
    const q = await evaluateQuality(run([]), suite.cases, FIXTURES);
    expect(q.precision.status).toBe('unavailable');
    expect(q.f1.status).toBe('unavailable');
    expect(q.recall).toMatchObject({ status: 'measured', value: 0 });
    expect(q.falsePositiveRate).toMatchObject({ status: 'measured', value: 0 });
    expect(q.evidenceValidity.status).toBe('unavailable');
  });

  it('a fixture/agent pair without cases reports unavailable instead of zero', async () => {
    const q = await evaluateQuality(
      run([], { agent: 'performance-auditor' }),
      suite.cases,
      FIXTURES,
    );
    expect(q.recall.status).toBe('unavailable');
    expect(q.taskSuccess.status).toBe('unavailable');
  });

  it('normalizes absolute, prefixed and Windows paths', () => {
    expect(normalizeFindingPath('C:\\work\\php-app\\src\\Auth.php', 'php-app')).toBe(
      'src/Auth.php',
    );
    expect(normalizeFindingPath('./src/Auth.php', 'php-app')).toBe('src/Auth.php');
    expect(normalizeFindingPath('php-app/src/Auth.php', 'php-app')).toBe('src/Auth.php');
  });
});

describe('collectors and import', () => {
  const claude = (extra: object = {}) =>
    JSON.stringify({
      type: 'result',
      subtype: 'success',
      result: PHP_REPORT,
      session_id: 's',
      total_cost_usd: 0.12,
      duration_ms: 45000,
      num_turns: 7,
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 20,
        cache_read_input_tokens: 300,
      },
      ...extra,
    });

  it('Claude Code json: modelUsage (includes subagents) wins; categories kept, total is a documented sum', () => {
    const c = collectClaudeJson(
      claude({
        modelUsage: {
          'claude-sonnet-5-5': {
            inputTokens: 1000,
            outputTokens: 400,
            cacheReadInputTokens: 5000,
            cacheCreationInputTokens: 200,
            costUSD: 0.5,
          },
        },
      }),
    );
    expect(c.usage).toMatchObject({
      provider: 'anthropic',
      inputTokens: { status: 'measured', value: 1000 },
      cacheReadTokens: { value: 5000 },
      cacheWriteTokens: { value: 200 },
      totalTokens: { status: 'measured', value: 6600 },
      costUsd: { value: 0.5 },
      model: { value: 'claude-sonnet-5-5' },
      reasoningTokens: { status: 'unavailable' },
    });
    expect(c.execution).toMatchObject({
      durationMs: { value: 45000 },
      turns: { value: 7 },
      toolCalls: { status: 'unavailable' },
    });
    expect(c.findings).toHaveLength(6);
  });

  it('Claude Code json without modelUsage uses result usage and says it excludes subagents', () => {
    const c = collectClaudeJson(claude());
    expect(c.usage.totalTokens.value).toBe(470);
    expect(c.notes.join(' ')).toMatch(/excludes subagent/);
    expect(() => collectClaudeJson('not json')).toThrow(CollectorError);
    expect(() => collectClaudeJson('{"usage":{}}')).toThrow(/missing "result"/);
  });

  it('Codex exec jsonl: sums turns, keeps cached/reasoning separate, no invented total', () => {
    const lines = [
      { type: 'thread.started', thread_id: 't' },
      { type: 'turn.started' },
      {
        type: 'item.completed',
        item: {
          id: 'i1',
          type: 'command_execution',
          command: 'cat secrets.env',
          status: 'completed',
        },
      },
      { type: 'item.completed', item: { id: 'i2', type: 'reasoning' } },
      {
        type: 'turn.completed',
        usage: {
          input_tokens: 2000,
          cached_input_tokens: 1500,
          output_tokens: 100,
          reasoning_output_tokens: 40,
        },
      },
      {
        type: 'item.completed',
        item: { id: 'i3', type: 'command_execution', command: 'rg token', status: 'completed' },
      },
      { type: 'item.completed', item: { id: 'i4', type: 'agent_message', text: PHP_REPORT } },
      {
        type: 'turn.completed',
        usage: {
          input_tokens: 3000,
          cached_input_tokens: 2500,
          output_tokens: 200,
          reasoning_output_tokens: 60,
        },
      },
    ]
      .map((l) => JSON.stringify(l))
      .join('\n');
    const c = collectCodexJsonl(lines);
    expect(c.usage).toMatchObject({
      provider: 'openai',
      inputTokens: { value: 5000 },
      cacheReadTokens: { value: 4000 },
      outputTokens: { value: 300 },
      reasoningTokens: { value: 100 },
      totalTokens: { status: 'unavailable' },
    });
    expect(c.execution).toMatchObject({ toolCalls: { value: 2 }, turns: { value: 2 } });
    expect(JSON.stringify(c)).not.toContain('cat secrets.env'); // commands are never stored
    expect(() => collectCodexJsonl('{"type":"turn.started"}')).toThrow(/agent_message/);
  });

  it('run files are validated; incomplete data stays unavailable', () => {
    const r = run();
    expect(validateRun(r)).toEqual([]);
    expect(r.usage.inputTokens.status).toBe('unavailable');
    expect(
      validateRun({ ...r, usage: { ...r.usage, inputTokens: { status: 'measured' } } }),
    ).toContain('usage.inputTokens.value must be a non-negative number');
    expect(validateRun({ ...r, fixture: '../etc' }).join()).toMatch(/fixture/);
    expect(validateRun({ ...r, findings: [{ title: 't', status: 'maybe' }] })).toContain(
      'findings[0].status is invalid',
    );
  });
});

describe('sanitization', () => {
  it('redacts secrets and home paths in free text', () => {
    const s = sanitizeText(
      'password = "hunter2secret" key AKIAABCDEFGHIJKLMNOP token ghp_abcdefghijklmnopqrstuvwxyz012345 at /home/alice/x',
      '/home/alice',
    );
    expect(s).not.toMatch(/hunter2secret|AKIAABCDEFGHIJKLMNOP|ghp_abcdef|\/home\/alice/);
    expect(s).toContain('~/x');
  });

  it('applies to imported runs and reports', () => {
    const r = run([
      {
        title: 'Leaked key sk-abcdefghijklmnopqrstuvwx',
        evidence: 'api_key: "sk-abcdefghijklmnopqrstuvwx"',
        status: 'confirmed',
        location: { file: 'src/Auth.php', startLine: 3 },
      },
    ]);
    expect(JSON.stringify(r)).not.toContain('sk-abcdefghijklmnopqrstuvwx');
    expect(JSON.stringify(sanitizeDeep({ a: ['Bearer abcdefghijklmnopqrstuvwxyz'] }))).toContain(
      '[REDACTED]',
    );
  });
});

describe('reports and comparison', () => {
  it('JSON report is deterministic, labeled and honest about missing behavioral data', async () => {
    const a = await buildReport([run()], suite, FIXTURES, '0.1.0');
    const b = await buildReport([run()], suite, FIXTURES, '0.1.0');
    expect(a).toEqual(b);
    expect(a.kind).toBe('agentforge-evaluation-report');
    expect(a.casesDigest).toBe(suite.digest);
    expect(a.aggregates[0]).toMatchObject({
      agent: 'appsec-auditor',
      profile: 'standard',
      budget: 'balanced',
      runs: 1,
    });
    expect(a.aggregates[0]!.tokens.totalTokens.status).toBe('unavailable');
    const empty = await buildReport([], suite, FIXTURES, '0.1.0');
    expect(empty.behavioralEvidence).toMatch(/has not been measured/);
    expect(empty.coverage.value).toBe(0);
  });

  it('Markdown report shows metrics with status labels, misses and limitations', async () => {
    const md = renderReportMarkdown(await buildReport([run()], suite, FIXTURES, '0.1.0'));
    expect(md).toContain('| unknown | appsec-auditor | standard | balanced | 1 | 50.0% (2/4) |');
    expect(md).toContain('Missed cases: sec-idor-php (needs investigation only)');
    expect(md).toContain('Safe cases flagged: sec-safe-prepared-php');
    expect(md).toMatch(/input unavailable: report only/);
    expect(md).toContain('## Limitations');
  });

  it('comparison flags quality drops and token growth, and tolerates unavailable data', async () => {
    const withUsage = (input: number, findings = parseReportMarkdown(PHP_REPORT)) => {
      const r = run(findings);
      r.usage = {
        ...r.usage,
        inputTokens: { status: 'measured', value: input },
        totalTokens: { status: 'measured', value: input },
      };
      return r;
    };
    const before = await buildReport([withUsage(1000)], suite, FIXTURES, '0.1.0');
    const after = await buildReport(
      [withUsage(1300, parseReportMarkdown(PHP_REPORT).slice(1))],
      suite,
      FIXTURES,
      '0.1.0',
    );
    const c = compareReports(before, after);
    expect(c.sameCases).toBe(true);
    expect(c.regressions.join('\n')).toMatch(/recall dropped/);
    expect(c.regressions.join('\n')).toMatch(/inputTokens grew 30.0%/);
    expect(renderComparisonMarkdown(c)).toContain('## Regressions');
    expect(compareReports(before, before).regressions).toEqual([]);
  });
});

describe('budget profiles', () => {
  it('three budgets, independent from analysis profiles, rendered into every agent for both clients', async () => {
    expect(BUDGETS).toEqual(['economy', 'balanced', 'thorough']);
    const catalog = await discoverCatalog(ROOT);
    const agents = (await Promise.all(catalog.entries.map(loadComponent))).filter(
      (c): c is LoadedAgent => c.manifest.kind === 'agent',
    );
    for (const a of agents) {
      for (const platform of ['claude-code', 'codex'] as const) {
        const body = renderFor(platform, a).files[0]!.content;
        const budgetSection = body.slice(body.indexOf('## Resource budget'));
        expect(budgetSection).toContain('default balanced');
        for (const b of BUDGETS)
          expect(budgetSection).toContain(`- **${b}**: ${BUDGET_GUIDANCE[b]}.`);
        expect(body.indexOf('## Analysis profiles')).toBeLessThan(
          body.indexOf('## Resource budget'),
        );
        expect(budgetSection).toContain('Never skip evidence a finding needs.');
      }
    }
  });
});

describe('structural regressions', () => {
  let catalogStats: CatalogStats;
  beforeAll(async () => {
    catalogStats = await computeCatalogStats(await discoverCatalog(ROOT));
  });

  it('the bundled catalog passes against the accepted baseline', async () => {
    const catalog = await discoverCatalog(ROOT);
    const components = await Promise.all(catalog.entries.map(loadComponent));
    const baseline = JSON.parse(
      await readFile(path.join(EVALS, 'baselines', 'context.json'), 'utf8'),
    ) as CatalogStats;
    expect(checkStructure(catalogStats, baseline, components)).toEqual([]);
  });

  it('growth since the pre-Phase-5 baseline stays within limits', async () => {
    const phase4 = JSON.parse(
      await readFile(path.join(EVALS, 'baselines', 'context-phase4.json'), 'utf8'),
    ) as CatalogStats;
    expect(checkStructure(catalogStats, phase4, []).filter((i) => i.severity === 'error')).toEqual(
      [],
    );
  });

  it('flags full-read instructions, growth beyond limits and new authored duplication', () => {
    expect(FULL_READ.test('First, read all files in the repository.')).toBe(true);
    expect(FULL_READ.test('Search before reading; never read the whole file.')).toBe(false);
    const inflated: CatalogStats = JSON.parse(JSON.stringify(catalogStats));
    inflated.totals.discoveryChars = Math.ceil(
      catalogStats.totals.discoveryChars * (1 + LIMITS.discoveryGrowth + 0.05),
    );
    inflated.skills[0]!.skillMdChars *= 2;
    inflated.agents[0]!.startupChars['claude-code']! *= 2;
    inflated.duplicates.push({ text: 'x'.repeat(30), skills: ['a', 'b'], generated: false });
    const codes = checkStructure(inflated, catalogStats, [])
      .map((i) => i.code)
      .sort();
    expect(codes).toEqual(['agent-growth', 'discovery-growth', 'duplication', 'skill-growth']);
  });
});

describe('eval CLI', () => {
  it('validate, list, import, report and compare work offline end to end', async () => {
    const sbx = await makeSandbox();
    expect((await sbx.cli(['eval', 'validate'])).code).toBe(0);
    const list = await sbx.cli(['eval', 'list', '--category', 'architecture']);
    expect(list.out).toContain('arch-cycle-py');
    expect(list.out).toContain('6 case(s).');

    const dir = path.join(sbx.root, 'runs');
    await mkdir(dir);
    await writeFile(path.join(dir, 'report.md'), PHP_REPORT);
    const imp = await sbx.cli([
      'eval',
      'import',
      path.join(dir, 'report.md'),
      '--from',
      'report-md',
      '--agent',
      'appsec-auditor',
      '--fixture',
      'php-app',
      '--profile',
      'quick',
      '--budget',
      'economy',
      '--out',
      path.join(dir, 'run.json'),
    ]);
    expect(imp.code, imp.err).toBe(0);
    const again = await sbx.cli([
      'eval',
      'import',
      path.join(dir, 'report.md'),
      '--from',
      'report-md',
      '--agent',
      'appsec-auditor',
      '--fixture',
      'php-app',
      '--out',
      path.join(dir, 'run.json'),
    ]);
    expect(again).toMatchObject({ code: 2 });
    expect(again.err).toContain('Refusing to overwrite');

    const md = await sbx.cli(['eval', 'report', path.join(dir, 'run.json')]);
    expect(md.code).toBe(0);
    expect(md.out).toContain('| unknown | appsec-auditor | quick | economy | 1 |');
    const json = JSON.parse(
      (await sbx.cli(['eval', 'report', path.join(dir, 'run.json'), '--json'])).out,
    );
    expect(json.runs[0].quality.truePositives).toBe(2);

    const cmp = await sbx.cli([
      'eval',
      'compare',
      path.join(dir, 'run.json'),
      path.join(dir, 'run.json'),
    ]);
    expect(cmp.code).toBe(0);
    expect(cmp.out).toContain('No regressions detected');
  });

  it('explains that benchmarks are not in the npm package when the evals dir is missing', async () => {
    const sbx = await makeSandbox();
    const r = await sbx.cli(['eval', 'validate', '--evals', path.join(sbx.root, 'no-evals')]);
    expect(r.code).toBe(2);
    expect(r.err).toContain('not included in the npm package');
  });

  it('rejects bad usage with exit code 2', async () => {
    const sbx = await makeSandbox();
    expect((await sbx.cli(['eval'])).code).toBe(2);
    expect((await sbx.cli(['eval', 'run'])).code).toBe(2);
    expect((await sbx.cli(['eval', 'list', '--category', 'style'])).code).toBe(2);
    expect((await sbx.cli(['eval', 'validate', '--json'])).code).toBe(2);
    expect((await sbx.cli(['eval', 'import', 'x.md', '--from', 'report-md'])).code).toBe(2);
    expect(
      (
        await sbx.cli([
          'eval',
          'import',
          'x.md',
          '--from',
          'telepathy',
          '--agent',
          'a',
          '--fixture',
          'b',
        ])
      ).code,
    ).toBe(2);
    expect((await sbx.cli(['list', '--from', 'manual'])).code).toBe(2);
  });
});
