---
name: learn-resume
description: Return from questions to the pending LearnBuild decision or task. Use when the learner runs /learn-resume or asks to go back to where they were.
disallowed-tools: Write, Edit, NotebookEdit
allowed-tools: Bash(learnbuild resume), Bash(learnbuild status)
---

# Return to the pending work

1. Run `learnbuild resume`. It closes the open question threads and reports where the workflow stands. It changes nothing in the workflow.
2. Read `resumePoint` in the output.
   - If `pendingDecision` is set, show the learner its `question` and list its `options` exactly as written. The decision is still open.
   - If there is no pending decision, tell the learner the current `status` and `taskId`.
3. If `conflict` is not null, the project changed while the learner was asking questions. Tell them what changed, using the `changes` list, before anything else.
4. Do not choose an option for the learner and do not recommend one unless they ask. Tell them they choose by replying with the option's name, and that they can ask more questions first.

Do not start any task or edit any file in this step.
