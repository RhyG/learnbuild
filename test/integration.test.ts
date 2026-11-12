import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runCli } from '../src/cli/commands.js';
import { LearnBuildError } from '../src/domain/errors.js';
import { checkExplainCommand, explainGuardDecision } from '../src/explain/guard.js';
import { PRE_TOOL_HOOK_COMMAND, PROMPT_HOOK_COMMAND, installClaudeFiles, renderProjectClaudeMd, renderTemplates } from '../src/install/install.js';
import { loadProseStandard } from '../src/prose/standard.js';
import { applyPlan, createProject } from '../src/domain/workflow.js';
import { STARTER_COMPETENCIES } from '../src/learning/catalogue.js';
import { parsePlan } from '../src/state/plan.js';
import { COMMAND_GUIDE, THINGS_TO_SAY } from '../src/cli/guide.js';
import { AT, tempDir } from './helpers.js';

const CLI = fileURLToPath(new URL('../src/cli/main.js', import.meta.url));

function runHook(args: string[], stdin: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    child.on('error', reject);
    child.on('exit', (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(stdin);
  });
}

describe('explain guard', () => {
  const allowed = [
    'learnbuild explain overview',
    'learnbuild explain list --path src --depth 2',
    "learnbuild explain list --path 'src/my dir'",
    'learnbuild explain read --path src/auth/login.ts --start 1 --end 80',
    "learnbuild explain search --query 'what; rm -rf / && $(whoami) | `id` > x' --path src",
    'learnbuild explain search --query "session cookie"',
    'learnbuild explain symbol --name login',
    '  learnbuild   explain   overview  ',
  ];
  for (const command of allowed) {
    test(`allows: ${command}`, () => assert.deepEqual(checkExplainCommand(command), { allowed: true }));
  }

  const denied = [
    'rm -rf .',
    'cat .env',
    'ls',
    'learnbuild init --project x',
    'learnbuild decision resolve --id a --select b --confirm-ref c',
    'learnbuild install',
    'learnbuild explain',
    'learnbuild explain delete --path x',
    'learnbuild explain overview --root /',
    'learnbuild explain read --path x --root=/etc',
    'learnbuild explain read --path',
    'learnbuild explain read --path --start',
    'learnbuild explain overview; rm -rf .',
    'learnbuild explain overview && touch x',
    'learnbuild explain overview | tee out.txt',
    'learnbuild explain overview > out.txt',
    'learnbuild explain search --query $(whoami)',
    'learnbuild explain search --query `whoami`',
    'learnbuild explain search --query "$(whoami)"',
    'learnbuild explain search --query "`whoami`"',
    'learnbuild explain search --query "a\\"; touch x; \\""',
    "learnbuild explain search --query 'a' 'b'",
    "learnbuild explain search --query 'unterminated",
    'learnbuild explain overview\ntouch x',
    "learnbuild explain search --query 'a\ntouch x'",
    'learnbuild explain overview & touch x',
    'learnbuild explain read --path ~/.ssh/id_rsa',
    'learnbuild explain read --path src/*.ts',
    'learnbuild explain read --path {a,b}',
    'FOO=1 learnbuild explain overview',
    'env learnbuild explain overview',
    './learnbuild explain overview',
    '/tmp/learnbuild explain overview',
    'learnbuild explain overview #',
    'learnbuild explain read --path <(cat .env)',
    '',
  ];
  for (const command of denied) {
    test(`denies: ${JSON.stringify(command)}`, () => assert.equal(checkExplainCommand(command).allowed, false));
  }

  const payload = (tool: string, input: unknown, agent: string | null = 'learn-explainer') =>
    JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: tool, tool_input: input, ...(agent === null ? {} : { agent_type: agent }) });

  test('for the explain agent, only a Bash call with an allowed command is approved', () => {
    assert.deepEqual(explainGuardDecision(payload('Bash', { command: 'learnbuild explain overview' })), { allowed: true });
    assert.equal((explainGuardDecision(payload('Bash', { command: 'touch x' })) as { allowed: boolean }).allowed, false);
    assert.equal((explainGuardDecision(payload('Bash', {})) as { allowed: boolean }).allowed, false);
    for (const tool of ['Write', 'Edit', 'NotebookEdit', 'Read', 'Agent', 'WebFetch']) {
      const outcome = explainGuardDecision(payload(tool, { file_path: 'x', command: 'learnbuild explain overview' }));
      assert.equal((outcome as { allowed: boolean }).allowed, false, tool);
    }
  });

  test('calls from the main session and other agents pass through without an opinion', () => {
    assert.equal(explainGuardDecision(payload('Bash', { command: 'npm test' }, null)), 'pass');
    assert.equal(explainGuardDecision(payload('Write', { file_path: 'x' }, 'general-purpose')), 'pass');
  });

  test('unparseable hook input is denied', () => {
    for (const input of ['not json', 'null', '']) assert.equal((explainGuardDecision(input) as { allowed: boolean }).allowed, false, input);
  });

  test('the hook process approves, blocks with exit 2, or stays silent', async () => {
    const allow = await runHook(['hook', 'explain-guard'], payload('Bash', { command: 'learnbuild explain overview' }));
    assert.equal(allow.code, 0);
    assert.equal(allow.stderr, '');
    assert.deepEqual(JSON.parse(allow.stdout).hookSpecificOutput.permissionDecision, 'allow');

    const block = await runHook(['hook', 'explain-guard'], payload('Bash', { command: 'learnbuild explain overview; touch x' }));
    assert.equal(block.code, 2);
    assert.equal(block.stdout, '', 'a blocked call must not print an allow decision');
    assert.match(block.stderr, /only runs "learnbuild explain" commands/);
    assert.equal((await runHook(['hook', 'explain-guard'], payload('Write', {}))).code, 2);

    const pass = await runHook(['hook', 'explain-guard'], payload('Bash', { command: 'rm -rf build' }, null));
    assert.deepEqual(pass, { code: 0, stdout: '', stderr: '' });

    assert.equal((await runHook(['hook', 'explain-guard'], '')).code, 2);
    assert.equal((await runHook(['hook', 'other'], '{}')).code, 2);
    assert.equal((await runHook(['hook'], '{}')).code, 2);
  });
});

describe('install', () => {
  const EXPECTED = [
    '.claude/agents/learn-explainer.md',
    '.claude/settings.json',
    '.claude/skills/learn-ask/SKILL.md',
    '.claude/skills/learn-build/SKILL.md',
    '.claude/skills/learn-decide/SKILL.md',
    '.claude/skills/learn-explain/SKILL.md',
    '.claude/skills/learn-help/SKILL.md',
    '.claude/skills/learn-new/SKILL.md',
    '.claude/skills/learn-plan/SKILL.md',
    '.claude/skills/learn-progress/SKILL.md',
    '.claude/skills/learn-resume/SKILL.md',
    'CLAUDE.md',
  ];
  const SKILLS = ['learn-ask', 'learn-build', 'learn-decide', 'learn-explain', 'learn-help', 'learn-new', 'learn-plan', 'learn-progress', 'learn-resume'];

  test('installs skills and agents into a learner project', async () => {
    const root = await tempDir();
    const result = await installClaudeFiles(root);
    assert.deepEqual(result.written.sort(), EXPECTED);
    assert.deepEqual((await readdir(join(root, '.claude', 'skills'))).sort(), SKILLS);
    const again = await installClaudeFiles(root);
    assert.deepEqual(again.written, []);
    assert.deepEqual(again.unchanged.sort(), EXPECTED);
  });

  test('install sets the hooks in settings.json, keeps other settings and replaces stale LearnBuild hooks', async () => {
    const root = await tempDir();
    await mkdir(join(root, '.claude'), { recursive: true });
    const mine = { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo mine' }] };
    const stale = { matcher: '*', hooks: [{ type: 'command', command: 'learnbuild hook explain-guard || exit 2' }] };
    const existing = { permissions: { deny: ['Read(./.env)'] }, hooks: { PreToolUse: [mine, stale], Stop: [] } };
    await writeFile(join(root, '.claude', 'settings.json'), JSON.stringify(existing));
    await installClaudeFiles(root);
    const settings = JSON.parse(await readFile(join(root, '.claude', 'settings.json'), 'utf8'));
    assert.deepEqual(settings.permissions, existing.permissions);
    assert.deepEqual(settings.hooks.Stop, []);
    assert.deepEqual(settings.hooks.PreToolUse, [mine, { matcher: '*', hooks: [{ type: 'command', command: PRE_TOOL_HOOK_COMMAND }] }]);
    assert.deepEqual(settings.hooks.UserPromptSubmit, [{ hooks: [{ type: 'command', command: PROMPT_HOOK_COMMAND }] }]);
    const again = await installClaudeFiles(root);
    assert.ok(again.unchanged.includes('.claude/settings.json'), 'a second install changes nothing');
  });

  test('install creates CLAUDE.md but never replaces an existing one', async () => {
    const root = await tempDir();
    await writeFile(join(root, 'CLAUDE.md'), 'my project notes');
    const result = await installClaudeFiles(root, { force: true });
    assert.ok(result.unchanged.includes('CLAUDE.md'));
    assert.equal(await readFile(join(root, 'CLAUDE.md'), 'utf8'), 'my project notes');
  });

  test('install stops before writing anything when settings.json is not valid JSON', async () => {
    const root = await tempDir();
    await mkdir(join(root, '.claude'), { recursive: true });
    await writeFile(join(root, '.claude', 'settings.json'), '{ broken');
    await assert.rejects(installClaudeFiles(root), (e: unknown) => e instanceof LearnBuildError && e.code === 'INSTALL_CONFLICT');
    assert.deepEqual(await readdir(join(root, '.claude')), ['settings.json']);
    assert.deepEqual(await readdir(root), ['.claude']);
    assert.equal(await readFile(join(root, '.claude', 'settings.json'), 'utf8'), '{ broken');
  });

  test('the guard hook command blocks when learnbuild is missing and converts crashes to exit 2', async () => {
    const run = (path: string) =>
      new Promise<number | null>((resolve) => {
        const child = spawn('/bin/sh', ['-c', PRE_TOOL_HOOK_COMMAND], { env: { PATH: path }, stdio: ['pipe', 'ignore', 'ignore'] });
        child.on('exit', resolve);
        child.stdin.end('{}');
      });
    assert.equal(await run('/nonexistent'), 2);
    const bin = await tempDir();
    await writeFile(join(bin, 'learnbuild'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    assert.equal(await run(`${bin}:/usr/bin:/bin`), 2);
    await writeFile(join(bin, 'learnbuild'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    assert.equal(await run(`${bin}:/usr/bin:/bin`), 0);
  });

  test('a locally edited file is not overwritten without --force, and nothing else is written', async () => {
    const root = await tempDir();
    const target = join(root, '.claude', 'skills', 'learn-ask', 'SKILL.md');
    await mkdir(join(root, '.claude', 'skills', 'learn-ask'), { recursive: true });
    await writeFile(target, 'my own skill');
    await assert.rejects(installClaudeFiles(root), (e: unknown) => e instanceof LearnBuildError && e.code === 'INSTALL_CONFLICT');
    assert.equal(await readFile(target, 'utf8'), 'my own skill');
    assert.deepEqual(await readdir(join(root, '.claude', 'skills')), ['learn-ask']);
    await installClaudeFiles(root, { force: true });
    assert.notEqual(await readFile(target, 'utf8'), 'my own skill');
  });

  test('install refuses the framework source tree', async () => {
    const root = await tempDir();
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'learnbuild' }));
    await assert.rejects(installClaudeFiles(root), (e: unknown) => e instanceof LearnBuildError && e.code === 'UNSAFE_ROOT');
  });
});

describe('T20 every installed instruction file embeds the full prose standard', () => {
  test('each rendered skill and agent starts with frontmatter and contains the standard verbatim, once', async () => {
    const standard = loadProseStandard().trimEnd();
    const rendered = await renderTemplates();
    assert.equal(rendered.size, 10);
    for (const [path, content] of rendered) {
      assert.ok(content.startsWith('---\nname: '), `${path} must start with frontmatter`);
      assert.equal(content.split(standard).length - 1, 1, `${path} must contain the standard exactly once`);
    }
    assert.equal((await renderProjectClaudeMd()).split(standard).length - 1, 1, 'project CLAUDE.md');
  });

  test('templates on disk do not carry their own copy of the rules', async () => {
    const dir = fileURLToPath(new URL('../../templates/', import.meta.url));
    const files = (await readdir(dir, { recursive: true })).filter((f) => f.endsWith('.md'));
    assert.equal(files.length, 11);
    for (const file of files) {
      const text = await readFile(join(dir, file), 'utf8');
      assert.ok(!text.includes('Avoid definitional pivots'), file);
    }
  });
});

describe('skill templates match the real CLI', () => {
  test('every learnbuild command named in a template exists', async () => {
    const root = await tempDir();
    const commands = new Set<string>();
    for (const content of (await renderTemplates()).values()) {
      for (const match of content.matchAll(/learnbuild ((?:[a-z]+)(?: (?:add|request|resolve|satisfy|defer|select|start|verify|switch|overview|list|read|search|symbol|mode|evidence|apply))?)/g)) {
        commands.add(match[1]!);
      }
    }
    assert.ok(commands.size >= 12, [...commands].join(', '));
    for (const command of commands) {
      if (command === 'new' || command === 'open' || command === 'explain') continue;
      const result = await runCli([...command.split(' '), '--root', root], { cwd: root, now: () => AT });
      const error = result.output['error'] as { code: string; message: string } | undefined;
      assert.ok(!error?.message.startsWith('Unknown command'), `template names unknown command "${command}"`);
    }
  });

  test('every inspector example in the explain skill passes the guard', async () => {
    const skill = (await renderTemplates()).get('skills/learn-explain/SKILL.md')!;
    const examples = [...skill.matchAll(/^- `(learnbuild explain [^`]+)`/gm)].map((m) => m[1]!);
    assert.equal(examples.length, 5);
    for (const example of examples) assert.deepEqual(checkExplainCommand(example), { allowed: true }, example);
  });

  test('the explainer agent has Bash as its only tool', async () => {
    const agent = (await renderTemplates()).get('agents/learn-explainer.md')!;
    assert.match(agent, /^name: learn-explainer$/m);
    assert.match(agent, /^tools: Bash$/m);
  });

  test('each mutation is pre-approved in exactly one skill, and read-only skills drop the edit tools', async () => {
    const rendered = await renderTemplates();
    const frontmatter = (path: string) => {
      const content = rendered.get(path)!;
      return content.slice(0, content.indexOf('\n---', 4));
    };
    for (const [path] of rendered) {
      assert.equal(/allowed-tools:.*decision resolve/.test(frontmatter(path)), path === 'skills/learn-decide/SKILL.md', path);
      assert.equal(/allowed-tools:.*task start/.test(frontmatter(path)), path === 'skills/learn-build/SKILL.md', path);
    }
    for (const name of ['learn-ask', 'learn-resume', 'learn-progress', 'learn-decide', 'learn-help']) {
      assert.match(frontmatter(`skills/${name}/SKILL.md`), /^disallowed-tools: Write, Edit, NotebookEdit$/m, name);
    }
  });

  test('the help skill, the terminal help and the README list the same commands', async () => {
    const help = (await renderTemplates()).get('skills/learn-help/SKILL.md')!;
    const readme = await readFile(fileURLToPath(new URL('../../README.md', import.meta.url)), 'utf8');
    for (const entry of [...COMMAND_GUIDE, ...THINGS_TO_SAY]) {
      assert.ok(help.includes(entry.what), `help skill: ${entry.command}`);
    }
    for (const entry of COMMAND_GUIDE) {
      assert.ok(help.includes(`\`${entry.command}\``), `help skill names ${entry.command}`);
      assert.ok(readme.includes(`\`${entry.command}\``), `README names ${entry.command}`);
    }
    for (const name of (await readdir(fileURLToPath(new URL('../../templates/claude/skills/', import.meta.url)))).sort()) {
      assert.ok(COMMAND_GUIDE.some((entry) => entry.command.split(' ')[0] === `/${name}`), `guide covers /${name}`);
    }
  });

  test('skills tell the learner to say next, not to type a command to continue', async () => {
    for (const [path, content] of await renderTemplates()) {
      const body = content.slice(content.indexOf('\n---', 4));
      assert.doesNotMatch(body, /(next step is|run|type) `\/learn-(plan|build)`/i, path);
    }
  });

  test('the plan skill lists exactly the competency ids in the catalogue', async () => {
    const skill = (await renderTemplates()).get('skills/learn-plan/SKILL.md')!;
    const line = skill.split('\n').find((l) => l.includes('using only these ids'))!;
    const listed = [...line.slice(line.indexOf('ids:')).matchAll(/`([a-z-]+)`/g)].map((m) => m[1]!);
    assert.deepEqual(listed.sort(), STARTER_COMPETENCIES.map((c) => c.id).sort());
  });

  test('the example plan in the plan skill is accepted by plan apply', async () => {
    const skill = (await renderTemplates()).get('skills/learn-plan/SKILL.md')!;
    const json = /```json\n([\s\S]*?)```/.exec(skill)![1]!;
    const plan = parsePlan(JSON.parse(json));
    const { state } = applyPlan(createProject({ projectId: 'example' }), plan, AT);
    assert.deepEqual(Object.keys(state.tasks), ['setup', 'create-game']);
    assert.equal(state.checkpoints['storage-gate']?.blocking, true);
  });
});
