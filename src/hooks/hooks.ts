import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { LearnBuildError } from '../domain/errors.js';
import type { ProjectState, ThreadsDocument } from '../domain/types.js';
import { EXPLAIN_AGENT, explainGuardDecision, type HookOutcome } from '../explain/guard.js';
import { writeFileAtomic } from '../state/atomic.js';
import { BRIEF_PLACEHOLDER, findProjectRoot, ProjectRepository, STATE_DIR } from '../state/project.js';
import { addFollowUp, openQuestion } from '../threads/threads.js';

const EDIT_TOOLS: ReadonlySet<string> = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

const WRITING_COMMANDS =
  /(?:^|[\s;&|(])(?:tee|rm|rmdir|mv|cp|touch|truncate|dd|patch|chmod|ln)(?=\s|$)|\bsed\s+(?:-[a-zA-Z]*i|--in-place)|\bperl\s+-[a-zA-Z]*i|\bnpm\s+(?:install|i|ci|init|uninstall|update|add|remove)\b|\b(?:npx|pnpm|yarn|bun)\b|\bpip3?\s+install\b|\bgit\s+(?:add|commit|checkout|switch|restore|reset|revert|merge|rebase|stash|apply|am|clean|rm|mv|pull|cherry-pick)\b/;

/**
 * Heuristic: does this shell command look like it changes files? It catches
 * the ordinary ways a cooperating model writes from the shell (redirection,
 * heredocs, in-place edits, installs). It is not a security boundary; a
 * command built to hide a write can get past it.
 */
export function looksLikeShellWrite(command: string): boolean {
  if (/<<-?\s*['"]?\w/.test(command)) return true;
  const unquoted = command
    .replace(/'[^']*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/\d*>&\d+|&>\s*\/dev\/null|\d*>>?\s*\/dev\/null/g, ' ');
  return unquoted.includes('>') || WRITING_COMMANDS.test(unquoted);
}

const COMMIT_MARKER = 'commit-intro.txt';
const GIT_COMMIT = /(?:^|[\s;&|(])git\s+(?:-\S+\s+)*commit(?=\s|$)/;

const PAUSE_TAIL = 'Then ask if they are happy for you to go ahead, and stop. Run the same command again after the learner replies; it will be allowed then.';

/**
 * What to tell the learner before each of a project's first three commits,
 * indexed by how many commits already exist. Each is shorter than the last.
 */
export const COMMIT_BRIEFINGS: readonly string[] = [
  "LearnBuild paused this command because it would make the project's first commit. This pause is expected. " +
    'Do not retry in this turn. In your reply, tell the learner: ' +
    '(1) that you are about to make a commit, and that a commit is a saved snapshot of the project files as they are now; ' +
    '(2) why now: the step passed its checks, so this is a known working point to return to if a later change breaks something; ' +
    '(3) which files will be in it; ' +
    '(4) how it is done, showing the exact commands: "git add <files>" chooses what goes into the snapshot and "git commit -m <message>" saves it with a short description; ' +
    '(5) that it stays on their computer and nothing is uploaded; ' +
    '(6) that they can run "git log --oneline" afterwards to see it. ' +
    PAUSE_TAIL,
  "LearnBuild paused this command because it would make the project's second commit. This pause is expected. " +
    'Do not retry in this turn. In a shorter reply than last time, tell the learner: ' +
    '(1) that this step passed its checks, so you are about to save a second snapshot; ' +
    '(2) which files changed since the first commit; ' +
    '(3) the exact "git add" and "git commit -m" commands you will run, without re-explaining what each does unless they ask. ' +
    PAUSE_TAIL,
  "LearnBuild paused this command because it would make the project's third commit. This pause is expected and is the last one. " +
    'Do not retry in this turn. In two or three sentences, tell the learner you are about to commit this step, give the commit message, ' +
    'and say that from the next step on you will commit each verified step without asking and report it in the summary. ' +
    PAUSE_TAIL,
];

function commitCount(root: string): number {
  const result = spawnSync('git', ['rev-list', '--count', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return result.status === 0 ? Number(result.stdout.trim()) || 0 : 0;
}

async function readMarker(root: string): Promise<string> {
  return (await readFile(join(root, STATE_DIR, COMMIT_MARKER), 'utf8').catch(() => '')).trim();
}

/**
 * Each of a project's first three commits must be explained to the learner
 * and followed by a reply from them before it is made. An attempt is blocked
 * and marked pending for that commit number; the next learner message (see
 * promptContext) marks it acknowledged, after which the commit passes.
 */
async function earlyCommitDecision(root: string, command: string): Promise<HookOutcome> {
  const unquoted = command.replace(/'[^']*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""');
  if (!GIT_COMMIT.test(unquoted)) return 'pass';
  const hasRepo = await access(join(root, '.git')).then(() => true, () => false);
  if (!hasRepo) return 'pass';
  const count = commitCount(root);
  const briefing = COMMIT_BRIEFINGS[count];
  if (briefing === undefined) return 'pass';
  if ((await readMarker(root)) === `acknowledged:${count}`) return 'pass';
  await writeFileAtomic(join(root, STATE_DIR, COMMIT_MARKER), `pending:${count}\n`);
  return { allowed: false, reason: briefing };
}

const TURN_MARKER = 'turn.json';

/** What the learner's latest message authorises, decided without a model. */
export type TurnIntent = { intent: 'go' } | { intent: 'decide'; option: string } | { intent: 'other' };

const GO_WORDS = new Set(['next', 'start', 'begin', 'continue', 'go', 'proceed', 'build', 'building', 'ready', 'carry', 'keep', 'move', 'onward', 'onwards']);
const AFFIRMATIONS = new Set(['yes', 'yep', 'yeah', 'yup', 'ok', 'okay', 'sure', 'alright', 'fine']);
const FILLER = new Set([
  'lets', 'let', 's', 'us', 'i', 'im', 'm', 'am', 'we', 're', 'are', 'please', 'thanks', 'thank', 'you', 'now', 'then', 'ahead', 'on', 'going',
  'step', 'it', 'the', 'that', 'this', 'to', 'with', 'and', 'just', 'do', 'cool', 'great', 'nice', 'perfect', 'good', 'sounds', 'looks',
  'right', 'whole', 'thing', 'all', 'everything', 'for', 'me', 'one', 'up', 'forward', 'can', 'a', 'of',
]);

function words(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter((w) => w !== '');
}

function matchOption(prompt: string, options: readonly string[]): string | null {
  const lead = /^(?:(?:ok|okay|yes|yeah|yep|sure|um|hmm|alright) )*(?:(?:i|we|id|i d|lets|let s|let us) )?(?:(?:will|would|ll|d) )?(?:(?:like to|like|want to|want) )?(?:(?:choose|pick|go with|go for|use|select|take|have) )?(?:the )?/;
  const rest = words(prompt).join(' ').replace(lead, '').replace(/(?: (?:option|one|please|thanks))+$/, '');
  const matches = options.filter((option) => words(option).join(' ') === rest);
  return matches.length === 1 ? matches[0]! : null;
}

/**
 * Classifies a learner message by fixed rules. `go` is a short go-ahead such
 * as "next" or "ok let's start" (or /learn-build). `decide` means the message
 * is one of the pending decision's option names, alone or with a stock lead-in
 * such as "go with". Anything containing a question mark, or any word outside
 * the small go-ahead vocabulary, is `other`.
 */
export function classifyPrompt(prompt: string, pendingOptions: readonly string[] | null): TurnIntent {
  const text = prompt.trim();
  if (/^\/learn-build(\s|$)/.test(text)) return { intent: 'go' };
  if (text.startsWith('/learn-decide')) {
    const argument = text.slice('/learn-decide'.length).trim();
    return pendingOptions?.includes(argument) ? { intent: 'decide', option: argument } : { intent: 'other' };
  }
  if (text.startsWith('/') || text.includes('?')) return { intent: 'other' };
  if (pendingOptions !== null) {
    const option = matchOption(text, pendingOptions);
    if (option !== null) return { intent: 'decide', option };
  }
  const list = words(text);
  if (list.length === 0 || list.length > 12) return { intent: 'other' };
  if (!list.every((w) => GO_WORDS.has(w) || AFFIRMATIONS.has(w) || FILLER.has(w))) return { intent: 'other' };
  const hasGo = list.some((w) => GO_WORDS.has(w));
  const onlyAffirming = list.some((w) => AFFIRMATIONS.has(w)) || list.join(' ') === 'sounds good' || list.join(' ') === 'looks good';
  return hasGo || onlyAffirming ? { intent: 'go' } : { intent: 'other' };
}

async function readTurn(root: string): Promise<TurnIntent> {
  try {
    const parsed: unknown = JSON.parse(await readFile(join(root, STATE_DIR, TURN_MARKER), 'utf8'));
    if (typeof parsed === 'object' && parsed !== null) return parsed as TurnIntent;
  } catch {
    // No marker means nothing has been authorised.
  }
  return { intent: 'other' };
}

/**
 * Starting a task and recording a decision are allowed only on a turn where
 * the learner's own message asked for it, as classified by classifyPrompt.
 */
async function authorisedCommandDecision(root: string, command: string): Promise<HookOutcome> {
  const startsTask = /\blearnbuild\s+task\s+start\b/.test(command);
  const resolves = /\blearnbuild\s+decision\s+resolve\b/.test(command);
  if (!startsTask && !resolves) return 'pass';
  const turn = await readTurn(root);
  if (startsTask && turn.intent !== 'go') {
    return {
      allowed: false,
      reason:
        'LearnBuild blocked this: a task starts only when the learner\'s latest message was a go-ahead such as "next" or "start", or /learn-build. ' +
        'This message was not one. Answer what they asked, and tell them they can say "next" when they want to continue.',
    };
  }
  if (resolves) {
    const selected = /--select[=\s]+['"]?([a-z0-9._-]+)['"]?/.exec(command)?.[1];
    if (turn.intent !== 'decide' || selected !== turn.option) {
      return {
        allowed: false,
        reason:
          'LearnBuild blocked this: a decision is recorded only when the learner\'s latest message was exactly one of the option names (or /learn-decide <option>), and only for that option. ' +
          'Do not choose for them. Show the options and ask them to reply with the name of the one they want.',
      };
    }
  }
  return 'pass';
}

function parsePayload(input: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(input);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * PreToolUse decision for a whole session.
 *
 * - The explain agent is confined to read-only inspector commands.
 * - Inside a LearnBuild project, the file-editing tools work only while a task
 *   the learner started is executing. Markdown notes under `.learn-build/` and
 *   draft plans in `.learn-build/plans/` are always writable; the state files never are.
 * - Everything else passes through to normal permission handling.
 *
 * - While no task is executing, shell commands that look like file writes are
 *   blocked too. That check is a heuristic (see looksLikeShellWrite).
 * - Each of a project's first three commits waits until the learner has been
 *   told about it and has replied (see earlyCommitDecision).
 * - `learnbuild task start` and `learnbuild decision resolve` run only on a
 *   turn the learner's own message authorised (see authorisedCommandDecision).
 */
export async function preToolDecision(hookInput: string): Promise<HookOutcome> {
  const payload = parsePayload(hookInput);
  if (payload === null) return { allowed: false, reason: 'Hook input was not valid JSON.' };
  if (payload['agent_type'] === EXPLAIN_AGENT) return explainGuardDecision(hookInput);

  const toolName = payload['tool_name'];
  if (typeof toolName !== 'string' || (!EDIT_TOOLS.has(toolName) && toolName !== 'Bash')) return 'pass';
  const cwd = typeof payload['cwd'] === 'string' ? payload['cwd'] : process.cwd();
  const root = await findProjectRoot(cwd);
  if (root === null) return 'pass';

  const toolInput = (payload['tool_input'] ?? {}) as Record<string, unknown>;
  if (toolName === 'Bash') {
    const command = toolInput['command'];
    if (typeof command !== 'string') return 'pass';
    const authorised = await authorisedCommandDecision(root, command);
    if (authorised !== 'pass') return authorised;
    const earlyCommit = await earlyCommitDecision(root, command);
    if (earlyCommit !== 'pass') return earlyCommit;
    if (!looksLikeShellWrite(command)) return 'pass';
    const status = await new ProjectRepository(root).workflow.read().then((state) => state.status, () => 'unreadable');
    if (status === 'executing') return 'pass';
    return {
      allowed: false,
      reason:
        `LearnBuild blocked this shell command because it looks like it changes files and no task is in progress (project status: ${status}). ` +
        'Write notes under .learn-build/ with the Write tool, and change LearnBuild state only with learnbuild commands. ' +
        'Project files change only after the learner starts a task with /learn-build.',
    };
  }
  const rawPath = toolInput['file_path'] ?? toolInput['notebook_path'];
  if (typeof rawPath !== 'string') return 'pass';
  const rel = relative(root, resolve(cwd, rawPath)).split('\\').join('/');
  if (rel.startsWith('..') || isAbsolute(rel)) return 'pass';

  if (rel === STATE_DIR || rel.startsWith(`${STATE_DIR}/`)) {
    if (rel.endsWith('.md') || rel.startsWith(`${STATE_DIR}/plans/`)) return 'pass';
    return {
      allowed: false,
      reason: `LearnBuild state files are changed only through the learnbuild command, never edited directly (${rel}).`,
    };
  }

  let state: ProjectState;
  try {
    state = await new ProjectRepository(root).workflow.read();
  } catch (error) {
    const detail = error instanceof LearnBuildError ? error.message : 'the project state could not be read';
    return { allowed: false, reason: `LearnBuild blocked this edit because ${detail}` };
  }
  if (state.status === 'executing') return 'pass';
  return {
    allowed: false,
    reason:
      `LearnBuild blocked this edit: no task is in progress (project status: ${state.status}). ` +
      'Questions, explanations and examples never change project files, so show any code in your reply instead. ' +
      'Files change only after the learner starts a task with /learn-build.',
  };
}

/**
 * Records a free-text message on the active question thread, or opens one,
 * while a decision is pending. Doing this in the hook means the point to
 * return to is saved even if the model never invokes the ask skill. Only the
 * threads document is written. Returns the thread id, or null on failure.
 */
async function recordDiscussion(
  repo: ProjectRepository,
  prompt: string,
  payload: Record<string, unknown>,
  at: string,
): Promise<string | null> {
  const summary = prompt.replace(/\s+/g, ' ').slice(0, 120);
  const ref = `prompt-${String(payload['prompt_id'] ?? payload['session_id'] ?? 'unknown')}`;
  try {
    const { doc } = await repo.updateThreads((threads, workflow) =>
      threads.activeThreadId !== null
        ? addFollowUp(threads, { ref, summary, at })
        : openQuestion(threads, workflow, { threadId: `thread-${randomBytes(4).toString('hex')}`, topic: summary, summary, ref, at }),
    );
    return doc.activeThreadId;
  } catch {
    return null;
  }
}

async function nextStepInstruction(root: string, state: ProjectState): Promise<string> {
  if (state.pendingDecisionId !== null) {
    return 'the project cannot move on until the decision above is made. Show the question and the options again, and tell the learner to reply with the name of the option they want.';
  }
  if (state.status === 'executing') return 'continue the task in progress by following the learn-build skill.';
  if (!(await briefIsWritten(root))) return 'the brief is not written yet, so follow the learn-new skill.';
  if (Object.keys(state.tasks).length === 0) return 'there is a brief but no plan, so follow the learn-plan skill.';
  return 'follow the learn-build skill to start or continue the next step.';
}

async function briefIsWritten(root: string): Promise<boolean> {
  const brief = await readFile(join(root, STATE_DIR, 'PROJECT.md'), 'utf8').catch(() => BRIEF_PLACEHOLDER);
  return !brief.includes(BRIEF_PLACEHOLDER);
}

/**
 * Text added to the model's context on every learner message, so the current
 * workflow state and the rules for free text do not depend on chat history.
 * While a decision is pending it also records the message on a question
 * thread. Returns an empty string outside a LearnBuild project.
 */
export async function promptContext(hookInput: string): Promise<string> {
  const payload = parsePayload(hookInput);
  if (payload === null) return '';
  const cwd = typeof payload['cwd'] === 'string' ? payload['cwd'] : process.cwd();
  const root = await findProjectRoot(cwd);
  if (root === null) return '';
  const repo = new ProjectRepository(root);
  let state: ProjectState;
  let threads: ThreadsDocument | null = null;
  try {
    state = await repo.workflow.read();
    threads = await repo.threads.read().catch(() => null);
  } catch (error) {
    const detail = error instanceof LearnBuildError ? error.message : 'unknown error';
    return `[LearnBuild] The project state could not be read (${detail}). Tell the learner, and do not change any files.`;
  }

  const lines = [`[LearnBuild] Project "${state.projectId}", status: ${state.status}, state revision ${state.revision}.`];
  if (state.pendingDecisionId !== null) {
    const decision = state.decisions[state.pendingDecisionId];
    if (decision) {
      lines.push(`A decision is waiting for the learner: "${decision.question}" Options: ${decision.options.join(', ')}.`);
    }
  }
  if (state.status === 'executing' && state.taskId !== null) {
    lines.push(`Task "${state.taskId}" (${state.tasks[state.taskId]?.title ?? ''}) is in progress; the learner started it.`);
  }
  const marker = await readMarker(root);
  if (marker.startsWith('pending:')) {
    await writeFileAtomic(join(root, STATE_DIR, COMMIT_MARKER), `${marker.replace('pending', 'acknowledged')}\n`).catch(() => undefined);
    lines.push(
      'The learner is replying to your explanation of the commit you are about to make. If they agree, make the commit now and finish recording the task. ' +
        'If they ask a question, answer it and ask again. If they would rather not commit or want to do it themselves, do not commit; give them the commands and finish recording the task.',
    );
  }

  const prompt = typeof payload['prompt'] === 'string' ? payload['prompt'].trim() : '';
  const isCommand = prompt.startsWith('/learn-');
  const pending = state.pendingDecisionId !== null ? state.decisions[state.pendingDecisionId] : undefined;
  const turn = classifyPrompt(prompt, pending ? pending.options : null);
  await writeFileAtomic(join(root, STATE_DIR, TURN_MARKER), `${JSON.stringify(turn)}\n`).catch(() => undefined);

  const recorded =
    !isCommand && turn.intent === 'other' && pending !== undefined && prompt !== ''
      ? await recordDiscussion(repo, prompt, payload, new Date().toISOString())
      : null;
  const active = threads?.activeThreadId ? threads.threads[threads.activeThreadId] : undefined;
  if (recorded !== null) {
    lines.push(`This message has been recorded on question thread "${recorded}"; do not record it again with learnbuild ask or followup.`);
  } else if (active) {
    lines.push(`Open question thread: "${active.topic}".`);
  }
  if (isCommand) {
    if (turn.intent !== 'other') {
      lines.push(`Pass --confirm-ref 'learner-message-${String(payload['prompt_id'] ?? payload['session_id'] ?? Date.now())}' to learnbuild task start or learnbuild decision resolve.`);
    }
    return lines.join('\n');
  }

  const confirmRef = `learner-message-${String(payload['prompt_id'] ?? payload['session_id'] ?? Date.now())}`;
  if (turn.intent !== 'other') lines.push(`If you run learnbuild task start or learnbuild decision resolve this turn, pass --confirm-ref '${confirmRef}'.`);
  if (turn.intent === 'decide') {
    lines.push(
      `The learner's message is the option name "${turn.option}" for the decision above. That is their explicit choice: follow the learn-decide skill now with "${turn.option}".`,
    );
  } else if (turn.intent === 'go') {
    lines.push(`The learner's message is a go-ahead. If your last reply asked them a question, it is their answer; carry on from there. Otherwise: ${await nextStepInstruction(root, state)}`);
  } else {
    lines.push(
      'This message is not a go-ahead and not a command. If it answers something you asked in your last reply, such as a question from /learn-new or /learn-plan or an understanding check, carry on with that conversation. Otherwise treat it as a question or discussion and use the learn-ask skill to answer it, even if it mentions an option or asks for code.',
      pending
        ? `Do not record a decision from this message. A choice counts only when the learner replies with exactly one of the option names: ${pending.options.join(' or ')}. If they seem to be choosing, tell them which name to reply with.`
        : 'Do not record any decision from this message.',
    );
    if (state.status === 'executing') {
      lines.push('Answering a question does not change the task in progress. Carry on with the task only if the learner asks you to continue.');
    } else if (!pending && Object.keys(state.tasks).length === 0 && (await briefIsWritten(root))) {
      lines.push(
        'The brief is written and there is no plan yet. If the learner asks to review, go through or change the brief or the requirements, follow "Going through the brief" in the learn-new skill. ' +
          'Changes they ask for may be written to .learn-build/PROJECT.md and .learn-build/REQUIREMENTS.md.',
        'Do not create or edit any other project files and do not start a task. Tell the learner they can say "next" when they want to move on to planning.',
      );
    } else {
      lines.push('Do not create or edit project files and do not start a task. Tell the learner they can say "next" when they want to move on.');
    }
  }
  return lines.join('\n');
}
