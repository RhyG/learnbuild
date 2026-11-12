import { spawn, spawnSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface, type Interface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { LearnBuildError } from '../domain/errors.js';
import { installClaudeFiles, installGlobalNewSkill } from '../install/install.js';
import { BRIEF_PLACEHOLDER, findProjectRoot, initProject, isFrameworkRoot } from '../state/project.js';
import { GIT_INSTALL_URL, applyGitChoice, askAboutGit, type GitChoice } from './git.js';
import { makeStyle } from './style.js';

export { BRIEF_PLACEHOLDER };
const SETUP_URL = 'https://code.claude.com/docs/en/setup';
const EDITOR_URL = 'https://code.visualstudio.com';

export interface Editor {
  command: string;
  name: string;
}

const KNOWN_EDITORS: readonly Editor[] = [
  { command: 'code', name: 'VS Code' },
  { command: 'cursor', name: 'Cursor' },
  { command: 'windsurf', name: 'Windsurf' },
  { command: 'zed', name: 'Zed' },
  { command: 'subl', name: 'Sublime Text' },
];

/** Turns a project name into a folder name and project id. */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

async function isEmptyOrMissing(dir: string): Promise<boolean> {
  try {
    return (await readdir(dir)).length === 0;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true;
    throw error;
  }
}

function hasCommand(command: string): boolean {
  return spawnSync(command, ['--version'], { stdio: 'ignore' }).status === 0;
}

export function detectEditors(): Editor[] {
  return KNOWN_EDITORS.filter((editor) => hasCommand(editor.command));
}

export interface NewIo {
  cwd: string;
  out: (line: string) => void;
  now: () => string;
  interactive: boolean;
  colour?: boolean;
  home?: string;
  /** Replaceable for tests; defaults to looking for known editors on PATH. */
  editors?: () => Editor[];
  /** Replaceable for tests; defaults to launching the editor on the folder. */
  openEditor?: (editor: Editor, folder: string) => void;
  /** Replaceable for tests; defaults to starting the learner's shell in the folder. */
  enterShell?: (folder: string) => Promise<void>;
}

const SHELL_MARKER = 'LEARNBUILD_PROJECT_SHELL';

function startShell(folder: string): Promise<void> {
  const shell = process.env['SHELL'] ?? (process.platform === 'win32' ? (process.env['ComSpec'] ?? 'cmd.exe') : '/bin/sh');
  return new Promise((done) => {
    const child = spawn(shell, [], { cwd: folder, stdio: 'inherit', env: { ...process.env, [SHELL_MARKER]: folder } });
    child.on('error', () => done());
    child.on('exit', () => done());
  });
}

/**
 * Leaves the learner inside the project folder. A program cannot change the
 * directory of the shell that started it, so this starts a new shell there;
 * typing `exit` returns to the original one. Skipped when there is no
 * terminal, or when this is already such a shell for the same folder.
 */
export async function enterProjectFolder(folder: string, io: NewIo, style: ReturnType<typeof makeStyle>): Promise<void> {
  if (!io.interactive || process.env[SHELL_MARKER] === folder) return;
  io.out(`\n${style.bold(`📂 You are now in your project folder: ${folder}`)}`);
  io.out(style.dim('  Type "claude" to carry on with the project, or "exit" to go back to the folder you started in.\n'));
  await (io.enterShell ?? startShell)(folder);
}

function runClaude(folder: string, args: string[]): Promise<number | null> {
  return new Promise((done) => {
    const child = spawn('claude', args, { cwd: folder, stdio: 'inherit' });
    child.on('error', () => done(null));
    child.on('exit', (code) => done(code ?? 0));
  });
}

/**
 * `learnbuild open [folder]`: opens Claude Code in an existing project and
 * leaves the learner in its folder afterwards. Returns the process exit code.
 */
export async function runOpen(argv: string[], io: NewIo): Promise<number> {
  const style = makeStyle(io.colour ?? false);
  const named = argv.find((arg) => !arg.startsWith('-'));
  const root = await findProjectRoot(resolve(io.cwd, named ?? '.'));
  if (root === null) {
    io.out(
      named === undefined
        ? 'There is no LearnBuild project in this folder. Name the project folder, for example:  learnbuild open my-project'
        : `"${named}" is not a LearnBuild project folder. To start a new project, run:  learnbuild new`,
    );
    return 1;
  }
  if (!hasCommand('claude')) {
    io.out(`${style.yellow('Claude Code is not installed yet.')} Install it from ${SETUP_URL}.`);
    await enterProjectFolder(root, io, style);
    return 0;
  }
  if (!io.interactive) {
    io.out(`To open this project, run:\n    cd "${root}"\n    claude`);
    return 0;
  }
  const brief = await readFile(join(root, '.learn-build', 'PROJECT.md'), 'utf8').catch(() => '');
  const needsBrief = brief === '' || brief.includes(BRIEF_PLACEHOLDER) || !brief.includes('Version control:');
  io.out(`\n${style.bold(style.magenta('▶ Opening Claude Code in your project.'))}\n`);
  const code = await runClaude(root, needsBrief ? ['/learn-new'] : []);
  if (code === null) io.out('Could not open Claude Code.');
  await enterProjectFolder(root, io, style);
  return code ?? 1;
}

function launchEditor(editor: Editor, folder: string): void {
  spawn(editor.command, [folder], { detached: true, stdio: 'ignore' }).on('error', () => undefined).unref();
}

/**
 * `learnbuild new`: creates a project folder ready for Claude Code and, unless
 * told otherwise, opens Claude Code in it with `/learn-new` already running.
 * Returns the process exit code.
 */
export async function runNew(argv: string[], io: NewIo): Promise<number> {
  const prompt = io.interactive ? createInterface({ input: process.stdin, output: process.stdout }) : null;
  try {
    return await create(argv, io, prompt);
  } finally {
    prompt?.close();
  }
}

async function create(argv: string[], io: NewIo, prompt: Interface | null): Promise<number> {
  const style = makeStyle(io.colour ?? false);
  const ok = style.green('✔');
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        name: { type: 'string' },
        dir: { type: 'string' },
        'no-launch': { type: 'boolean' },
        git: { type: 'boolean' },
        'no-git': { type: 'boolean' },
        'no-editor': { type: 'boolean' },
      },
      strict: true,
    }));
  } catch (error) {
    io.out(
      `${(error as Error).message}\nUsage: learnbuild new [--name "My project"] [--dir <parent folder>] [--git | --no-git] [--no-editor] [--no-launch]`,
    );
    return 2;
  }
  const parent = resolve(io.cwd, values.dir ?? '.');

  const inside = await findProjectRoot(parent);
  if (inside !== null) {
    io.out(`This folder is already inside a LearnBuild project (${inside}).\nTo carry on with it, run:  cd "${inside}" && claude`);
    return 1;
  }
  if (await isFrameworkRoot(parent)) {
    io.out('This is the LearnBuild source folder. Run "learnbuild new" from the folder where you keep your projects.');
    return 1;
  }

  let name = values.name?.trim() ?? '';
  let target = '';
  // Left undecided when it cannot be asked here; /learn-new asks instead.
  let gitChoice: GitChoice | null = values.git ? 'init' : values['no-git'] ? 'skip' : null;
  if (name === '' && prompt === null) {
    io.out('Give the project a name, for example:  learnbuild new --name "Football finder"');
    return 2;
  }
  if (prompt !== null) {
    io.out(`\n  ${style.bold(style.cyan('🌱 LearnBuild'))}\n  ${style.dim('Build your own project and learn the engineering as you go.')}\n`);
  }
  for (;;) {
    if (name === '' && prompt !== null) name = (await prompt.question(style.bold('What would you like to call your project? '))).trim();
    const slug = slugify(name);
    target = join(parent, slug);
    let problem: string | null = null;
    if (slug === '') problem = 'The name needs at least one letter or number.';
    else if (!(await isEmptyOrMissing(target))) problem = `A folder called "${slug}" already exists here and has files in it.`;
    if (problem === null) break;
    io.out(style.yellow(problem));
    if (prompt === null) return 1;
    name = '';
  }
  if (gitChoice === null && prompt !== null) gitChoice = await askAboutGit((q) => prompt.question(style.bold(q)), io.out);

  const slug = slugify(name);
  await mkdir(target, { recursive: true });
  try {
    await initProject(target, { projectId: slug, at: io.now() });
    await installClaudeFiles(target);
  } catch (error) {
    if (!(error instanceof LearnBuildError)) throw error;
    io.out(`Could not set up the project: ${error.message}`);
    return 1;
  }
  await writeFile(
    join(target, '.learn-build', 'PROJECT.md'),
    `# ${name}\n\n${BRIEF_PLACEHOLDER} Run \`/learn-new\` in Claude Code to write it.\n`,
  );
  await writeFile(join(target, '.gitignore'), 'node_modules/\n.env\n.env.*\n!.env.example\n*.lock.reclaim\n.learn-build/**/*.lock\n.learn-build/**/.*.tmp\n', {
    flag: 'wx',
  }).catch(() => undefined);
  const gitOutcome = gitChoice === null ? null : await applyGitChoice(target, gitChoice);
  const globalSkill = await installGlobalNewSkill(io.home ?? homedir()).catch(() => null);

  io.out(`\n${ok} ${style.bold(`Created your project folder: ${target}`)}`);
  io.out(style.dim('    .learn-build/  keeps your progress, decisions and plan'));
  io.out(style.dim('    .claude/       adds the /learn commands to Claude Code'));
  if (gitOutcome === 'initialised') io.out(style.dim('    .git/          your Git repository; it stays on this computer'));
  if (gitOutcome === 'not_installed') {
    io.out(style.yellow(`  Git is not installed, so no repository was created. You can install it later from ${GIT_INSTALL_URL}.`));
  }
  if (globalSkill !== null) io.out(`${ok} Added /learn-new to Claude Code (${globalSkill}), so you can start a project from any session.`);

  if (!values['no-editor']) await offerEditor(target, io, prompt, style);

  const tips = style.dim('  Once inside: say "next" to move on, ask anything at any time, and type /learn-help to see every command.');
  const later = `${style.bold('To come back to this project another day, run:')}  ${style.cyan(`learnbuild open ${slug}`)}`;
  if (prompt === null) {
    // No terminal to leave the learner in, so say how to get there.
    const start = `    cd "${target}"\n    claude "/learn-new"`;
    const lead = hasCommand('claude')
      ? style.bold('To start, run:')
      : `${style.yellow('Claude Code is not installed yet.')} Install it from ${SETUP_URL} and then run:`;
    io.out(`\n${lead}\n${style.cyan(start)}\n${tips}`);
    return 0;
  }
  prompt.close();
  let exitCode = 0;
  if (!hasCommand('claude')) {
    io.out(`\n${style.yellow('Claude Code is not installed yet.')} Install it from ${SETUP_URL}, then type:  ${style.cyan('claude "/learn-new"')}`);
  } else if (values['no-launch']) {
    io.out(`\n${style.bold('To start, type:')}  ${style.cyan('claude "/learn-new"')}\n${tips}`);
  } else {
    io.out(`\n${style.bold(style.magenta('▶ Opening Claude Code in that folder.'))} It will ask about your idea.\n${tips}\n`);
    const code = await runClaude(target, ['/learn-new']);
    if (code === null) io.out(`Could not open Claude Code. Type:  claude "/learn-new"`);
    exitCode = code ?? 1;
  }
  io.out(`\n${later}`);
  await enterProjectFolder(target, io, style);
  return exitCode;
}

/** Suggests opening the folder in a code editor, and opens it if the learner says yes. */
async function offerEditor(target: string, io: NewIo, prompt: Interface | null, style: ReturnType<typeof makeStyle>): Promise<void> {
  const editors = (io.editors ?? detectEditors)();
  const editor = editors[0];
  io.out(`\n${style.bold('💡 Want to see your code as it is written?')}`);
  if (editor === undefined) {
    io.out(`  Open the project folder in a code editor. VS Code is free: ${EDITOR_URL}`);
    return;
  }
  if (prompt === null) {
    io.out(`  Open the project in ${editor.name}:  ${style.cyan(`${editor.command} "${target}"`)}`);
    return;
  }
  for (;;) {
    const answer = (await prompt.question(`  Open the project in ${editor.name} now? (y/n) `)).trim().toLowerCase();
    if (answer === 'y' || answer === 'yes') {
      (io.openEditor ?? launchEditor)(editor, target);
      io.out(`  ${style.green('✔')} Opened in ${editor.name}. Keep it beside this window.`);
      return;
    }
    if (answer === 'n' || answer === 'no') {
      io.out(style.dim(`  No problem. You can do it later with:  ${editor.command} "${target}"`));
      return;
    }
    io.out('  Please answer y or n.');
  }
}
