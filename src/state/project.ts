import { access, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fail } from '../domain/errors.js';
import type { ProjectState, ThreadsDocument, TransitionResult } from '../domain/types.js';
import { createProject } from '../domain/workflow.js';
import { createLearnerDocument, type LearnerDocument } from '../learning/learner.js';
import { createThreadsDocument, resume, type ResumeOutcome } from '../threads/threads.js';
import type { LockOptions } from './lock.js';
import { learnerSchema, projectStateSchema, threadsSchema } from './schema.js';
import { DocumentStore, type CommitResult, type UpdateOptions } from './store.js';

export const STATE_DIR = '.learn-build';
/** Present in PROJECT.md until /learn-new has written the brief. */
export const BRIEF_PLACEHOLDER = 'The project brief has not been written yet.';
const FRAMEWORK_PACKAGE_NAME = 'learnbuild';

export interface ProjectPaths {
  root: string;
  stateDir: string;
  state: string;
  threads: string;
  learner: string;
  events: string;
}

export function projectPaths(root: string): ProjectPaths {
  const absRoot = resolve(root);
  const stateDir = join(absRoot, STATE_DIR);
  return {
    root: absRoot,
    stateDir,
    state: join(stateDir, 'state.json'),
    threads: join(stateDir, 'threads', 'INDEX.json'),
    learner: join(stateDir, 'learner.json'),
    events: join(stateDir, 'events.jsonl'),
  };
}

/** Durable access to one learner project's `.learn-build/` directory. */
export class ProjectRepository {
  readonly paths: ProjectPaths;
  readonly workflow: DocumentStore<ProjectState>;
  readonly threads: DocumentStore<ThreadsDocument>;
  readonly learner: DocumentStore<LearnerDocument>;

  constructor(root: string, lockOptions: LockOptions = {}) {
    this.paths = projectPaths(root);
    this.workflow = new DocumentStore(this.paths.state, projectStateSchema, this.paths.events, lockOptions);
    this.threads = new DocumentStore(this.paths.threads, threadsSchema, this.paths.events, lockOptions);
    this.learner = new DocumentStore(this.paths.learner, learnerSchema, this.paths.events, lockOptions);
  }

  async updateWorkflow(
    transition: (current: ProjectState) => TransitionResult<ProjectState>,
    options: UpdateOptions = {},
  ): Promise<CommitResult<ProjectState>> {
    return this.workflow.update(transition, options);
  }

  /** Updates threads using a read-only snapshot of the workflow. */
  async updateThreads(
    transition: (current: ThreadsDocument, workflow: Readonly<ProjectState>) => TransitionResult<ThreadsDocument>,
    options: UpdateOptions = {},
  ): Promise<CommitResult<ThreadsDocument>> {
    const workflow = Object.freeze(await this.workflow.read());
    return this.threads.update((current) => transition(current, workflow), options);
  }

  async resume(at: string): Promise<ResumeOutcome & { threadsRevision: number }> {
    const workflow = Object.freeze(await this.workflow.read());
    let outcome: ResumeOutcome | undefined;
    const committed = await this.threads.update((current) => {
      outcome = resume(current, workflow, at);
      return outcome;
    });
    if (!outcome) throw new Error('resume transition did not run');
    return { ...outcome, threadsRevision: committed.doc.revision };
  }
}

export interface InitOptions {
  projectId: string;
  phaseId?: string | null;
  /** Permit initialising inside the LearnBuild framework's own source tree. */
  allowFrameworkRoot?: boolean;
  at: string;
  lockOptions?: LockOptions;
}

export async function initProject(root: string, options: InitOptions): Promise<ProjectRepository> {
  const repo = new ProjectRepository(root, options.lockOptions);
  if (!options.allowFrameworkRoot && (await isFrameworkRoot(repo.paths.root))) {
    fail('UNSAFE_ROOT', `${repo.paths.root} is the LearnBuild framework source. Initialise a learner project elsewhere.`);
  }
  const state = createProject({ projectId: options.projectId, phaseId: options.phaseId ?? null });
  await repo.workflow.create(state, [
    { type: 'project_initialised', at: options.at, details: { projectId: options.projectId } },
  ]);
  if (!(await repo.threads.exists())) await repo.threads.create(createThreadsDocument());
  if (!(await repo.learner.exists())) await repo.learner.create(createLearnerDocument());
  return repo;
}

export async function isFrameworkRoot(root: string): Promise<boolean> {
  try {
    const pkg: unknown = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    return typeof pkg === 'object' && pkg !== null && (pkg as Record<string, unknown>)['name'] === FRAMEWORK_PACKAGE_NAME;
  } catch {
    return false;
  }
}

/** Finds the nearest directory at or above `start` that holds a LearnBuild project. */
export async function findProjectRoot(start: string): Promise<string | null> {
  let current = resolve(start);
  for (;;) {
    try {
      await access(join(current, STATE_DIR, 'state.json'));
      return current;
    } catch {
      const parent = dirname(current);
      if (parent === current) return null;
      current = parent;
    }
  }
}
