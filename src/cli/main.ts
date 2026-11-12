#!/usr/bin/env node
import { text } from 'node:stream/consumers';
import type { HookOutcome } from '../explain/guard.js';
import { preToolDecision, promptContext } from '../hooks/hooks.js';
import { runCli } from './commands.js';
import { COMMAND_GUIDE, THINGS_TO_SAY } from './guide.js';
import { runNew } from './new.js';
import { colourWanted, makeStyle } from './style.js';

const args = process.argv.slice(2);

if (args[0] === 'hook' && args[1] === 'prompt') {
  // Context only, with no enforcement, so a failure here must not block the learner's message.
  try {
    const context = await promptContext(await text(process.stdin));
    if (context !== '') process.stdout.write(`${context}\n`);
  } catch {
    // Stay silent.
  }
} else if (args[0] === 'hook') {
  // Claude Code treats exit 2 as "block this tool call" and shows stderr to the
  // agent. Every failure path here must block, never fall through to allow.
  let outcome: HookOutcome;
  try {
    outcome =
      args[1] === 'pre-tool' || args[1] === 'explain-guard'
        ? await preToolDecision(await text(process.stdin))
        : { allowed: false, reason: `Unknown hook "${args[1] ?? ''}".` };
  } catch (error) {
    outcome = { allowed: false, reason: `Hook failed: ${(error as Error).message}` };
  }
  if (outcome === 'pass') {
    // No opinion: stay silent so normal permission handling applies.
  } else if (outcome.allowed) {
    // Approving here means a validated inspector command needs no permission prompt.
    process.stdout.write(
      `${JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', permissionDecisionReason: 'Read-only LearnBuild inspector command' } })}\n`,
    );
  } else {
    process.stderr.write(`${outcome.reason}\n`);
    process.exitCode = 2;
  }
} else if (args[0] === 'new') {
  process.exitCode = await runNew(args.slice(1), {
    cwd: process.cwd(),
    out: (line) => process.stdout.write(`${line}\n`),
    now: () => new Date().toISOString(),
    interactive: process.stdin.isTTY === true && process.stdout.isTTY === true,
    colour: colourWanted(process.stdout),
  });
} else if (args.length === 0 || args[0] === 'help') {
  const style = makeStyle(colourWanted(process.stdout));
  const row = (left: string, right: string) => `  ${style.cyan(left.padEnd(32))}${right}`;
  process.stdout.write(
    [
      '',
      `  ${style.bold(style.cyan('🌱 LearnBuild'))}`,
      `  ${style.dim('Build your own software project and learn the engineering along the way.')}`,
      '',
      style.bold('  In your terminal'),
      row('learnbuild new', 'Start a new project. Asks for a name, then opens Claude Code.'),
      row('learnbuild help', 'Show this page.'),
      row('claude', 'Run inside a project folder to carry on where you left off.'),
      '',
      style.bold('  Inside Claude Code, you can just say'),
      ...THINGS_TO_SAY.map((entry) => row(entry.command, entry.what)),
      '',
      style.bold('  Commands inside Claude Code'),
      ...COMMAND_GUIDE.map((entry) => row(entry.command, entry.what)),
      '',
      style.dim('  Technical reference for every subcommand: learnbuild --help'),
      '',
    ].join('\n'),
  );
} else {
  const result = await runCli(args, { cwd: process.cwd(), now: () => new Date().toISOString() });
  process.stdout.write(`${JSON.stringify(result.output, null, 2)}\n`);
  process.exitCode = result.exitCode;
}
