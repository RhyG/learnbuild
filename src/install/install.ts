import { mkdir, readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fail } from '../domain/errors.js';
import { loadProseStandard, withProseStandard } from '../prose/standard.js';
import { writeFileAtomic } from '../state/atomic.js';
import { isFrameworkRoot } from '../state/project.js';

// Compiled output lives in dist/src/install/, three levels below the package root.
export const TEMPLATES_DIR = fileURLToPath(new URL('../../../templates/claude/', import.meta.url));
const PROJECT_CLAUDE_MD = fileURLToPath(new URL('../../../templates/project/CLAUDE.md', import.meta.url));

export interface InstallOptions {
  /** Overwrite installed files that differ from the current templates. */
  force?: boolean;
  allowFrameworkRoot?: boolean;
}

export interface InstallResult {
  written: string[];
  unchanged: string[];
}

/**
 * Registered in the project's settings because hooks declared in agent or
 * skill frontmatter did not run when tested (Claude Code 2.1.322). The shell
 * wrapper turns a missing binary or a crash into exit 2, which blocks the call.
 */
export const PRE_TOOL_HOOK_COMMAND =
  "command -v learnbuild >/dev/null 2>&1 || { echo 'LearnBuild guard hook cannot run: learnbuild is not on PATH.' >&2; exit 2; }; learnbuild hook pre-tool || exit 2";

/** Adds context only, so it is allowed to fail without blocking the message. */
export const PROMPT_HOOK_COMMAND = 'learnbuild hook prompt 2>/dev/null || true';

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLearnBuildEntry(entry: unknown): boolean {
  return (
    isObject(entry) &&
    Array.isArray(entry['hooks']) &&
    entry['hooks'].some((h) => isObject(h) && typeof h['command'] === 'string' && h['command'].includes('learnbuild hook '))
  );
}

/** Returns settings with exactly the current LearnBuild hooks, keeping all other content. */
export function mergeHooks(settings: Json): Json {
  const hooks = isObject(settings['hooks']) ? settings['hooks'] : {};
  const others = (event: string): unknown[] =>
    (Array.isArray(hooks[event]) ? (hooks[event] as unknown[]) : []).filter((entry) => !isLearnBuildEntry(entry));
  return {
    ...settings,
    hooks: {
      ...hooks,
      PreToolUse: [...others('PreToolUse'), { matcher: '*', hooks: [{ type: 'command', command: PRE_TOOL_HOOK_COMMAND }] }],
      UserPromptSubmit: [...others('UserPromptSubmit'), { hooks: [{ type: 'command', command: PROMPT_HOOK_COMMAND }] }],
    },
  };
}

async function planSettings(root: string): Promise<{ target: string; rel: string; content: string } | null> {
  const target = join(root, '.claude', 'settings.json');
  let settings: Json = {};
  const existingText = await readIfExists(target);
  if (existingText !== null) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(existingText);
    } catch {
      parsed = null;
    }
    if (!isObject(parsed)) {
      fail('INSTALL_CONFLICT', '.claude/settings.json is not valid JSON. Fix it, then run install again.', {
        conflicts: ['.claude/settings.json'],
      });
    }
    settings = parsed;
  }
  const content = `${JSON.stringify(mergeHooks(settings), null, 2)}\n`;
  if (existingText === content) return null;
  return { target, rel: '.claude/settings.json', content };
}

async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function templateFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await templateFiles(full)));
    else files.push(full);
  }
  return files.sort();
}

/**
 * Renders each template as it will be installed. Markdown instruction files
 * get the full prose standard embedded, because skills and subagents can run
 * in contexts that cannot read the framework's files.
 */
export async function renderTemplates(): Promise<Map<string, string>> {
  const standard = loadProseStandard();
  const rendered = new Map<string, string>();
  for (const file of await templateFiles(TEMPLATES_DIR)) {
    const content = await readFile(file, 'utf8');
    const rel = relative(TEMPLATES_DIR, file).split('\\').join('/');
    rendered.set(rel, file.endsWith('.md') ? withProseStandard(content, standard) : content);
  }
  return rendered;
}

/**
 * Installs the LearnBuild skills and agents into `<projectRoot>/.claude/`,
 * sets the LearnBuild hooks in `.claude/settings.json` while keeping its other
 * content, and adds a `CLAUDE.md` if the project has none. Nothing is written
 * if an existing skill or agent file differs, unless `force` is set.
 */
export async function installClaudeFiles(projectRoot: string, options: InstallOptions = {}): Promise<InstallResult> {
  const root = resolve(projectRoot);
  if (!options.allowFrameworkRoot && (await isFrameworkRoot(root))) {
    fail('UNSAFE_ROOT', `${root} is the LearnBuild framework source. Install into a learner project instead.`);
  }
  const rendered = await renderTemplates();
  const plan: { target: string; rel: string; content: string }[] = [];
  const unchanged: string[] = [];
  const conflicts: string[] = [];
  for (const [rel, content] of rendered) {
    const target = join(root, '.claude', rel);
    const existing = await readIfExists(target);
    if (existing === content) unchanged.push(`.claude/${rel}`);
    else {
      if (existing !== null && !options.force) conflicts.push(`.claude/${rel}`);
      plan.push({ target, rel: `.claude/${rel}`, content });
    }
  }
  if (conflicts.length > 0) {
    fail('INSTALL_CONFLICT', `These files exist with different content: ${conflicts.join(', ')}. Re-run with --force to replace them.`, {
      conflicts,
    });
  }
  const settingsPlan = await planSettings(root);
  if (settingsPlan === null) unchanged.push('.claude/settings.json');
  else plan.push(settingsPlan);
  // A project's own CLAUDE.md is the owner's file, so it is created but never replaced.
  if ((await readIfExists(join(root, 'CLAUDE.md'))) === null) {
    plan.push({ target: join(root, 'CLAUDE.md'), rel: 'CLAUDE.md', content: await renderProjectClaudeMd() });
  } else unchanged.push('CLAUDE.md');
  for (const item of plan) {
    await mkdir(dirname(item.target), { recursive: true });
    await writeFileAtomic(item.target, item.content);
  }
  return { written: plan.map((p) => p.rel), unchanged };
}

export async function renderProjectClaudeMd(): Promise<string> {
  return withProseStandard(await readFile(PROJECT_CLAUDE_MD, 'utf8'));
}

/**
 * Makes `/learn-new` available in every Claude Code session for this user by
 * installing that one skill under `<home>/.claude/skills/`. Returns the path
 * written, or null if it was already current.
 */
export async function installGlobalNewSkill(home: string): Promise<string | null> {
  const content = (await renderTemplates()).get('skills/learn-new/SKILL.md');
  if (content === undefined) throw new Error('learn-new template is missing');
  const target = join(home, '.claude', 'skills', 'learn-new', 'SKILL.md');
  if ((await readIfExists(target)) === content) return null;
  await mkdir(dirname(target), { recursive: true });
  await writeFileAtomic(target, content);
  return target;
}
