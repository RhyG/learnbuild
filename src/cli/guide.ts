export interface GuideEntry {
  command: string;
  what: string;
}

/** The learner-facing commands, in the order someone meets them. */
export const COMMAND_GUIDE: readonly GuideEntry[] = [
  { command: '/learn-new', what: 'Describe your idea. Writes a short brief of what you are building.' },
  { command: '/learn-plan', what: 'Turns the brief into a short list of building steps.' },
  { command: '/learn-build', what: 'Builds the next step with you, then checks that it works.' },
  { command: '/learn-decide <option>', what: 'Records your choice when the project needs a decision.' },
  { command: '/learn-ask <question>', what: 'Asks a question. The same as typing the question on its own.' },
  { command: '/learn-resume', what: 'Goes back to a waiting decision after you have asked questions.' },
  { command: '/learn-progress', what: 'Shows what is built and what you have shown you understand.' },
  { command: '/learn-explain <file or topic>', what: 'Explains existing code without changing it.' },
  { command: '/learn-help', what: 'Shows this list and what to do next.' },
];

export const THINGS_TO_SAY: readonly GuideEntry[] = [
  { command: 'next', what: 'Moves on to the next step. "start" and "ok" work too.' },
  { command: 'the name of an option', what: 'Makes a choice when you are asked to pick, for example "sqlite".' },
  { command: 'any question', what: 'Gets an answer. Asking never changes your files or moves the project on.' },
];
