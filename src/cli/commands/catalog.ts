import path from 'node:path';
import { estimateTokens } from '../../core/tokens.js';
import { renderFor } from '../../adapters/index.js';
import { checkRenderedFile } from '../../validator/rendered.js';
import {
  discoverCatalog,
  lintInstructions,
  loadComponent,
  toRegistryEntry,
  type CatalogIssue,
} from '../../registry/index.js';
import { COMPONENT_KINDS, SKILL_DOMAINS } from '../../core/types.js';
import { computeCatalogStats } from '../../evaluation/metrics/context.js';
import { EXIT, UsageError, type CliContext, type Options } from '../context.js';

function formatIssue(i: CatalogIssue): string {
  const where = i.path ? `${i.source}#${i.path}` : i.source;
  return `${i.severity.toUpperCase()} ${where} [${i.code}] ${i.message}`;
}

/** Reads manifests only; never instructions or references. */
export async function runList(ctx: CliContext, opts: Options, root: string): Promise<number> {
  if (opts.type !== undefined && !(COMPONENT_KINDS as readonly string[]).includes(opts.type)) {
    throw new UsageError(`--type must be one of: ${COMPONENT_KINDS.join(', ')}`);
  }
  const domains = [...new Set<string>(SKILL_DOMAINS)];
  if (opts.domain !== undefined && !domains.includes(opts.domain)) {
    throw new UsageError(`--domain must be one of: ${domains.join(', ')}`);
  }
  const catalog = await discoverCatalog(root);
  const { issues } = catalog;
  const entries = catalog.entries.filter(
    (e) =>
      (opts.type === undefined || e.manifest.kind === opts.type) &&
      (opts.domain === undefined || e.manifest.domain === opts.domain),
  );
  if (entries.length === 0) ctx.out(`No matching components in ${root}.`);
  for (const entry of entries) {
    const r = toRegistryEntry(entry);
    const cost = estimateTokens(`${r.id}: ${r.description}`);
    const deps = r.dependencies.length > 0 ? `  needs: ${r.dependencies.join(', ')}` : '';
    const domain = r.domain ? `  ${r.domain}` : '';
    ctx.out(
      `${r.kind.padEnd(5)} ${r.id}@${r.version}  [${r.targets.join(', ')}]  ~${cost.tokens} tokens (estimated)${domain}${deps}`,
    );
    if (opts.verbose) ctx.out(`      ${r.name}: ${r.description}\n      source: ${r.source}`);
  }
  issues.forEach((i) => ctx.err(formatIssue(i)));
  return issues.some((i) => i.severity === 'error') ? EXIT.ERROR : EXIT.OK;
}

export async function runValidate(ctx: CliContext, root: string): Promise<number> {
  const { entries, issues } = await discoverCatalog(root);
  for (const entry of entries) {
    const push = (severity: 'error' | 'warning', code: string, message: string) =>
      issues.push({ severity, code, path: '', message, source: entry.source });
    try {
      const component = await loadComponent(entry);
      for (const i of lintInstructions(component.instructions, component.manifest)) {
        issues.push({ ...i, source: entry.source });
      }
      // Validate what each client would receive, without writing anything.
      for (const platform of component.manifest.targets) {
        for (const file of renderFor(platform, component).files) {
          const check = checkRenderedFile(platform, file);
          check.errors.forEach((m) =>
            push('error', 'generated-invalid', `${platform} ${file.relativePath}: ${m}`),
          );
          check.warnings.forEach((m) =>
            push('warning', 'generated', `${platform} ${file.relativePath}: ${m}`),
          );
        }
      }
    } catch (e) {
      issues.push({
        severity: 'error',
        code: 'load-failed',
        path: '',
        message: (e as Error).message,
        source: path.relative(root, entry.dir).split(path.sep).join('/'),
      });
    }
  }
  issues.forEach((i) => ctx.err(formatIssue(i)));
  const errors = issues.filter((i) => i.severity === 'error').length;
  ctx.out(
    `${entries.length} component(s) checked, ${errors} error(s), ${issues.length - errors} warning(s).`,
  );
  return errors > 0 ? EXIT.ERROR : EXIT.OK;
}

/** Static efficiency report; sizes are measured, tokens are labeled estimates. */
export async function runStats(ctx: CliContext, opts: Options, root: string): Promise<number> {
  const catalog = await discoverCatalog(root);
  if (catalog.issues.some((i) => i.severity === 'error')) {
    ctx.err('Catalog has errors; run "agentforge validate" first.');
    return EXIT.ERROR;
  }
  const stats = await computeCatalogStats(catalog);
  if (opts.json) {
    ctx.out(JSON.stringify(stats, null, 2));
    return EXIT.OK;
  }
  ctx.out('skill                    discovery  SKILL.md (lines/chars)  refs (n/chars)  deps');
  for (const s of stats.skills) {
    ctx.out(
      `${s.id.padEnd(24)} ${String(s.discoveryChars).padStart(9)}  ${`${s.skillMdLines}/${s.skillMdChars}`.padStart(22)}  ${`${s.referenceCount}/${s.referenceChars}`.padStart(14)}  ${s.dependencies.join(', ')}`,
    );
  }
  const t = stats.totals;
  const est = (chars: number) => `~${Math.ceil(chars / 4)} tokens est.`;
  ctx.out('');
  ctx.out(
    `Always loaded (discovery): ${t.discoveryChars} chars (${est(t.discoveryChars)}), ${(t.codexFallbackBudgetShare * 100).toFixed(1)}% of Codex's 8,000-char fallback list budget`,
  );
  ctx.out(`Loaded on activation (all SKILL.md): ${t.skillMdChars} chars (${est(t.skillMdChars)})`);
  ctx.out(
    `Loaded only on demand (references): ${t.referenceChars} chars (${est(t.referenceChars)})`,
  );
  const authored = stats.duplicates.filter((d) => !d.generated);
  const generated = stats.duplicates.filter((d) => d.generated);
  ctx.out(
    `Duplicated lines across skills: ${authored.length} authored, ${generated.length} generated by the shared renderer`,
  );
  for (const d of authored) ctx.out(`  - "${d.text.slice(0, 70)}" in ${d.skills.join(', ')}`);
  ctx.out(`Method: ${stats.method}`);
  return EXIT.OK;
}
