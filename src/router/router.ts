export const INTENTS = [
  'question',
  'explain_code',
  'decision',
  'implementation_request',
  'resume',
  'progress',
  'unclear',
] as const;
export type Intent = (typeof INTENTS)[number];

export type Operation =
  | 'open_or_continue_thread'
  | 'resume'
  | 'read_progress'
  | 'read_only_explain'
  | 'resolve_decision'
  | 'start_task';

const MUTATING_INTENTS: ReadonlySet<Intent> = new Set(['decision', 'implementation_request']);

const SLASH_COMMANDS: Readonly<Record<string, Intent>> = {
  '/learn-resume': 'resume',
  '/learn-progress': 'progress',
  '/learn-ask': 'question',
  '/learn-explain': 'explain_code',
  '/learn-build': 'implementation_request',
  '/learn-decide': 'decision',
};

const OPERATIONS: Readonly<Record<Intent, readonly Operation[]>> = {
  question: ['open_or_continue_thread'],
  explain_code: ['read_only_explain', 'open_or_continue_thread'],
  unclear: ['open_or_continue_thread'],
  resume: ['resume'],
  progress: ['read_progress'],
  decision: ['resolve_decision'],
  implementation_request: ['start_task'],
};

/** Output of an optional external classifier, such as a model call. */
export interface Classification {
  intent: Intent;
  confidence: number;
}

export interface Route {
  intent: Intent;
  source: 'slash_command' | 'classifier' | 'fallback';
  permittedOperations: readonly Operation[];
  mutatesWorkflow: boolean;
  /** Set when a classifier proposed a side-effecting intent that needs explicit confirmation. */
  confirmationNeededFor?: Intent;
  argument?: string;
}

export const MIN_CLASSIFIER_CONFIDENCE = 0.8;

/**
 * Routes a learner message. Only an explicit slash command can reach a
 * workflow-mutating operation; free text, including text a classifier
 * labels as a decision, is treated as a question until confirmed.
 */
export function routeMessage(text: string, classification?: Classification): Route {
  const trimmed = text.trim();
  const match = /^(\/learn-[a-z]+)(?:\s+([\s\S]*))?$/.exec(trimmed);
  if (match) {
    const intent = SLASH_COMMANDS[match[1] ?? ''];
    if (intent) {
      const route: Route = {
        intent,
        source: 'slash_command',
        permittedOperations: OPERATIONS[intent],
        mutatesWorkflow: MUTATING_INTENTS.has(intent),
      };
      const argument = match[2]?.trim();
      if (argument) route.argument = argument;
      return route;
    }
  }

  if (classification) {
    const { intent, confidence } = classification;
    if (MUTATING_INTENTS.has(intent)) {
      return {
        intent: 'unclear',
        source: 'classifier',
        permittedOperations: OPERATIONS.unclear,
        mutatesWorkflow: false,
        confirmationNeededFor: intent,
      };
    }
    if (confidence >= MIN_CLASSIFIER_CONFIDENCE) {
      return { intent, source: 'classifier', permittedOperations: OPERATIONS[intent], mutatesWorkflow: false };
    }
  }

  return {
    intent: 'question',
    source: 'fallback',
    permittedOperations: OPERATIONS.question,
    mutatesWorkflow: false,
  };
}
