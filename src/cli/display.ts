import type { ProjectState } from '../domain/types.js';
import { nextAction } from '../domain/workflow.js';

/**
 * A progress bar and checklist of the plan, ready to show to the learner
 * as it is. Returns an empty string when there is no plan yet.
 */
export function checklist(state: ProjectState): string {
  const tasks = Object.values(state.tasks);
  if (tasks.length === 0) return '';
  const done = tasks.filter((t) => t.status === 'complete').length;
  const next = nextAction(state);
  const currentId =
    next.action === 'continue_task' || next.action === 'start_task'
      ? next.task.id
      : next.action === 'request_decision' || next.action === 'await_evidence'
        ? next.taskId
        : next.action === 'await_decision'
          ? (next.decision.taskId ?? null)
          : null;
  const bar = '▰'.repeat(done) + '▱'.repeat(tasks.length - done);
  const lines = tasks.map((task) => {
    if (task.status === 'complete') return `✅ ${task.title}`;
    if (task.id !== currentId) return `⬜ ${task.title}`;
    if (next.action === 'continue_task') return `🔨 ${task.title} (in progress)`;
    if (next.action === 'await_decision' || next.action === 'request_decision') return `🤔 ${task.title} (needs your decision)`;
    return `👉 ${task.title} (next)`;
  });
  return [`${bar}  ${done} of ${tasks.length} steps done`, ...lines].join('\n');
}
