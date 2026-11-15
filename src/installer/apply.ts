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
  writeState,
} from './state.js';

/**
 * Write-ahead journal. Exists only while an operation runs, so it doubles as
 * a lock. If present at startup, the previous run was interrupted and is
 * rolled back to the exact pre-operation state (files and manifest).
 */
interface JournalStep {
  kind: 'write' | 'remove';
  root: string;
  path: string;
  /** Copy of the previous content, when the file existed. */
  backup?: string;
  /** Hash of what we write: rollback deletes a created file only if it still matches. */
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

/** Rolls back an interrupted operation. Returns true if there was one. */
export async function recover(stateDir: string): Promise<boolean> {
  const journal = await readJournal(stateDir);
  if (!journal) return false;
  if (journal.pid !== process.pid && isProcessAlive(journal.pid)) {
    throw new BusyError(
      `Another AgentForge operation (pid ${journal.pid}) is running on ${stateDir}`,
    );
  }
  await rollback(stateDir, journal);
  return true;
}

async function rollback(stateDir: string, journal: Journal): Promise<void> {
  if (journal.status === 'applying') {
    for (const step of [...journal.steps].reverse()) {
      assertInside(step.root, step.path); // journal content is not trusted blindly
      await rm(tempPathFor(step.path), { force: true });
      if (step.backup) {
        await atomicWrite(step.path, await readFile(step.backup));
      } else if (step.kind === 'write') {
        const status = await inspectPath(step.root, step.path);
        if (status.kind === 'file' && status.sha256 === step.writtenSha) await rm(step.path);
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
    if (a.kind !== 'create') step.backup = path.join(txDir, String(i));
    if (step.kind === 'write') step.writtenSha = sha256(a.content ?? '');
    steps.push(step);
  }

  const journal: Journal = {
    version: 1,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    operation: plan.operation,
    status: 'preparing',
    txDir,
    previousState: await readIfExists(path.join(stateDir, STATE_FILE)),
    steps,
  };

  // Exclusive create = lock. Fails if another run (or an unrecovered one) holds it.
  const handle = await open(journalPath(stateDir), 'wx').catch((e: NodeJS.ErrnoException) => {
    if (e.code === 'EEXIST')
      throw new BusyError(`An AgentForge operation is pending on ${stateDir}`);
    throw e;
  });
  try {
    await handle.writeFile(JSON.stringify(journal));
    await handle.sync();
  } finally {
    await handle.close();
  }

  let preservedDir: string | undefined;
  try {
    await mkdir(txDir, { recursive: true });
    for (const step of steps) if (step.backup) await copyFile(step.path, step.backup);
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
  if (step.kind === 'write') {
    await atomicWrite(step.path, action.content ?? '');
  } else {
    await rm(step.path, { force: true });
    await pruneEmptyDirs(path.dirname(step.path), step.root);
  }
}
