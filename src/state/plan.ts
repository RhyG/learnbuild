import { CHECKPOINT_TYPES } from '../domain/types.js';
import type { PlanInput } from '../domain/workflow.js';
import { Validator } from './validate.js';

/** Checks the shape of a plan file. Ids and cross-references are checked when the plan is applied. */
export function parsePlan(raw: unknown): PlanInput {
  const v = new Validator();
  if (!v.isObject('plan', raw)) v.throwIfInvalid('plan file');
  const plan = raw as Record<string, unknown>;
  v.optionalString('phaseId', plan['phaseId']);
  if (v.array('tasks', plan['tasks'])) {
    plan['tasks'].forEach((task, i) => {
      const path = `tasks[${i}]`;
      if (!v.isObject(path, task)) return;
      v.string(`${path}.id`, task['id']);
      v.string(`${path}.title`, task['title']);
      if (task['dependencies'] !== undefined) v.stringArray(`${path}.dependencies`, task['dependencies']);
      if (task['competencyIds'] !== undefined) v.stringArray(`${path}.competencyIds`, task['competencyIds']);
      if (v.array(`${path}.acceptanceCriteria`, task['acceptanceCriteria'])) {
        task['acceptanceCriteria'].forEach((criterion, j) => {
          const cpath = `${path}.acceptanceCriteria[${j}]`;
          if (!v.isObject(cpath, criterion)) return;
          v.string(`${cpath}.id`, criterion['id']);
          v.string(`${cpath}.description`, criterion['description']);
        });
      }
    });
  }
  if (plan['decisions'] !== undefined && v.array('decisions', plan['decisions'])) {
    plan['decisions'].forEach((decision, i) => {
      const path = `decisions[${i}]`;
      if (!v.isObject(path, decision)) return;
      v.string(`${path}.id`, decision['id']);
      v.string(`${path}.question`, decision['question']);
      v.stringArray(`${path}.options`, decision['options']);
      v.string(`${path}.taskId`, decision['taskId']);
    });
  }
  if (plan['checkpoints'] !== undefined && v.array('checkpoints', plan['checkpoints'])) {
    plan['checkpoints'].forEach((checkpoint, i) => {
      const path = `checkpoints[${i}]`;
      if (!v.isObject(path, checkpoint)) return;
      v.string(`${path}.id`, checkpoint['id']);
      v.oneOf(`${path}.type`, checkpoint['type'], CHECKPOINT_TYPES);
      if (checkpoint['blocking'] !== undefined) v.boolean(`${path}.blocking`, checkpoint['blocking']);
      v.optionalString(`${path}.decisionId`, checkpoint['decisionId']);
      v.string(`${path}.taskId`, checkpoint['taskId']);
    });
  }
  v.throwIfInvalid('plan file');
  return raw as PlanInput;
}
