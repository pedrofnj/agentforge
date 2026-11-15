import { copyFile, mkdir, open, readFile, rm, rmdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PathSafetyError, resolveInside } from '../core/paths.js';
import {
  assertInside,
  atomicWrite,
  inspectPath,
  missingDirs,
  pruneEmptyDirs,
  readIfExists,
  sha256,
  tempPathFor,
} from './fs-safe.js';
import { MUTATING, type FileAction, type Operation, type Plan } from './plan.js';
import {
  BACKUP_DIR,
  JOURNAL_FILE,
  PRESERVED_DIR,
  STATE_FILE,
  StateError,
  readState,
  writeState,
} from './state.js';

/**
 * Write-ahead journal. Exists only while an operation runs, so it doubles as
 * a lock. If present at startup, the previous run was interrupted and is
 * rolled back. A journal can come from anywhere (a project checkout may ship
 * one), so it is validated against trusted locations before it is used, and
 * rollback only undoes what this tool demonstrably wrote.
 */
interface JournalStep {
  kind: 'write' | 'remove';
  root: string;
  path: string;
  /** Copy of the previous content, when the file existed. */
  backup?: string;
  /** Hash of the file when the plan was made (update/overwrite/remove). */
  expectedSha?: string;
  /** Hash of what we write. */
  writtenSha?: string;
  createdDirs: string[];
}

interface Journal {
  version: 1;
  pid: number;
  startedAt: string;
  operation: Operation;
  status: 'preparing' | 'applying';
  txDir: string;
  previousState: string | null;
  steps: JournalStep[];
}

export class BusyError extends Error {
  override name = 'BusyError';
}

/** The manifest changed between planning and applying (another run finished meanwhile). */
export class StaleStateError extends Error {
  override name = 'StaleStateError';
}

export interface ApplyResult {
  written: number;
  removed: number;
  /** Where originals of overwritten files were preserved, if any. */
  preservedDir?: string;
}

export interface ApplyHooks {
  /** Test seam: runs before each mutating step (throw to simulate a failure). */
  beforeStep?: (index: number) => void | Promise<void>;
  /** Test seam: false simulates a crash (no in-process rollback). */
  rollbackOnError?: boolean;
}

const journalPath = (stateDir: string) => path.join(stateDir, JOURNAL_FILE);

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export async function readJournal(stateDir: string): Promise<Journal | null> {
  const text = await readIfExists(journalPath(stateDir));
  if (text === null) return null;
  try {
    return JSON.parse(text) as Journal;
  } catch {
    throw new StateError(`${journalPath(stateDir)} is corrupt; inspect it and remove it manually`);
  }
}

const isInside = (root: string, p: string) => {
  const rel = path.relative(path.resolve(root), path.resolve(p));
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
};
const sameDir = (a: string, b: string) => path.relative(path.resolve(a), path.resolve(b)) === '';

/**
 * Rejects a journal that points anywhere except this state directory's backups
 * and the client locations the caller trusts for this scope.
 */
function validateJournal(j: unknown, stateDir: string, trustedRoots: string[]): Journal {
  const fail = (why: string): never => {
    throw new StateError(
      `${journalPath(stateDir)} failed validation (${why}); it was not used. Inspect it and remove it manually.`,
    );
  };
  if (typeof j !== 'object' || j === null) fail('not an object');
  const journal = j as Journal;
  if (journal.status !== 'preparing' && journal.status !== 'applying') fail('unknown status');
  if (typeof journal.pid !== 'number') fail('missing pid');
  if (
    typeof journal.txDir !== 'string' ||
    !isInside(path.join(stateDir, BACKUP_DIR), journal.txDir)
  ) {
    fail('transaction directory outside the state backups');
  }
  if (journal.previousState !== null && typeof journal.previousState !== 'string')
    fail('bad state');
  if (!Array.isArray(journal.steps)) fail('missing steps');
  for (const s of journal.steps) {
    if (typeof s !== 'object' || s === null || (s.kind !== 'write' && s.kind !== 'remove'))
      fail('bad step');
    if (typeof s.root !== 'string' || !trustedRoots.some((r) => sameDir(r, s.root))) {
      fail('step outside the client locations');
    }
    if (typeof s.path !== 'string' || !isInside(s.root, s.path)) fail('step path escapes its root');
    if (
      s.backup !== undefined &&
      (typeof s.backup !== 'string' || !isInside(journal.txDir, s.backup))
    ) {
      fail('backup outside the transaction directory');
    }
    if (!Array.isArray(s.createdDirs)) fail('bad created dirs');
    for (const d of s.createdDirs) {
      // Created dirs are the step's parents: inside its root, or ancestors of the root itself.
      if (
        typeof d !== 'string' ||
        !(isInside(s.root, d) || isInside(d, s.root) || sameDir(d, s.root))
      ) {
        fail('created directory unrelated to the step');
      }
    }
  }
  return journal;
}

/**
 * Rolls back an interrupted operation. Returns true if there was one.
 * `trustedRoots` are the client location dirs for this scope.
 */
export async function recover(stateDir: string, trustedRoots: string[]): Promise<boolean> {
  const raw = await readJournal(stateDir);
  if (!raw) return false;
  const journal = validateJournal(raw, stateDir, trustedRoots);
  if (journal.pid !== process.pid && isProcessAlive(journal.pid)) {
    throw new BusyError(
      `Another AgentForge operation (pid ${journal.pid}) is running on ${stateDir}`,
    );
  }
  await rollback(stateDir, journal);
  return true;
}

/**
 * Idempotent and conservative: a file is restored or removed only if its
 * current content is what this transaction wrote (or it is gone after a
 * remove). Anything else, such as a user edit made meanwhile, is left alone.
 */
async function rollback(stateDir: string, journal: Journal): Promise<void> {
  if (journal.status === 'applying') {
    for (const step of [...journal.steps].reverse()) {
      assertInside(step.root, step.path);
      await rm(tempPathFor(step.path), { force: true });
      const status = await inspectPath(step.root, step.path);
      const ours = status.kind === 'file' && status.sha256 === step.writtenSha;
      if (step.kind === 'remove') {
        if (status.kind === 'missing' && step.backup) {
          await atomicWrite(step.path, await readFile(step.backup));
        }
      } else if (ours) {
        if (step.backup) await atomicWrite(step.path, await readFile(step.backup));
        else await rm(step.path);
      }
      for (const dir of [...step.createdDirs].reverse()) await rmdir(dir).catch(() => undefined);
    }
    const stateFile = path.join(stateDir, STATE_FILE);
    if (journal.previousState === null) await rm(stateFile, { force: true });
    else await atomicWrite(stateFile, journal.previousState);
  }
  await removeTxDir(stateDir, journal.txDir);
  await rm(journalPath(stateDir), { force: true });
}

async function removeTxDir(stateDir: string, txDir: string): Promise<void> {
  await rm(txDir, { recursive: true, force: true });
  await pruneEmptyDirs(path.dirname(txDir), stateDir);
}

async function ensureProjectGitignore(stateDir: string) {
  const file = path.join(stateDir, '.gitignore');
  await writeFile(file, `${JOURNAL_FILE}\n${BACKUP_DIR}/\n${PRESERVED_DIR}/\n*.agentforge-tmp\n`, {
    flag: 'wx',
  }).catch((e: NodeJS.ErrnoException) => {
    if (e.code !== 'EEXIST') throw e;
  });
}

/** Applies a conflict-free plan atomically: all changes land, or none do. */
export async function applyPlan(plan: Plan, hooks: ApplyHooks = {}): Promise<ApplyResult> {
  if (plan.conflicts.length > 0)
    throw new Error('Refusing to apply a plan with unresolved conflicts');
  const { stateDir } = plan;
  await mkdir(stateDir, { recursive: true });
  if (plan.scope === 'project') await ensureProjectGitignore(stateDir);

  const txId = `${Date.now()}-${process.pid}`;
  const txDir = path.join(stateDir, BACKUP_DIR, txId);
  const mutating = plan.actions.filter((a) => MUTATING.has(a.kind));
  const steps: JournalStep[] = [];
  for (const [i, a] of mutating.entries()) {
    const step: JournalStep = {
      kind: a.kind === 'remove' ? 'remove' : 'write',
      root: a.root,
      path: a.absPath,
      createdDirs: a.kind === 'remove' ? [] : await missingDirs(path.dirname(a.absPath)),
    };
    if (a.kind !== 'create') {
      step.backup = path.join(txDir, String(i));
      if (a.expectedSha) step.expectedSha = a.expectedSha;
    }
    if (step.kind === 'write') step.writtenSha = sha256(a.content ?? '');
    steps.push(step);
  }

  // Exclusive create = lock. Fails if another run (or an unrecovered one) holds it.
  const handle = await open(journalPath(stateDir), 'wx').catch((e: NodeJS.ErrnoException) => {
    if (e.code === 'EEXIST')
      throw new BusyError(`An AgentForge operation is pending on ${stateDir}`);
    throw e;
  });
  let journal: Journal;
  try {
    // Under the lock: the manifest must still be the one the plan was built from.
    const current = JSON.stringify(await readState(stateDir));
    if (current !== plan.previousStateJson) {
      throw new StaleStateError(
        'AgentForge state changed after this plan was made (another operation finished). Nothing was changed; run the command again.',
      );
    }
    journal = {
      version: 1,
      pid: process.pid,
      startedAt: new Date().toISOString(),
      operation: plan.operation,
      status: 'preparing',
      txDir,
      previousState: await readIfExists(path.join(stateDir, STATE_FILE)),
      steps,
    };
    await handle.writeFile(JSON.stringify(journal));
    await handle.sync();
  } catch (e) {
    await handle.close();
    await rm(journalPath(stateDir), { force: true });
    throw e;
  }
  await handle.close();

  let preservedDir: string | undefined;
  try {
    await mkdir(txDir, { recursive: true });
    for (const step of steps) {
      if (!step.backup) continue;
      await copyFile(step.path, step.backup);
      // The backup must be the content that was approved; otherwise the file changed.
      if (step.expectedSha && sha256(await readFile(step.backup)) !== step.expectedSha) {
        throw new StaleStateError(
          `${step.path} changed after planning; nothing was changed. Run the command again.`,
        );
      }
    }
    for (const a of mutating.filter((x) => x.kind === 'overwrite')) {
      preservedDir = path.join(stateDir, PRESERVED_DIR, txId);
      const dest = resolveInside(preservedDir, `${a.platform}/${a.location}/${a.relativePath}`);
      await mkdir(path.dirname(dest), { recursive: true });
      await copyFile(a.absPath, dest);
    }

    journal.status = 'applying';
    await atomicWrite(journalPath(stateDir), JSON.stringify(journal));

    for (const [i, step] of steps.entries()) {
      await hooks.beforeStep?.(i);
      await performStep(step, mutating[i]!);
    }
    await writeState(stateDir, plan.nextState);
    await rm(journalPath(stateDir)); // commit point
    await removeTxDir(stateDir, txDir);
  } catch (e) {
    if (hooks.rollbackOnError !== false) await rollback(stateDir, journal);
    throw e;
  }

  return {
    written: steps.filter((s) => s.kind === 'write').length,
    removed: steps.filter((s) => s.kind === 'remove').length,
    ...(preservedDir ? { preservedDir } : {}),
  };
}

async function performStep(step: JournalStep, action: FileAction): Promise<void> {
  // Re-check right before touching the disk (narrows the window for swapped links).
  const status = await inspectPath(step.root, step.path);
  if (status.kind === 'symlink' || status.kind === 'not-a-file') {
    throw new PathSafetyError(`Refusing to touch ${step.path}: ${status.kind}`);
  }
  if (action.kind === 'create' && status.kind === 'file') {
    throw new Error(`${step.path} appeared after planning; aborting without overwriting it`);
  }
  if (step.expectedSha && (status.kind !== 'file' || status.sha256 !== step.expectedSha)) {
    throw new StaleStateError(
      `${step.path} changed after planning; aborting without touching it. Run the command again.`,
    );
  }
  if (step.kind === 'write') {
    await atomicWrite(step.path, action.content ?? '');
  } else {
    await rm(step.path, { force: true });
    await pruneEmptyDirs(path.dirname(step.path), step.root);
  }
}
