import { spawnSync } from 'node:child_process';
import { access, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const GIT_DOCS_URL = 'https://git-scm.com/book/en/v2/Getting-Started-About-Version-Control';
export const GIT_INSTALL_URL = 'https://git-scm.com/downloads';
export const VERSION_CONTROL_LABEL = 'Version control:';

export const GIT_EXPLANATION = [
  'Git is a version control tool. It saves snapshots of your project, called commits, so you can see what changed and go back to an earlier version if something breaks.',
  'It is worth having if you want that history, plan to share your code with other people, or want a copy kept safely somewhere other than this computer.',
  'A Git repository stays on your own computer. Your code goes nowhere else unless you later choose to send it to a service such as GitHub, and LearnBuild never does that for you.',
  'If none of that matters to you yet, you can skip it and run "git init" in the project folder later.',
  `The free Pro Git book explains it well: ${GIT_DOCS_URL}`,
  'You can also ask about Git at any time inside Claude Code.',
].join('\n');

export type GitChoice = 'init' | 'skip';
export type GitOutcome = 'initialised' | 'already' | 'skipped' | 'not_installed';

export function gitInstalled(): boolean {
  return spawnSync('git', ['--version'], { stdio: 'ignore' }).status === 0;
}

const LINES: Readonly<Record<GitOutcome, string>> = {
  initialised: 'Git repository created on this computer. Nothing is uploaded anywhere.',
  already: 'Git repository created on this computer. Nothing is uploaded anywhere.',
  skipped: 'not using Git for now. Run `git init` in this folder to add it later.',
  not_installed: `Git is wanted but is not installed on this computer yet. Install it from ${GIT_INSTALL_URL}, then run \`git init\` in this folder.`,
};

/**
 * Applies the learner's choice about Git and records it in the project brief,
 * so the question is asked once. It never adds a remote or pushes.
 */
export async function applyGitChoice(root: string, choice: GitChoice): Promise<GitOutcome> {
  let outcome: GitOutcome = 'skipped';
  if (choice === 'init') {
    const exists = await access(join(root, '.git')).then(() => true, () => false);
    if (exists) outcome = 'already';
    else if (!gitInstalled()) outcome = 'not_installed';
    else outcome = spawnSync('git', ['init', '-q'], { cwd: root, stdio: 'ignore' }).status === 0 ? 'initialised' : 'not_installed';
  }
  const briefPath = join(root, '.learn-build', 'PROJECT.md');
  const brief = await readFile(briefPath, 'utf8').catch(() => '');
  const kept = brief.split('\n').filter((line) => !line.startsWith(VERSION_CONTROL_LABEL));
  while (kept.length > 0 && kept[kept.length - 1] === '') kept.pop();
  await writeFile(briefPath, `${kept.join('\n')}\n\n${VERSION_CONTROL_LABEL} ${LINES[outcome]}\n`);
  return outcome;
}

/**
 * Asks the Git question until it gets yes or no. "?" (or any request for an
 * explanation) prints what Git is and asks again.
 */
export async function askAboutGit(ask: (question: string) => Promise<string>, out: (line: string) => void): Promise<GitChoice> {
  for (;;) {
    const answer = (await ask('Do you want to initialise a Git repository for this project? (y = yes, n = no, ? = what is this?) '))
      .trim()
      .toLowerCase();
    if (answer === 'y' || answer === 'yes') return 'init';
    if (answer === 'n' || answer === 'no') return 'skip';
    if (answer === '' || /^(\?|what|why|explain|help|h$)/.test(answer)) out(`\n${GIT_EXPLANATION}\n`);
    else out('Please answer y, n or ?.');
  }
}
