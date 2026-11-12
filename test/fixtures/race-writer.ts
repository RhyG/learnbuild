// Child process used by durability tests. Reads the project, signals
// readiness, waits for the go file, then attempts one write.
import { access, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { LearnBuildError } from '../../src/domain/errors.js';
import { addTask } from '../../src/domain/workflow.js';
import { ProjectRepository } from '../../src/state/project.js';

const [root, readyFile, goFile, mode, taskId] = process.argv.slice(2) as [string, string, string, string, string];
const repo = new ProjectRepository(root, { timeoutMs: 20_000 });
const seen = await repo.workflow.read();
await writeFile(readyFile, String(seen.revision));

for (;;) {
  try {
    await access(goFile);
    break;
  } catch {
    await delay(5);
  }
}

try {
  const options = mode === 'expected' ? { expectedRevision: seen.revision } : {};
  const { doc } = await repo.updateWorkflow((s) => addTask(s, { id: taskId, title: taskId, at: new Date().toISOString() }), options);
  process.stdout.write(JSON.stringify({ ok: true, revision: doc.revision }));
} catch (error) {
  if (!(error instanceof LearnBuildError)) throw error;
  process.stdout.write(JSON.stringify({ ok: false, code: error.code }));
}
