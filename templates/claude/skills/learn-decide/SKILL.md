---
name: learn-decide
description: Record the learner's explicit choice for the pending LearnBuild decision. Use when the learner runs /learn-decide, or when the project context says their message is one of the option names.
argument-hint: "<option>"
disallowed-tools: Write, Edit, NotebookEdit
allowed-tools: Bash(learnbuild status), Bash(learnbuild decision resolve *)
---

# Record an explicit decision

The learner's choice: $ARGUMENTS

If nothing appears after "choice:", use the option name given in the project context for this message. Record the choice exactly as given; do not interpret it. The project allows a decision to be recorded only on a turn where the learner's own message was the option name, so never record one for any other reason.

1. Run `learnbuild status`. Note `workflow.revision` and `workflow.pendingDecision`.
2. If there is no pending decision, say so and stop.
3. Compare the learner's choice with the decision's `options`. It must equal one option id exactly. If it does not, show the question and the options again and stop. Do not pick the closest match.
4. Run:

   `learnbuild decision resolve --id <decision id> --select <option> --confirm-ref '<ref>' --expected-revision <revision from step 1>`

   Use the confirm ref given in the LearnBuild note for this message.

5. If the command fails with `REVISION_CONFLICT`, the project changed since step 1. Run `learnbuild status` again, show the learner the current state and ask them to reply with the option name once more.
6. On success, tell the learner what was recorded. Recording a decision does not start any work, so do not edit files or start a task. End by telling them to say **next** to start building it.
