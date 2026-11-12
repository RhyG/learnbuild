import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Compiled output lives in dist/src/prose/, three levels below the package root.
export const PROSE_STANDARD_PATH = fileURLToPath(new URL('../../../standards/PROSE_STYLE.md', import.meta.url));

/** Returns the canonical prose standard exactly as stored on disk. */
export function loadProseStandard(path: string = PROSE_STANDARD_PATH): string {
  return readFileSync(path, 'utf8');
}

/**
 * Builds a runtime agent's instruction text with the full prose standard
 * embedded, for agents that run without filesystem access to the standard.
 */
export function withProseStandard(roleInstructions: string, standard: string = loadProseStandard()): string {
  return `${roleInstructions.trimEnd()}\n\n<prose_standard>\n${standard.trimEnd()}\n</prose_standard>\n`;
}
