import { appendFile, mkdir, readFile, readdir, unlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { LearnBuildError, fail } from '../domain/errors.js';
import type { TransitionResult, WorkflowEvent } from '../domain/types.js';
import { writeFileAtomic } from './atomic.js';
import { acquireLock, type LockOptions } from './lock.js';
import { migrateAndValidate, type DocumentSchema, type VersionedDocument } from './schema.js';

export interface UpdateOptions {
  /** Reject the update unless the stored revision equals this value. */
  expectedRevision?: number;
}

export interface CommitResult<T> {
  doc: T;
  events: WorkflowEvent[];
}

/**
 * Revision-checked JSON document store. Every write holds a cross-process
 * lock, re-reads the stored document, compares revisions and replaces the
 * file atomically, so a stale writer gets REVISION_CONFLICT instead of
 * overwriting a newer revision.
 */
export class DocumentStore<T extends VersionedDocument> {
  constructor(
    readonly filePath: string,
    private readonly schema: DocumentSchema<T>,
    private readonly eventLogPath: string | null = null,
    private readonly lockOptions: LockOptions = {},
  ) {}

  private get lockPath(): string {
    return `${this.filePath}.lock`;
  }

  async exists(): Promise<boolean> {
    try {
      await readFile(this.filePath);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }

  async read(): Promise<T> {
    let text: string;
    try {
      text = await readFile(this.filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        fail('STATE_NOT_FOUND', `${this.schema.name} not found at ${this.filePath}.`, { path: this.filePath });
      }
      throw error;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (error) {
      fail('STATE_CORRUPT', `${this.schema.name} is not valid JSON: ${(error as Error).message}`, {
        path: this.filePath,
      });
    }
    return migrateAndValidate(this.schema, raw);
  }

  async create(doc: T, events: WorkflowEvent[] = []): Promise<CommitResult<T>> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const lock = await acquireLock(this.lockPath, this.lockOptions);
    try {
      if (await this.exists()) fail('STATE_EXISTS', `${this.schema.name} already exists at ${this.filePath}.`);
      const initial = { ...doc, revision: 0 };
      this.schema.validate(initial);
      await writeFileAtomic(this.filePath, serialise(initial));
      await this.appendEvents(0, events);
      return { doc: initial, events };
    } finally {
      await lock.release();
    }
  }

  async update(
    transition: (current: T) => TransitionResult<T>,
    options: UpdateOptions = {},
  ): Promise<CommitResult<T>> {
    const lock = await acquireLock(this.lockPath, this.lockOptions).catch((error: unknown) => {
      // The lock lives beside the document, so a missing directory means no document.
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        fail('STATE_NOT_FOUND', `${this.schema.name} not found at ${this.filePath}.`, { path: this.filePath });
      }
      throw error;
    });
    try {
      await this.removeStrayTempFiles();
      const current = await this.read();
      if (options.expectedRevision !== undefined && options.expectedRevision !== current.revision) {
        throw new LearnBuildError(
          'REVISION_CONFLICT',
          `${this.schema.name} is at revision ${current.revision}, not the expected ${options.expectedRevision}. Reload and retry.`,
          { expectedRevision: options.expectedRevision, currentRevision: current.revision },
        );
      }
      const result = transition(current);
      const next = { ...result.state, revision: current.revision + 1 };
      this.schema.validate(next);
      await writeFileAtomic(this.filePath, serialise(next));
      await this.appendEvents(next.revision, result.events);
      return { doc: next, events: result.events };
    } finally {
      await lock.release();
    }
  }

  /**
   * Temp files for this document are only created while the lock is held, so
   * any that exist once we hold it were left by a writer that crashed.
   */
  private async removeStrayTempFiles(): Promise<void> {
    const dir = dirname(this.filePath);
    const prefix = `.${basename(this.filePath)}.`;
    for (const name of await readdir(dir)) {
      if (name.startsWith(prefix) && name.endsWith('.tmp')) await unlink(join(dir, name)).catch(() => undefined);
    }
  }

  private async appendEvents(revision: number, events: WorkflowEvent[]): Promise<void> {
    if (this.eventLogPath === null || events.length === 0) return;
    const lines = events
      .map((e) => JSON.stringify({ document: this.schema.name, revision, ...e }))
      .join('\n');
    await appendFile(this.eventLogPath, `${lines}\n`, 'utf8');
  }
}

function serialise(doc: unknown): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}
