import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { runCli } from '../src/cli/commands.js';
import { checklist } from '../src/cli/display.js';
import { GIT_DOCS_URL, VERSION_CONTROL_LABEL, askAboutGit } from '../src/cli/git.js';
import { COMMAND_GUIDE, THINGS_TO_SAY } from '../src/cli/guide.js';
import { BRIEF_PLACEHOLDER, enterProjectFolder, runNew, runOpen, slugify } from '../src/cli/new.js';
import { renderProjectClaudeMd, renderTemplates } from '../src/install/install.js';
import { LearnBuildError } from '../src/domain/errors.js';
import {
  applyPlan,
  createProject,
  nextAction,
  resolveDecision,
  requestDecision,
  startTask,
  verifyTask,
  type PlanInput,
} from '../src/domain/workflow.js';
import { COMMIT_BRIEFINGS, classifyPrompt, looksLikeShellWrite, looksLikeSystemInstall, preToolDecision, promptContext } from '../src/hooks/hooks.js';
import { parsePlan } from '../src/state/plan.js';
import { ProjectRepository } from '../src/state/project.js';
import { openQuestion } from '../src/threads/threads.js';
import { AT, authProject, fileHash, tempDir } from './helpers.js';

const execFileP = promisify(execFile);
const CLI = fileURLToPath(new URL('../src/cli/main.js', import.meta.url));

const PLAN: PlanInput = {
  phaseId: 'first-version',
  tasks: [
    { id: 'setup', title: 'Set up', acceptanceCriteria: [{ id: 'tests-run', description: 'npm test passes' }], competencyIds: ['automated-testing'] },
    { id: 'create-game', title: 'Create a game', dependencies: ['setup'], acceptanceCriteria: [{ id: 'listed', description: 'Game is listed' }] },
    { id: 'join-game', title: 'Join a game', dependencies: ['create-game'], acceptanceCriteria: [{ id: 'joined', description: 'Player is on the list' }] },
  ],
  decisions: [{ id: 'storage', question: 'Where should games be saved?', options: ['json-file', 'sqlite'], taskId: 'create-game' }],
  checkpoints: [
    { id: 'storage-gate', type: 'decision_gate', decisionId: 'storage', taskId: 'create-game' },
    { id: 'understand-requests', type: 'understanding_gate', taskId: 'join-game' },
  ],
};

async function newProject(name = 'Football Finder'): Promise<{ root: string; home: string; lines: string[] }> {
  const parent = await tempDir();
  const home = await tempDir('learnbuild-home-');
  const lines: string[] = [];
  const code = await runNew(['--name', name, '--no-launch'], { cwd: parent, out: (l) => lines.push(l), now: () => AT, interactive: false, home });
  assert.equal(code, 0, lines.join('\n'));
  return { root: join(parent, slugify(name)), home, lines };
}

describe('learnbuild new', () => {
  test('names become safe folder names', () => {
    assert.equal(slugify('Football Finder'), 'football-finder');
    assert.equal(slugify("  Rhys's Café App!! "), 'rhys-s-cafe-app');
    assert.equal(slugify('../../etc'), 'etc');
    assert.equal(slugify('!!!'), '');
    assert.ok(slugify('x'.repeat(100)).length <= 40);
  });

  test('one command creates a ready project: state, skills, hooks, CLAUDE.md and the global /learn-new', async () => {
    const { root, home, lines } = await newProject();
    const repo = new ProjectRepository(root);
    const state = await repo.workflow.read();
    assert.equal(state.projectId, 'football-finder');
    assert.equal(state.status, 'idle');
    assert.equal((await repo.learner.read()).mode, 'guided');
    assert.ok((await readFile(join(root, '.learn-build', 'PROJECT.md'), 'utf8')).startsWith('# Football Finder\n'));
    assert.ok((await readFile(join(root, '.learn-build', 'PROJECT.md'), 'utf8')).includes(BRIEF_PLACEHOLDER));
    assert.ok((await readdir(join(root, '.claude', 'skills'))).includes('learn-build'));
    assert.ok((await readFile(join(root, '.claude', 'settings.json'), 'utf8')).includes('learnbuild hook pre-tool'));
    assert.ok((await readFile(join(root, 'CLAUDE.md'), 'utf8')).includes('LearnBuild project'));
    assert.ok((await readFile(join(root, '.gitignore'), 'utf8')).includes('.env'));
    assert.ok(!(await readdir(root)).includes('.git'), 'no repository is created without the learner choosing one');
    assert.ok(!(await readFile(join(root, '.learn-build', 'PROJECT.md'), 'utf8')).includes(VERSION_CONTROL_LABEL), 'left for /learn-new to ask');
    assert.ok((await readFile(join(home, '.claude', 'skills', 'learn-new', 'SKILL.md'), 'utf8')).startsWith('---\nname: learn-new'));
    const output = lines.join('\n');
    assert.ok(output.includes(root));
    assert.ok(output.includes('claude "/learn-new"') || output.includes('Claude Code is not installed'));
  });

  test('an existing non-empty folder is not touched', async () => {
    const parent = await tempDir();
    await mkdir(join(parent, 'my-app'));
    await writeFile(join(parent, 'my-app', 'notes.txt'), 'mine');
    const lines: string[] = [];
    const code = await runNew(['--name', 'My App', '--no-launch'], { cwd: parent, out: (l) => lines.push(l), now: () => AT, interactive: false, home: await tempDir() });
    assert.equal(code, 1);
    assert.match(lines.join('\n'), /already exists/);
    assert.deepEqual(await readdir(join(parent, 'my-app')), ['notes.txt']);
  });

  test('it refuses to nest inside another project, and needs a name when it cannot ask', async () => {
    const { root } = await newProject();
    const io = { out: () => undefined, now: () => AT, interactive: false, home: await tempDir() };
    assert.equal(await runNew(['--name', 'Inner', '--no-launch'], { ...io, cwd: join(root, '.claude') }), 1);
    assert.equal(await runNew([], { ...io, cwd: await tempDir() }), 2);
    assert.equal(await runNew(['--name', '???', '--no-launch'], { ...io, cwd: await tempDir() }), 1);
  });

  test('the real CLI prints plain text, and bare `learnbuild` points to `new`', async () => {
    const parent = await tempDir();
    const home = await tempDir();
    const { stdout } = await execFileP(process.execPath, [CLI, 'new', '--name', 'Recipe Box', '--no-launch'], { cwd: parent, env: { ...process.env, HOME: home } });
    assert.match(stdout, /Created your project folder: .*recipe-box/);
    assert.throws(() => JSON.parse(stdout));
    const bare = await execFileP(process.execPath, [CLI]);
    assert.match(bare.stdout, /learnbuild new/);
  });

  test('project commands work from a subfolder of the project', async () => {
    const { root } = await newProject();
    await mkdir(join(root, 'src', 'deep'), { recursive: true });
    const result = await runCli(['status'], { cwd: join(root, 'src', 'deep'), now: () => AT });
    assert.equal(result.exitCode, 0);
    assert.equal((result.output['workflow'] as { projectId: string }).projectId, 'football-finder');
  });
});

describe('ending up inside the project folder', () => {
  test('with no terminal, new says how to get there and starts no shell', async () => {
    const parent = await tempDir();
    const lines: string[] = [];
    let entered = 0;
    await runNew(['--name', 'No Terminal', '--no-launch', '--no-editor'], {
      cwd: parent, out: (l) => lines.push(l), now: () => AT, interactive: false, home: await tempDir(), enterShell: async () => void entered++,
    });
    assert.equal(entered, 0);
    assert.match(lines.join('\n'), /cd ".*no-terminal"/);
  });

  test('enterProjectFolder starts a shell in the folder once, and not again inside that shell', async () => {
    const entered: string[] = [];
    const lines: string[] = [];
    const io = { cwd: '/', out: (l: string) => lines.push(l), now: () => AT, interactive: true, enterShell: async (f: string) => void entered.push(f) };
    const plain = { bold: (t: string) => t, dim: (t: string) => t, cyan: (t: string) => t, green: (t: string) => t, yellow: (t: string) => t, magenta: (t: string) => t };
    await enterProjectFolder('/tmp/project-a', io, plain);
    assert.deepEqual(entered, ['/tmp/project-a']);
    assert.match(lines.join('\n'), /You are now in your project folder: \/tmp\/project-a/);
    assert.match(lines.join('\n'), /"exit" to go back/);

    process.env['LEARNBUILD_PROJECT_SHELL'] = '/tmp/project-a';
    try {
      await enterProjectFolder('/tmp/project-a', io, plain);
      assert.equal(entered.length, 1, 'no nested shell for the same project');
    } finally {
      delete process.env['LEARNBUILD_PROJECT_SHELL'];
    }
    await enterProjectFolder('/tmp/project-a', { ...io, interactive: false }, plain);
    assert.equal(entered.length, 1);
  });

  test('learnbuild open finds the project by folder name or from inside it, and rejects other folders', async () => {
    const { root } = await newProject('Open Me');
    const parent = join(root, '..');
    const run = async (args: string[], cwd: string) => {
      const lines: string[] = [];
      const code = await runOpen(args, { cwd, out: (l) => lines.push(l), now: () => AT, interactive: false });
      return { code, text: lines.join('\n') };
    };
    const missing = await run(['nope'], parent);
    assert.equal(missing.code, 1);
    assert.match(missing.text, /not a LearnBuild project folder/);
    assert.equal((await run([], parent)).code, 1);
    for (const result of [await run(['open-me'], parent), await run([], root), await run([], join(root, '.claude'))]) {
      assert.equal(result.code, 0);
      assert.ok(result.text.includes(root) || result.text.includes('Claude Code is not installed'));
    }
  });
});

describe('editor prompt, help and the progress checklist', () => {
  test('without a terminal, new prints how to open the folder in the editor it found', async () => {
    const parent = await tempDir();
    const lines: string[] = [];
    const base = { cwd: parent, out: (l: string) => lines.push(l), now: () => AT, interactive: false, home: await tempDir() };
    await runNew(['--name', 'With Editor', '--no-launch'], { ...base, editors: () => [{ command: 'code', name: 'VS Code' }] });
    assert.match(lines.join('\n'), /Want to see your code as it is written\?\n  Open the project in VS Code:  code ".*with-editor"/);

    lines.length = 0;
    await runNew(['--name', 'No Editor', '--no-launch'], { ...base, editors: () => [] });
    assert.match(lines.join('\n'), /Open the project folder in a code editor\. VS Code is free: https:\/\/code\.visualstudio\.com/);

    lines.length = 0;
    await runNew(['--name', 'Quiet', '--no-launch', '--no-editor'], { ...base, editors: () => [{ command: 'code', name: 'VS Code' }] });
    assert.doesNotMatch(lines.join('\n'), /code editor|VS Code/);
  });

  test('output has no colour codes unless colour is on', async () => {
    const run = async (colour: boolean) => {
      const lines: string[] = [];
      await runNew(['--name', 'Colour Test', '--no-launch', '--no-editor'], { cwd: await tempDir(), out: (l) => lines.push(l), now: () => AT, interactive: false, home: await tempDir(), colour });
      return lines.join('\n');
    };
    assert.equal((await run(false)).includes('\u001b['), false);
    assert.equal((await run(true)).includes('\u001b['), true);
  });

  test('learnbuild help lists what to say and every command, in plain text when piped', async () => {
    const { stdout } = await execFileP(process.execPath, [CLI, 'help']);
    assert.equal(stdout.includes('\u001b['), false);
    for (const entry of [...COMMAND_GUIDE, ...THINGS_TO_SAY]) {
      assert.ok(stdout.includes(entry.command), entry.command);
      assert.ok(stdout.includes(entry.what), entry.what);
    }
    assert.match(stdout, /learnbuild new/);
  });

  test('the checklist marks done, current and waiting steps', () => {
    let state = applyPlan(createProject({ projectId: 'p' }), PLAN, AT).state;
    assert.equal(checklist(createProject({ projectId: 'p' })), '');
    assert.equal(checklist(state), ['▱▱▱  0 of 3 steps done', '👉 Set up (next)', '⬜ Create a game', '⬜ Join a game'].join('\n'));
    state = startTask(state, { taskId: 'setup', authorisationRef: 'm', at: AT }).state;
    assert.match(checklist(state), /🔨 Set up \(in progress\)/);
    state = verifyTask(state, { taskId: 'setup', results: [{ criterionId: 'tests-run', outcome: 'pass', evidenceRef: 'log' }], at: AT }).state;
    assert.equal(checklist(state), ['▰▱▱  1 of 3 steps done', '✅ Set up', '🤔 Create a game (needs your decision)', '⬜ Join a game'].join('\n'));
  });

  test('next and progress include the checklist', async () => {
    const { root } = await newProject('Display Test');
    await new ProjectRepository(root).updateWorkflow((s) => applyPlan(s, PLAN, AT));
    for (const command of ['next', 'progress']) {
      const result = await runCli([command], { cwd: root, now: () => AT });
      assert.match(String(result.output['display']), /0 of 3 steps done/);
    }
  });
});

describe('Git is the learner\'s choice', () => {
  const io = async (cwd: string) => ({ cwd, out: () => undefined, now: () => AT, interactive: false, home: await tempDir() });
  const brief = (root: string) => readFile(join(root, '.learn-build', 'PROJECT.md'), 'utf8');

  test('--git creates a local repository with no remote and records the choice', async () => {
    const parent = await tempDir();
    assert.equal(await runNew(['--name', 'With Git', '--git', '--no-launch'], await io(parent)), 0);
    const root = join(parent, 'with-git');
    assert.ok((await readdir(root)).includes('.git'));
    assert.match(await brief(root), /^Version control: Git repository created on this computer\. Nothing is uploaded anywhere\.$/m);
    const { stdout } = await execFileP('git', ['remote'], { cwd: root });
    assert.equal(stdout, '');
    const log = await execFileP('git', ['status', '--porcelain'], { cwd: root });
    assert.ok(log.stdout.includes('??'), 'nothing is committed on the learner\'s behalf');
  });

  test('--no-git creates no repository and records that too', async () => {
    const parent = await tempDir();
    assert.equal(await runNew(['--name', 'No Git', '--no-git', '--no-launch'], await io(parent)), 0);
    const root = join(parent, 'no-git');
    assert.ok(!(await readdir(root)).includes('.git'));
    assert.match(await brief(root), /^Version control: not using Git for now\./m);
  });

  test('the question accepts yes and no, explains on "?", and re-asks on anything else', async () => {
    const run = async (answers: string[]) => {
      const out: string[] = [];
      const questions: string[] = [];
      const choice = await askAboutGit(async (q) => (questions.push(q), answers.shift() ?? 'n'), (l) => out.push(l));
      return { choice, out: out.join('\n'), questions };
    };
    assert.equal((await run(['y'])).choice, 'init');
    assert.equal((await run(['No'])).choice, 'skip');
    const first = await run(['y']);
    assert.equal(first.questions[0], 'Do you want to initialise a Git repository for this project? (y = yes, n = no, ? = what is this?) ');
    assert.equal(first.out, '', 'no explanation unless asked');

    const explained = await run(['?', 'what is git', 'yes']);
    assert.equal(explained.choice, 'init');
    assert.equal(explained.questions.length, 3);
    assert.ok(explained.out.includes(GIT_DOCS_URL));
    assert.match(explained.out, /stays on your own computer/);
    assert.match(explained.out, /LearnBuild never does that for you/);
    assert.match(explained.out, /skip it/);

    const unclear = await run(['maybe', 'n']);
    assert.equal(unclear.choice, 'skip');
    assert.match(unclear.out, /Please answer y, n or \?/);
  });

  test('learnbuild git records a later choice once, replacing the earlier line', async () => {
    const { root } = await newProject('Later Choice');
    const skip = await runCli(['git', '--skip'], { cwd: root, now: () => AT });
    assert.equal(skip.output['git'], 'skipped');
    const init = await runCli(['git', '--init'], { cwd: root, now: () => AT });
    assert.equal(init.output['git'], 'initialised');
    assert.equal(init.output['docs'], GIT_DOCS_URL);
    assert.equal((await brief(root)).split('\n').filter((l) => l.startsWith(VERSION_CONTROL_LABEL)).length, 1);
    assert.ok((await brief(root)).startsWith('# Later Choice\n'));
    assert.equal((await runCli(['git', '--init'], { cwd: root, now: () => AT })).output['git'], 'already');
    assert.equal((await runCli(['git'], { cwd: root, now: () => AT })).exitCode, 2);
    assert.equal((await runCli(['git', '--init', '--skip'], { cwd: root, now: () => AT })).exitCode, 2);
  });

  test('instructions never push or name a hosting service as a default', async () => {
    const rendered = await renderTemplates();
    const newSkill = rendered.get('skills/learn-new/SKILL.md')!;
    assert.match(newSkill, /Do you want to initialise a Git repository for this project\?/);
    assert.ok(newSkill.includes(GIT_DOCS_URL));
    assert.match(newSkill, /Do not suggest GitHub or any other hosting service/);
    const build = rendered.get('skills/learn-build/SKILL.md')!;
    assert.match(build, /Never push or add a remote unless the learner asks, and do not bring up hosting services yourself/);
    assert.match(build, /If there is no repository, skip this section and do not create one/);
    assert.match(build, /rather make commits themselves, do not commit/);
    assert.match(build, /first three commits, the project pauses the command/);
    assert.match(build, /If they decline, skip the commit and record the result/);
    assert.match(await renderProjectClaudeMd(), /never push or add a remote unless the learner asks/);
  });
});

describe('plan apply and next', () => {
  test('a plan is applied whole, and next walks the project in order', () => {
    let state = applyPlan(createProject({ projectId: 'p' }), PLAN, AT).state;
    assert.equal(state.phaseId, 'first-version');
    assert.deepEqual(state.tasks['setup']?.competencyIds, ['automated-testing']);
    assert.equal(state.checkpoints['understand-requests']?.blocking, true);

    let next = nextAction(state);
    assert.equal(next.action, 'start_task');
    state = startTask(state, { taskId: 'setup', authorisationRef: 'cmd', at: AT }).state;
    assert.equal(nextAction(state).action, 'continue_task');
    state = verifyTask(state, { taskId: 'setup', results: [{ criterionId: 'tests-run', outcome: 'pass', evidenceRef: 'log' }], at: AT }).state;

    next = nextAction(state);
    assert.deepEqual(next, { action: 'request_decision', taskId: 'create-game', decisionId: 'storage' });
    state = requestDecision(state, { decisionId: 'storage', at: AT }).state;
    assert.equal(nextAction(state).action, 'await_decision');
    state = resolveDecision(state, { decisionId: 'storage', selection: 'json-file', confirmationRef: 'm', at: AT }).state;
    assert.equal(nextAction(state).action, 'start_task');
    state = startTask(state, { taskId: 'create-game', authorisationRef: 'cmd', at: AT }).state;
    state = verifyTask(state, { taskId: 'create-game', results: [{ criterionId: 'listed', outcome: 'pass', evidenceRef: 'log' }], at: AT }).state;

    assert.deepEqual(nextAction(state), { action: 'await_evidence', taskId: 'join-game', checkpointIds: ['understand-requests'] });
  });

  test('next reports plan when there are no tasks and done when all are complete', () => {
    assert.deepEqual(nextAction(createProject({ projectId: 'p' })), { action: 'plan' });
    let state = applyPlan(createProject({ projectId: 'p' }), { tasks: [PLAN.tasks[0]!] }, AT).state;
    state = startTask(state, { taskId: 'setup', authorisationRef: 'cmd', at: AT }).state;
    state = verifyTask(state, { taskId: 'setup', results: [{ criterionId: 'tests-run', outcome: 'pass', evidenceRef: 'log' }], at: AT }).state;
    assert.deepEqual(nextAction(state), { action: 'done' });
  });

  for (const [label, broken] of [
    ['a task with no acceptance criteria', { tasks: [{ id: 'a', title: 'A', acceptanceCriteria: [] }] }],
    ['an unknown dependency', { tasks: [{ id: 'a', title: 'A', dependencies: ['ghost'], acceptanceCriteria: [{ id: 'c', description: 'd' }] }] }],
    ['an unknown competency', { tasks: [{ id: 'a', title: 'A', competencyIds: ['wizardry'], acceptanceCriteria: [{ id: 'c', description: 'd' }] }] }],
    ['a decision gate with no decision', { tasks: PLAN.tasks, checkpoints: [{ id: 'g', type: 'decision_gate', taskId: 'setup' }] }],
    ['no tasks', { tasks: [] }],
  ] as const) {
    test(`a plan with ${label} is rejected and changes nothing`, async () => {
      const { root } = await newProject();
      await mkdir(join(root, '.learn-build', 'plans'), { recursive: true });
      const file = join(root, '.learn-build', 'plans', 'plan-01.json');
      await writeFile(file, JSON.stringify({ ...broken, tasks: [...broken.tasks] }));
      const hash = await fileHash(join(root, '.learn-build', 'state.json'));
      const result = await runCli(['plan', 'apply', '--file', file], { cwd: root, now: () => AT });
      assert.notEqual(result.exitCode, 0);
      assert.equal(await fileHash(join(root, '.learn-build', 'state.json')), hash);
    });
  }

  test('a malformed plan file is reported with every problem', () => {
    assert.throws(
      () => parsePlan({ tasks: [{ id: 'a' }], decisions: 'nope' }),
      (e: unknown) => e instanceof LearnBuildError && e.code === 'SCHEMA_INVALID' && (e.details['problems'] as string[]).length >= 3,
    );
  });

  test('plan apply and next through the CLI', async () => {
    const { root } = await newProject();
    await mkdir(join(root, '.learn-build', 'plans'), { recursive: true });
    await writeFile(join(root, '.learn-build', 'plans', 'plan-01.json'), JSON.stringify(PLAN));
    const applied = await runCli(['plan', 'apply', '--file', '.learn-build/plans/plan-01.json'], { cwd: root, now: () => AT });
    assert.equal(applied.exitCode, 0, JSON.stringify(applied.output));
    assert.deepEqual(applied.output['tasksAdded'], ['setup', 'create-game', 'join-game']);
    const next = await runCli(['next'], { cwd: root, now: () => AT });
    assert.equal((next.output['next'] as { action: string }).action, 'start_task');
  });
});

describe('edit gate (PreToolUse for the main session)', () => {
  const edit = (root: string, file: string, tool = 'Write', cwd = root) =>
    preToolDecision(JSON.stringify({ hook_event_name: 'PreToolUse', cwd, tool_name: tool, tool_input: { file_path: file } }));
  const blocked = async (outcome: ReturnType<typeof edit>) => {
    const result = await outcome;
    return result !== 'pass' && !result.allowed;
  };

  test('source edits are blocked while a decision is pending, and the reason says how to proceed', async () => {
    const repo = await authProject();
    const outcome = await edit(repo.paths.root, 'src/auth.ts');
    assert.ok(outcome !== 'pass' && !outcome.allowed);
    assert.match(outcome.reason, /waiting_for_decision/);
    assert.match(outcome.reason, /\/learn-build/);
    for (const tool of ['Edit', 'MultiEdit']) assert.equal(await blocked(edit(repo.paths.root, join(repo.paths.root, 'README.md'), tool)), true, tool);
    const notebook = await preToolDecision(JSON.stringify({ cwd: repo.paths.root, tool_name: 'NotebookEdit', tool_input: { notebook_path: 'a.ipynb' } }));
    assert.ok(notebook !== 'pass' && !notebook.allowed);
  });

  test('a question thread does not open the gate; only an explicitly started task does', async () => {
    const repo = await authProject();
    await repo.updateThreads((t, w) => openQuestion(t, w, { threadId: 'q', topic: 'tokens', summary: 'what is a token?', ref: 'm', at: AT }));
    assert.equal(await blocked(edit(repo.paths.root, 'src/auth.ts')), true);
    await repo.updateWorkflow((s) => resolveDecision(s, { decisionId: 'auth-strategy', selection: 'sessions', confirmationRef: 'm', at: AT }));
    assert.equal(await blocked(edit(repo.paths.root, 'src/auth.ts')), true, 'a recorded decision is still not permission to edit');
    await repo.updateWorkflow((s) => startTask(s, { taskId: 'auth-01', authorisationRef: 'learn-build', at: AT }));
    assert.equal(await edit(repo.paths.root, 'src/auth.ts'), 'pass');
    await repo.updateWorkflow((s) => verifyTask(s, { taskId: 'auth-01', results: [{ criterionId: 'decision-recorded', outcome: 'pass', evidenceRef: 'log' }], at: AT }));
    assert.equal(await blocked(edit(repo.paths.root, 'src/auth.ts')), true, 'the gate closes again when the task is verified');
  });

  test('notes and draft plans are writable; state files never are, even mid-task', async () => {
    const repo = await authProject();
    assert.equal(await edit(repo.paths.root, '.learn-build/PROJECT.md'), 'pass');
    assert.equal(await edit(repo.paths.root, '.learn-build/plans/plan-01.json'), 'pass');
    for (const file of ['.learn-build/state.json', '.learn-build/learner.json', '.learn-build/threads/INDEX.json', '.learn-build/events.jsonl']) {
      assert.equal(await blocked(edit(repo.paths.root, file)), true, file);
    }
    await repo.updateWorkflow((s) => resolveDecision(s, { decisionId: 'auth-strategy', selection: 'sessions', confirmationRef: 'm', at: AT }));
    await repo.updateWorkflow((s) => startTask(s, { taskId: 'auth-01', authorisationRef: 'cmd', at: AT }));
    assert.equal(await blocked(edit(repo.paths.root, '.learn-build/state.json')), true);
    assert.equal(await blocked(edit(repo.paths.root, '.learn-build/plans/../state.json')), true);
  });

  test('the gate applies from a subfolder, and ignores files and folders outside the project', async () => {
    const repo = await authProject();
    await mkdir(join(repo.paths.root, 'src'));
    assert.equal(await blocked(edit(repo.paths.root, 'auth.ts', 'Write', join(repo.paths.root, 'src'))), true);
    const elsewhere = await tempDir();
    assert.equal(await edit(repo.paths.root, join(elsewhere, 'notes.txt')), 'pass');
    assert.equal(await edit(elsewhere, 'anything.ts'), 'pass');
  });

  test('shell commands that look like writes are blocked until a task is started', async () => {
    const repo = await authProject();
    const bash = (command: string) => preToolDecision(JSON.stringify({ cwd: repo.paths.root, tool_name: 'Bash', tool_input: { command } }));
    const writes = [
      "cat > src/auth.ts <<'EOF'\nexport const x = 1;\nEOF",
      'echo "export const x = 1" > src/auth.ts',
      'echo hi >> notes.txt',
      'printf x | tee src/auth.ts',
      "sed -i '' 's/a/b/' src/auth.ts",
      'npm install express',
      'npm i',
      'npx create-vite app',
      'git commit -am wip',
      'rm -rf src',
      'ls && touch PWNED',
      'cp a.ts b.ts',
      'mv a.ts b.ts',
      'pip install requests',
      'python3 -m venv .venv',
      '.venv/bin/python -m pip install requests',
      'uv add requests',
      'poetry add requests',
      'cargo add serde',
      'cargo init',
      'go mod init example.com/chores',
      'go get github.com/spf13/cobra',
      'bundle install',
    ];
    const reads = [
      'learnbuild status',
      "learnbuild ask --topic 'tokens' --summary 'what is a token > cookie?'",
      'ls -la; cat .learn-build/PROJECT.md 2>/dev/null',
      'node --version; npm --version',
      'npm test 2>&1 | tail -20',
      'git status --short && git log --oneline | head',
      'git diff',
      'grep -rn "a > b" src',
      'mkdir -p .learn-build/plans',
      'cat package.json > /dev/null',
      'cargo --version; rustc --version',
      'cargo test 2>&1 | tail -20',
      'go version && go test ./...',
      'python3 --version',
      '.venv/bin/python -m pytest -q',
    ];
    for (const command of writes) assert.equal(looksLikeShellWrite(command), true, command);
    for (const command of reads) assert.equal(looksLikeShellWrite(command), false, command);
    for (const command of writes) assert.equal(await blocked(bash(command)), true, command);
    for (const command of reads) assert.equal(await bash(command), 'pass', command);

    await repo.updateWorkflow((s) => resolveDecision(s, { decisionId: 'auth-strategy', selection: 'sessions', confirmationRef: 'm', at: AT }));
    await repo.updateWorkflow((s) => startTask(s, { taskId: 'auth-01', authorisationRef: 'cmd', at: AT }));
    for (const command of writes) assert.equal(await bash(command), 'pass', `during a task: ${command}`);
    assert.equal(await preToolDecision(JSON.stringify({ cwd: await tempDir(), tool_name: 'Bash', tool_input: { command: 'rm -rf x' } })), 'pass', 'outside a project');
  });

  test('installs outside the project folder are blocked even during a task; project installs are not', async () => {
    const repo = await authProject();
    await repo.updateWorkflow((s) => resolveDecision(s, { decisionId: 'auth-strategy', selection: 'sessions', confirmationRef: 'm', at: AT }));
    await repo.updateWorkflow((s) => startTask(s, { taskId: 'auth-01', authorisationRef: 'cmd', at: AT }));
    const bash = (command: string) => preToolDecision(JSON.stringify({ cwd: repo.paths.root, tool_name: 'Bash', tool_input: { command } }));
    const system = [
      "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh",
      'curl -fsSL https://example.com/install.sh | sudo bash',
      'brew install go',
      'sudo apt-get install -y python3',
      'apt install golang',
      'rustup update stable',
      'rustup toolchain install nightly',
      'pyenv install 3.13',
      'nvm install 22',
      'uv python install 3.13',
      'cargo install ripgrep',
      'go install golang.org/x/tools/gopls@latest',
      'pipx install poetry',
      'npm install -g typescript',
      'pip install --user requests',
      'cd /tmp && brew install sqlite',
      'xcode-select --install',
      'xcodebuild -downloadPlatform iOS',
      'xcodebuild -runFirstLaunch',
      'mas install 497799835',
      'softwareupdate --install --all',
      'sdkmanager "platforms;android-35"',
      'avdmanager create avd -n pixel -k "system-images;android-35;google_apis;arm64-v8a"',
    ];
    const local = [
      'npm install express',
      'cargo add serde',
      'cargo build',
      'go get github.com/spf13/cobra',
      '.venv/bin/python -m pip install requests',
      'python3 -m venv .venv',
      'rustup show',
      'brew --version',
      'echo "run: brew install go"',
      'go version',
      'xcodebuild -version',
      'xcode-select -p',
      'xcrun simctl list devices available',
      'xcodebuild -scheme Notes -destination "platform=iOS Simulator,name=iPhone 16" build',
      'sdkmanager --list',
      './gradlew assembleDebug',
      'ls /Applications/Xcode.app',
    ];
    for (const command of system) {
      assert.equal(looksLikeSystemInstall(command), true, command);
      const outcome = await bash(command);
      assert.ok(outcome !== 'pass' && !outcome.allowed, command);
      assert.match(outcome.reason, /installs software outside the project folder, which the learner does themselves/);
      assert.match(outcome.reason, /numbered steps for this computer with the full download link/);
      assert.match(outcome.reason, /ask you anything or paste an error/);
    }
    for (const command of local) {
      assert.equal(looksLikeSystemInstall(command), false, command);
      assert.equal(await bash(command), 'pass', command);
    }
    assert.equal(await preToolDecision(JSON.stringify({ cwd: await tempDir(), tool_name: 'Bash', tool_input: { command: 'brew install go' } })), 'pass', 'outside a project');

    for (const command of ['uname -sm', 'which go', 'echo $PATH', 'ls /usr/local/go/bin', '/usr/local/go/bin/go version', 'brew --version']) {
      assert.equal(await bash(command), 'pass', `diagnostic: ${command}`);
    }
    const stuck = await promptContext(JSON.stringify({ cwd: repo.paths.root, prompt: 'it says zsh: command not found: go' }));
    assert.match(stuck, /If the learner is installing a tool you asked them to install/);
    assert.match(stuck, /You may run commands that only read/);
    assert.match(stuck, /If you asked the learner to try what this step built and this message says what happened/);
    assert.equal((await repo.workflow.read()).status, 'executing');
  });

  test('other tools pass, and a corrupt state blocks edits', async () => {
    const repo = await authProject();
    for (const tool of ['Read', 'Grep', 'Skill']) {
      assert.equal(await preToolDecision(JSON.stringify({ cwd: repo.paths.root, tool_name: tool, tool_input: { command: 'ls', file_path: 'x' } })), 'pass', tool);
    }
    await writeFile(repo.paths.state, '{ broken');
    assert.equal(await blocked(edit(repo.paths.root, 'src/auth.ts')), true);
    assert.equal(await blocked(preToolDecision('not json')), true);
  });

  test('the hook process blocks a source edit with exit 2', async () => {
    const repo = await authProject();
    const payload = JSON.stringify({ cwd: repo.paths.root, tool_name: 'Write', tool_input: { file_path: 'src/auth.ts' } });
    const child = execFileP(process.execPath, [CLI, 'hook', 'pre-tool']);
    child.child.stdin?.end(payload);
    await assert.rejects(child, (e: { code: number; stderr: string }) => e.code === 2 && /no task is in progress/.test(e.stderr));
  });
});

describe('the first three commits wait for the learner', () => {
  async function executingProjectWithGit() {
    const repo = await authProject();
    await execFileP('git', ['init', '-q'], { cwd: repo.paths.root });
    await repo.updateWorkflow((s) => resolveDecision(s, { decisionId: 'auth-strategy', selection: 'sessions', confirmationRef: 'm', at: AT }));
    await repo.updateWorkflow((s) => startTask(s, { taskId: 'auth-01', authorisationRef: 'cmd', at: AT }));
    return repo;
  }
  const bash = (root: string, command: string) => preToolDecision(JSON.stringify({ cwd: root, tool_name: 'Bash', tool_input: { command } }));
  const reply = (root: string, prompt = 'ok') => promptContext(JSON.stringify({ cwd: root, prompt }));
  const COMMIT = 'git add . && git commit -m "Save step"';
  async function realCommit(root: string, n: number): Promise<void> {
    await writeFile(join(root, `file${n}.js`), `// ${n}\n`);
    await execFileP('git', ['add', `file${n}.js`], { cwd: root });
    await execFileP('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', `commit ${n}`], { cwd: root });
  }

  test('each of the first three is blocked with its own briefing until the learner replies; the fourth is not', async () => {
    const repo = await executingProjectWithGit();
    const root = repo.paths.root;
    for (let n = 0; n < 3; n++) {
      const blocked = await bash(root, COMMIT);
      assert.ok(blocked !== 'pass' && !blocked.allowed, `commit ${n + 1} pauses`);
      assert.equal(blocked.reason, COMMIT_BRIEFINGS[n]);
      const again = await bash(root, 'git commit -am "Save step"');
      assert.ok(again !== 'pass' && !again.allowed, 'retrying in the same turn stays blocked');
      assert.equal(await bash(root, 'git add .'), 'pass', 'only the commit itself waits');
      assert.match(await reply(root), /replying to your explanation of the commit/);
      assert.equal(await bash(root, COMMIT), 'pass');
      assert.doesNotMatch(await reply(root, 'thanks'), /explanation of the commit/, 'the reminder appears once');
      await realCommit(root, n);
    }
    assert.equal(await bash(root, COMMIT), 'pass', 'the fourth commit is not paused');
  });

  test('an agreement to one commit does not carry over to the next', async () => {
    const repo = await executingProjectWithGit();
    const root = repo.paths.root;
    await bash(root, COMMIT);
    await reply(root);
    await realCommit(root, 0);
    const second = await bash(root, COMMIT);
    assert.ok(second !== 'pass' && !second.allowed);
    assert.equal(second.reason, COMMIT_BRIEFINGS[1]);
  });

  test('the briefings get shorter, and the first covers what, why, which files, how and where', () => {
    assert.equal(COMMIT_BRIEFINGS.length, 3);
    assert.ok(COMMIT_BRIEFINGS[0]!.length > COMMIT_BRIEFINGS[1]!.length && COMMIT_BRIEFINGS[1]!.length > COMMIT_BRIEFINGS[2]!.length);
    for (const part of ['saved snapshot', 'why now', 'which files', 'git add <files>', 'git commit -m <message>', 'nothing is uploaded', 'git log --oneline']) {
      assert.ok(COMMIT_BRIEFINGS[0]!.includes(part), part);
    }
    assert.match(COMMIT_BRIEFINGS[2]!, /last one/);
    for (const briefing of COMMIT_BRIEFINGS) assert.match(briefing, /ask if they are happy for you to go ahead, and stop/);
  });

  test('projects without a repository and non-commit git commands are not held up', async () => {
    const repo = await executingProjectWithGit();
    for (const command of ['git status', 'git log --oneline', 'echo "git commit"', "grep -r 'git commit' ."]) {
      assert.equal(await bash(repo.paths.root, command), 'pass', command);
    }
    const noRepo = await authProject();
    await noRepo.updateWorkflow((s) => resolveDecision(s, { decisionId: 'auth-strategy', selection: 'sessions', confirmationRef: 'm', at: AT }));
    await noRepo.updateWorkflow((s) => startTask(s, { taskId: 'auth-01', authorisationRef: 'cmd', at: AT }));
    assert.equal(await bash(noRepo.paths.root, COMMIT), 'pass');
  });
});

describe('go-aheads and choices are recognised by fixed rules', () => {
  const OPTIONS = ['sessions', 'tokens', 'json-file'];

  test('short go-aheads are recognised', () => {
    for (const text of ['next', 'Next!', 'start', 'ok', 'yes', 'yep', 'continue', 'go ahead', "ok let's go", 'lets start', 'next step please', 'sounds good', 'looks good, next', 'carry on', 'keep going', "I'm ready", 'build it', 'just go ahead and build the whole thing for me now', '/learn-build']) {
      assert.deepEqual(classifyPrompt(text, null), { intent: 'go' }, text);
    }
  });

  test('questions, statements and anything unusual are not go-aheads', () => {
    for (const text of ['what is a token?', 'next?', 'why', 'no', 'not yet', 'hmm', 'wait', 'tell me more about sessions', 'can you explain the next step', 'start with a database lesson', 'ok but what about passwords', 'show me an example', '', 'cool', '/learn-progress', '/learn-plan', 'x '.repeat(20)]) {
      assert.deepEqual(classifyPrompt(text, null), { intent: 'other' }, text);
    }
  });

  test('a choice is exactly one option name, alone or with a stock lead-in', () => {
    for (const [text, option] of [
      ['sessions', 'sessions'], ['Sessions.', 'sessions'], ['tokens please', 'tokens'], ["let's go with sessions", 'sessions'],
      ['I choose tokens', 'tokens'], ['ok use the json-file option', 'json-file'], ['json file', 'json-file'], ["i'd like sessions", 'sessions'],
      ['/learn-decide tokens', 'tokens'],
    ] as const) {
      assert.deepEqual(classifyPrompt(text, OPTIONS), { intent: 'decide', option }, text);
    }
  });

  test('vague, hedged, combined or questioning replies are not choices', () => {
    for (const text of ['the simple one', 'whichever is easier', 'sessions?', 'sessions or tokens', 'maybe sessions', 'not sessions', 'sessions I guess', 'what about sessions', 'the first one', 'sqlite', '/learn-decide whichever', '/learn-decide']) {
      assert.notEqual(classifyPrompt(text, OPTIONS).intent, 'decide', text);
    }
    assert.deepEqual(classifyPrompt('sessions', null), { intent: 'other' }, 'no pending decision');
  });

  test('a go-ahead while a decision is pending does not choose anything', () => {
    assert.deepEqual(classifyPrompt('next', OPTIONS), { intent: 'go' });
    assert.deepEqual(classifyPrompt('yes', OPTIONS), { intent: 'go' });
  });
});

describe('starting a task and recording a decision need the learner\'s own message', () => {
  const say = (root: string, prompt: string) => promptContext(JSON.stringify({ cwd: root, prompt }));
  const bash = (root: string, command: string) => preToolDecision(JSON.stringify({ cwd: root, tool_name: 'Bash', tool_input: { command } }));
  const isBlocked = async (outcome: ReturnType<typeof bash>) => {
    const result = await outcome;
    return result !== 'pass' && !result.allowed;
  };
  const RESOLVE = (option: string) => `learnbuild decision resolve --id auth-strategy --select ${option} --confirm-ref 'x' --expected-revision 1`;
  const START = "learnbuild task start --id auth-01 --confirm-ref 'x'";

  test('with no learner message on record, both are blocked', async () => {
    const repo = await authProject();
    assert.equal(await isBlocked(bash(repo.paths.root, RESOLVE('sessions'))), true);
    assert.equal(await isBlocked(bash(repo.paths.root, START)), true);
  });

  test('a decision is recordable only on the turn the learner named that option', async () => {
    const repo = await authProject();
    const root = repo.paths.root;
    for (const text of ['what is a token?', "let's go with the simple one", 'next', 'write the sessions version in src/auth.ts']) {
      await say(root, text);
      assert.equal(await isBlocked(bash(root, RESOLVE('sessions'))), true, text);
    }
    const context = await promptContext(JSON.stringify({ cwd: root, prompt: 'sessions', prompt_id: 'abc123' }));
    assert.match(context, /--confirm-ref 'learner-message-abc123'/);
    assert.match(context, /option name "sessions"/);
    assert.match(context, /learn-decide skill/);
    assert.equal(await isBlocked(bash(root, RESOLVE('tokens'))), true, 'a different option than the learner named');
    assert.equal(await bash(root, RESOLVE('sessions')), 'pass');
    assert.equal(await bash(root, "learnbuild decision resolve --id auth-strategy --select 'sessions' --confirm-ref x"), 'pass');
    await say(root, 'thanks');
    assert.equal(await isBlocked(bash(root, RESOLVE('sessions'))), true, 'the permission lasts one learner message');
  });

  test('choices are not recorded as question threads; questions are', async () => {
    const repo = await authProject();
    await say(repo.paths.root, 'sessions');
    await say(repo.paths.root, 'next');
    assert.equal((await repo.threads.read()).activeThreadId, null);
    await say(repo.paths.root, 'what is a session?');
    assert.notEqual((await repo.threads.read()).activeThreadId, null);
  });

  test('a task is startable only on a go-ahead turn', async () => {
    const repo = await authProject();
    const root = repo.paths.root;
    await repo.updateWorkflow((s) => resolveDecision(s, { decisionId: 'auth-strategy', selection: 'sessions', confirmationRef: 'm', at: AT }));
    for (const text of ['how do sessions work?', 'show me what the code will look like', 'sessions', 'cool']) {
      await say(root, text);
      assert.equal(await isBlocked(bash(root, START)), true, text);
    }
    for (const text of ['next', '/learn-build', "ok let's start"]) {
      await say(root, text);
      assert.equal(await bash(root, START), 'pass', text);
    }
  });

  test('a go-ahead is routed to the right stage', async () => {
    const { root } = await newProject('Router Test');
    assert.match(await say(root, 'next'), /brief is not written yet, so follow the learn-new skill/);
    await writeFile(join(root, '.learn-build', 'PROJECT.md'), '# Router Test\n\nA real brief.\n');
    assert.match(await say(root, 'start'), /no plan, so follow the learn-plan skill/);
    const repo = new ProjectRepository(root);
    await repo.updateWorkflow((s) => applyPlan(s, PLAN, AT));
    assert.match(await say(root, 'next'), /follow the learn-build skill to start or continue the next step/);
    await repo.updateWorkflow((s) => startTask(s, { taskId: 'setup', authorisationRef: 'm', at: AT }));
    assert.match(await say(root, 'continue'), /continue the task in progress/);

    const waiting = await authProject();
    const text = await say(waiting.paths.root, 'next');
    assert.match(text, /cannot move on until the decision above is made/);
    assert.match(text, /If your last reply asked them a question, it is their answer/);
  });
});

describe('per-message context (UserPromptSubmit)', () => {
  const context = (root: string, prompt: string) => promptContext(JSON.stringify({ hook_event_name: 'UserPromptSubmit', cwd: root, prompt }));

  test('tools are chosen for being common and established, and each choice is explained', async () => {
    const rendered = await renderTemplates();
    const plan = rendered.get('skills/learn-plan/SKILL.md')!;
    assert.match(plan, /Pick the tool most developers use for that job today/);
    assert.match(plan, /widely adopted, used in production for years, actively maintained and well documented/);
    assert.match(plan, /Do not pick a tool that is niche, experimental, newly released or no longer maintained/);
    assert.match(plan, /List every tool the project will use with the reason it was chosen/);
    assert.match(plan, /one row for every tool the project will use/);
    const build = rendered.get('skills/learn-build/SKILL.md')!;
    assert.match(build, /tell the learner what it is and why you chose it before installing it/);
  });

  test('the language comes from the brief, and missing tools are installed by the learner', async () => {
    const rendered = await renderTemplates();
    const brief = rendered.get('skills/learn-new/SKILL.md')!;
    assert.match(brief, /record it in `PROJECT\.md` under a "Learner's preferences" heading/);
    const plan = rendered.get('skills/learn-plan/SKILL.md')!;
    assert.match(plan, /If `PROJECT\.md` records a language or tool the learner wants, use it/);
    assert.match(plan, /For a web page or a web application, use TypeScript on Node\.js/);
    assert.doesNotMatch(plan, /Prefer TypeScript/);
    assert.match(plan, /Add a "What needs to be installed" section/);
    assert.match(plan, /one acceptance criterion for each tool in "What needs to be installed"/);
    const build = rendered.get('skills/learn-build/SKILL.md')!;
    assert.match(build, /### Checking the tools/);
    assert.match(build, /They run the install themselves/);
    assert.match(build, /Run `uname -sm` for the operating system and the processor type/);
    assert.match(build, /Put each command in its own code block, complete and ready to copy/);
    assert.match(build, /End the list with the command that proves it worked/);
    assert.match(build, /they can ask you anything while they do it/);
    assert.match(build, /Run commands that only read to look for yourself/);
    assert.match(build, /Never tell them to quit that application or close this window/);
    assert.match(build, /Look in the place the installer puts it and run it from there by its full path/);
    assert.match(build, /create a virtual environment in the project folder/);
  });

  test('what an idea needs beyond the computer is found and raised while the brief is written', async () => {
    const rendered = await renderTemplates();
    const brief = rendered.get('skills/learn-new/SKILL.md')!;
    assert.match(brief, /### What the idea needs/);
    assert.ok(brief.indexOf('### What the idea needs') < brief.indexOf('### Writing the brief'));
    assert.match(brief, /A particular kind of computer/);
    assert.match(brief, /A large application that has to be installed/);
    assert.match(brief, /An account, a key or a payment/);
    assert.match(brief, /tell the learner now and do not leave it for planning/);
    assert.match(brief, /ask whether they want to go ahead as described or change something, and wait/);
    assert.match(brief, /add a "What this project needs" section/);
    assert.match(brief, /follow Part 1 of the learn-mobile skill/);
    assert.match(brief, /^allowed-tools: .*Bash\(uname -sm\)/m);
    const plan = rendered.get('skills/learn-plan/SKILL.md')!;
    assert.match(plan, /has no "What this project needs" section, the learner has not been told/);
    assert.match(plan, /leave out any tool that does not run on the learner's computer/);
    assert.match(plan, /Applications that are installed and used through windows and menus belong on this list too/);
    const build = rendered.get('skills/learn-build/SKILL.md')!;
    assert.match(build, /which choices to make on each screen in the order they appear/);
  });

  test('a phone app gets its own questions, tool choices and build guidance', async () => {
    const rendered = await renderTemplates();
    const mobile = rendered.get('skills/learn-mobile/SKILL.md')!;
    assert.match(mobile, /^user-invocable: false$/m);
    for (const question of ['Which phones should it run on\?', 'What computer are you building it on\?', 'Which phone do you have to try it on\?', 'Who needs to be able to install it\?', 'Does it use anything only a phone has\?']) {
      assert.match(mobile, new RegExp(question));
    }
    assert.match(mobile, /Xcode does not run on Windows or Linux/);
    assert.match(mobile, /Ask which they want and wait\. Do not choose for them/);
    assert.match(mobile, /under a "Phones and equipment" heading/);
    assert.match(mobile, /\| iPhone only, on a Mac \| Swift with SwiftUI \| Xcode \|/);
    assert.match(mobile, /\| Android only \| Kotlin with Jetpack Compose \| Android Studio \|/);
    assert.match(mobile, /\| Both kinds of phone \| React Native with Expo, written in TypeScript \|/);
    assert.match(mobile, /That look is not an acceptance criterion and must not be recorded as one/);
    assert.match(mobile, /Xcode has no command that creates an app project, so the learner creates it in Xcode/);
    assert.match(rendered.get('skills/learn-plan/SKILL.md')!, /follow Part 2 of the learn-mobile skill/);
    assert.match(rendered.get('skills/learn-build/SKILL.md')!, /follow Part 3 of the learn-mobile skill/);
    for (const command of ['pod install', 'flutter create notes', 'flutter pub add http']) {
      assert.equal(looksLikeShellWrite(command), true, command);
    }
  });

  test('the learner is told what commands cannot check and tries each step themselves', async () => {
    const rendered = await renderTemplates();
    const plan = rendered.get('skills/learn-plan/SKILL.md')!;
    assert.match(plan, /Take this from the current official documentation of the tools you chose/);
    assert.match(plan, /say in the notes that it was not checked against the documentation/);
    assert.match(plan, /a "How you will run and use it" section/);
    assert.match(plan, /add a "Try it" line saying what the learner will do and what they should see/);
    assert.match(plan, /\*\*How each step is checked\.\*\*/);
    assert.match(plan, /the step is not finished until they have/);
    const build = rendered.get('skills/learn-build/SKILL.md')!;
    assert.match(build, /### Trying it yourself/);
    assert.ok(build.indexOf('### Trying it yourself') < build.indexOf('### Committing'));
    assert.match(build, /Tell the learner what the commands checked and what they cannot see/);
    assert.match(build, /Ask them to try it and tell you what happened/);
    assert.match(build, /treat it as a fault in the step/);
    assert.match(build, /`\.learn-build\/evidence\/<task id>-tried-by-learner\.txt`/);
    assert.match(build, /Do not attach it to an acceptance criterion/);
    assert.match(rendered.get('skills/learn-mobile/SKILL.md')!, /follow "Trying it yourself" in the learn-build skill/);
  });

  test('tests are left out of setup and introduced in a step of their own', async () => {
    const rendered = await renderTemplates();
    const plan = rendered.get('skills/learn-plan/SKILL.md')!;
    assert.match(plan, /The first task sets up the project so that it can be run\. It adds no automated tests and no testing tools\./);
    assert.match(plan, /Give automated testing a task of its own, tagged `automated-testing`/);
    const example = JSON.parse(/```json\n([\s\S]*?)```/.exec(plan)![1]!) as PlanInput;
    const tagged = example.tasks.filter((t) => t.competencyIds?.includes('automated-testing')).map((t) => t.id);
    assert.deepEqual(tagged, ['add-tests']);
    assert.doesNotMatch(JSON.stringify(example.tasks[0]), /test/i);
    assert.ok(example.tasks.findIndex((t) => t.id === 'add-tests') > 1, 'testing follows a working feature');

    const build = rendered.get('skills/learn-build/SKILL.md')!;
    assert.match(build, /Until that step has started, do not write tests or install a testing tool/);
    assert.match(build, /### The testing step/);
    assert.match(build, /Put the code back and run the test again/);
  });

  test('the learn-new skill offers a review of the brief or moving on, by name', async () => {
    const newSkill = (await renderTemplates()).get('skills/learn-new/SKILL.md')!;
    assert.match(newSkill, /\*\*review\*\* goes through the brief and the requirements/);
    assert.match(newSkill, /\*\*next\*\* moves on to planning/);
    assert.match(newSkill, /Do not phrase the offer as a yes-or-no question/);
    assert.match(newSkill, /### Going through the brief/);
  });

  test('between the brief and the plan, a request to review is routed to the brief walk-through', async () => {
    const { root } = await newProject('Review Test');
    const repo = new ProjectRepository(root);
    const NOTE = /follow "Going through the brief" in the learn-new skill/;

    assert.doesNotMatch(await context(root, 'review'), NOTE, 'no brief to review yet');

    await writeFile(join(root, '.learn-build', 'PROJECT.md'), '# Review Test\n\nA real brief.\n');
    const before = (await repo.workflow.read()).revision;
    for (const prompt of ['review', 'can we go through the requirements?', 'change R2 so it also shows the score']) {
      const text = await context(root, prompt);
      assert.match(text, NOTE, prompt);
      assert.match(text, /may be written to \.learn-build\/PROJECT\.md and \.learn-build\/REQUIREMENTS\.md/, prompt);
      assert.match(text, /Do not create or edit any other project files and do not start a task/, prompt);
      const start = await preToolDecision(JSON.stringify({ cwd: root, tool_name: 'Bash', tool_input: { command: "learnbuild task start --id setup --confirm-ref 'x'" } }));
      assert.ok(start !== 'pass' && !start.allowed, prompt);
    }
    assert.equal((await repo.workflow.read()).revision, before, 'reviewing does not touch workflow state');

    const go = await context(root, 'next');
    assert.match(go, /no plan, so follow the learn-plan skill/);
    assert.doesNotMatch(go, NOTE);

    await repo.updateWorkflow((s) => applyPlan(s, PLAN, AT));
    assert.doesNotMatch(await context(root, 'review'), NOTE, 'once a plan exists the general rules apply');
  });

  test('free text during a pending decision gets the state and the question rules', async () => {
    const repo = await authProject();
    const text = await context(repo.paths.root, 'what is a token?');
    assert.match(text, /status: waiting_for_decision/);
    assert.match(text, /Sessions or token-based authentication\?/);
    assert.match(text, /Options: sessions, tokens/);
    assert.match(text, /learn-ask skill/);
    assert.match(text, /exactly one of the option names: sessions or tokens/);
    assert.match(text, /Do not create or edit project files/);
    assert.match(text, /say "next"/);
  });

  test('a /learn- command gets the state without the free-text rules, and is not recorded', async () => {
    const repo = await authProject();
    const text = await context(repo.paths.root, '/learn-decide sessions');
    assert.match(text, /status: waiting_for_decision/);
    assert.doesNotMatch(text, /learn-ask skill/);
    assert.equal((await repo.threads.read()).activeThreadId, null);
  });

  test('T01-T03 without model cooperation: the hook records the discussion and resume returns to the decision', async () => {
    const repo = await authProject();
    const stateHash = await fileHash(repo.paths.state);
    const first = await context(repo.paths.root, 'what is a token?');
    assert.match(first, /has been recorded on question thread "thread-[0-9a-f]{8}"/);
    await context(repo.paths.root, 'how is that different from a cookie?');
    await context(repo.paths.root, 'where would we store it?');

    const threads = await repo.threads.read();
    const thread = threads.threads[threads.activeThreadId!]!;
    assert.equal(Object.keys(threads.threads).length, 1);
    assert.deepEqual(thread.entries.map((e) => e.summary), ['what is a token?', 'how is that different from a cookie?', 'where would we store it?']);
    assert.equal(thread.pausedDecisionId, 'auth-strategy');
    assert.equal(await fileHash(repo.paths.state), stateHash);

    const outcome = await repo.resume(AT);
    assert.equal(outcome.resumePoint.pausedDecisionStillPending, true);
    assert.equal(await fileHash(repo.paths.state), stateHash);
  });

  test('messages are not recorded when no decision is pending, and long ones are shortened', async () => {
    const repo = await authProject();
    await context(repo.paths.root, `why ${'very '.repeat(100)}long?`);
    const threads = await repo.threads.read();
    assert.ok(threads.threads[threads.activeThreadId!]!.topic.length <= 120);
    await repo.resume(AT);
    await repo.updateWorkflow((s) => resolveDecision(s, { decisionId: 'auth-strategy', selection: 'sessions', confirmationRef: 'm', at: AT }));
    await context(repo.paths.root, 'another question');
    assert.equal((await repo.threads.read()).activeThreadId, null);
  });

  test('during a task the rules change, and the open thread is named', async () => {
    const repo = await authProject();
    await repo.updateWorkflow((s) => resolveDecision(s, { decisionId: 'auth-strategy', selection: 'sessions', confirmationRef: 'm', at: AT }));
    await repo.updateWorkflow((s) => startTask(s, { taskId: 'auth-01', authorisationRef: 'cmd', at: AT }));
    await repo.updateThreads((t, w) => openQuestion(t, w, { threadId: 'q', topic: 'cookies', summary: 'what is a cookie?', ref: 'm', at: AT }));
    const text = await context(repo.paths.root, 'why a cookie?');
    assert.match(text, /Task "auth-01" .* is in progress/);
    assert.match(text, /Open question thread: "cookies"/);
    assert.match(text, /Carry on with the task only if the learner asks/);
  });

  test('outside a project it says nothing, and it never changes workflow state', async () => {
    assert.equal(await context(await tempDir(), 'hello'), '');
    assert.equal(await promptContext('not json'), '');
    const repo = await authProject();
    const hash = await fileHash(repo.paths.state);
    await context(repo.paths.root, 'what is a token?');
    assert.equal(await fileHash(repo.paths.state), hash);
  });

  test('the hook process prints the context and exits 0 even on bad input', async () => {
    const repo = await authProject();
    const good = execFileP(process.execPath, [CLI, 'hook', 'prompt']);
    good.child.stdin?.end(JSON.stringify({ cwd: repo.paths.root, prompt: 'why?' }));
    assert.match((await good).stdout, /\[LearnBuild\] Project "football-app"/);
    const bad = execFileP(process.execPath, [CLI, 'hook', 'prompt']);
    bad.child.stdin?.end('garbage');
    assert.equal((await bad).stdout, '');
  });
});
