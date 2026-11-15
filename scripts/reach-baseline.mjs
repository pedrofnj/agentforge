// Records the static search-reachability summary (requires `npm run build`).
// Usage: node scripts/reach-baseline.mjs <output.json> [note]
import { writeFileSync } from 'node:fs';
import process from 'node:process';
import { checkReachability, summarizeReach } from '../dist/evaluation/analyzers/reachability.js';
import { loadCaseSuite } from '../dist/evaluation/core/cases.js';
import { discoverCatalog, loadComponent } from '../dist/registry/index.js';

const [out, note = 'Static search reachability (no model runs).'] = process.argv.slice(2);
if (!out) throw new Error('usage: node scripts/reach-baseline.mjs <output.json> [note]');
const catalog = await discoverCatalog('.');
const suite = await loadCaseSuite('evals/cases', 'evals/fixtures', catalog);
const components = await Promise.all(catalog.entries.map(loadComponent));
const summary = summarizeReach(await checkReachability(suite.cases, components, 'evals/fixtures'));
writeFileSync(
  out,
  `${JSON.stringify({ note, casesDigest: suite.digest, ...summary }, null, 2)}\n`,
  { flag: 'wx' },
);
process.stdout.write(`${JSON.stringify(summary)}\n`);
