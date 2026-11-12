import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadProseStandard, PROSE_STANDARD_PATH, withProseStandard } from '../src/prose/standard.js';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

// Distinctive rule lines; if they show up elsewhere the standard has been copied.
const RULE_MARKERS = [
  'Avoid definitional pivots',
  'Avoid participial tails',
  'Avoid knowing closes',
  'Avoid short paired sentences of the same shape',
];

async function listFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git', '.learn-build'].includes(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(full)));
    else out.push(full);
  }
  return out;
}

describe('T19 canonical prose standard', () => {
  test('the standard exists at the canonical path and contains every rule', () => {
    const standard = loadProseStandard();
    assert.equal(PROSE_STANDARD_PATH, join(REPO_ROOT, 'standards', 'PROSE_STYLE.md'));
    for (const marker of RULE_MARKERS) assert.ok(standard.includes(marker), marker);
  });

  test('CLAUDE.md points to the standard', async () => {
    const claude = await readFile(join(REPO_ROOT, 'CLAUDE.md'), 'utf8');
    assert.ok(claude.includes('standards/PROSE_STYLE.md'));
  });

  test('no other repository file duplicates the rules', async () => {
    const offenders: string[] = [];
    for (const file of await listFiles(REPO_ROOT)) {
      if (file === PROSE_STANDARD_PATH || !/\.(md|ts|json|txt)$/.test(file)) continue;
      const text = await readFile(file, 'utf8');
      // Test sources name the markers on purpose.
      if (file.endsWith('prose.test.ts')) continue;
      if (RULE_MARKERS.filter((m) => text.includes(m)).length >= 2) offenders.push(file);
    }
    assert.deepEqual(offenders, []);
  });
});

describe('T20 prompt assembly boundary (partial: no runtime agents exist yet)', () => {
  test('assembled instructions embed the full standard text, not a path', () => {
    const standard = loadProseStandard();
    const assembled = withProseStandard('You are the teaching mentor.');
    assert.ok(assembled.startsWith('You are the teaching mentor.'));
    assert.ok(assembled.includes(standard.trimEnd()));
  });
});
