// Decides whether a shell command is one of the read-only inspector commands.
// Used by the PreToolUse hook that confines the explain subagent's Bash tool.

const FLAGS_BY_SUBCOMMAND: Readonly<Record<string, readonly string[]>> = {
  overview: [],
  list: ['--path', '--depth'],
  read: ['--path', '--start', '--end'],
  search: ['--query', '--path'],
  symbol: ['--name', '--path'],
};

const UNQUOTED_SAFE = /[A-Za-z0-9_\-./:=,@+%]/;
const DOUBLE_QUOTE_UNSAFE = new Set(['$', '`', '\\', '!']);

export type GuardDecision = { allowed: true } | { allowed: false; reason: string };

function deny(reason: string): GuardDecision {
  return { allowed: false, reason };
}

/**
 * Splits a command into words, accepting only plain characters and simple
 * quoting. Anything the shell could expand, chain or redirect is rejected,
 * so the words returned are exactly what the program would receive.
 */
function tokenise(command: string): string[] | string {
  const tokens: string[] = [];
  let current: string | null = null;
  let i = 0;
  while (i < command.length) {
    const ch = command[i]!;
    if (ch === ' ' || ch === '\t') {
      if (current !== null) tokens.push(current);
      current = null;
      i += 1;
    } else if (ch === "'" || ch === '"') {
      const close = command.indexOf(ch, i + 1);
      if (close === -1) return 'unterminated quote';
      const body = command.slice(i + 1, close);
      if (body.includes('\n') || body.includes('\r')) return 'line break inside quotes';
      if (ch === '"') {
        for (const c of body) if (DOUBLE_QUOTE_UNSAFE.has(c)) return `"${c}" inside double quotes`;
      }
      current = (current ?? '') + body;
      i = close + 1;
    } else if (UNQUOTED_SAFE.test(ch)) {
      current = (current ?? '') + ch;
      i += 1;
    } else {
      return `character ${JSON.stringify(ch)} outside quotes`;
    }
  }
  if (current !== null) tokens.push(current);
  return tokens;
}

export function checkExplainCommand(command: string): GuardDecision {
  const tokens = tokenise(command);
  if (typeof tokens === 'string') return deny(`Explain mode only runs "learnbuild explain" commands (${tokens}).`);
  const [program, group, subcommand, ...rest] = tokens;
  if (program !== 'learnbuild' || group !== 'explain') {
    return deny('Explain mode only runs "learnbuild explain" commands.');
  }
  if (subcommand === undefined || !Object.hasOwn(FLAGS_BY_SUBCOMMAND, subcommand)) {
    return deny(`Unknown explain subcommand. Use one of: ${Object.keys(FLAGS_BY_SUBCOMMAND).join(', ')}.`);
  }
  const flags = FLAGS_BY_SUBCOMMAND[subcommand]!;
  if (rest.length % 2 !== 0) return deny('Each option needs exactly one value.');
  for (let i = 0; i < rest.length; i += 2) {
    const flag = rest[i]!;
    const value = rest[i + 1]!;
    // --root is refused so inspection stays inside the session's project directory.
    if (!flags.includes(flag)) return deny(`Option ${flag} is not available for "explain ${subcommand}".`);
    if (value.startsWith('-')) return deny(`The value for ${flag} must not start with "-".`);
  }
  return { allowed: true };
}

export const EXPLAIN_AGENT = 'learn-explainer';

/** `pass` means the call is not from the explain agent and the hook has no opinion. */
export type HookOutcome = GuardDecision | 'pass';

/**
 * Evaluates a Claude Code PreToolUse hook payload. The hook is registered for
 * the whole session, so calls from other agents pass through untouched. For
 * the explain agent, anything other than a Bash call carrying an allowed
 * inspector command is denied. A payload that cannot be parsed is denied.
 */
export function explainGuardDecision(hookInput: string): HookOutcome {
  let payload: unknown;
  try {
    payload = JSON.parse(hookInput);
  } catch {
    return deny('Hook input was not valid JSON.');
  }
  if (typeof payload !== 'object' || payload === null) return deny('Hook input was not an object.');
  const { agent_type: agentType, tool_name: toolName, tool_input: toolInput } = payload as Record<string, unknown>;
  if (agentType !== EXPLAIN_AGENT) return 'pass';
  if (toolName !== 'Bash') return deny(`Explain mode is read-only; the ${String(toolName)} tool is not available.`);
  const command = typeof toolInput === 'object' && toolInput !== null ? (toolInput as Record<string, unknown>)['command'] : undefined;
  if (typeof command !== 'string') return deny('Bash call had no command.');
  return checkExplainCommand(command);
}
