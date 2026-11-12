---
name: learn-ask
description: Answer a learner's question about the project, a concept or a pending decision without changing the project. Use for any question, including "why?", "what is a token?", "show me an example" and follow-up questions, especially while a LearnBuild decision or task is pending.
argument-hint: "[question]"
disallowed-tools: Write, Edit, NotebookEdit
allowed-tools: Bash(learnbuild status), Bash(learnbuild threads), Bash(learnbuild ask *), Bash(learnbuild followup *), Bash(learnbuild thread switch *)
---

# Answer a question without changing the project

The learner has asked a question: $ARGUMENTS

A question does not make a decision or ask for anything to be built, including when it names one of the options or asks for example code.

1. Run `learnbuild status`. If it fails with `STATE_NOT_FOUND`, this directory has no LearnBuild project, so answer the question and skip steps 2 and 5.
2. Record the question so the conversation can be resumed later. Skip this step if the project context for this message says it has already been recorded on a question thread.
   - New topic: `learnbuild ask --topic '<short topic>' --summary '<the question in one line>'`
   - Follow-up on the active thread (`activeThreadId` in the status output is set and the question continues that topic): `learnbuild followup --summary '<the question in one line>'`
   - Return to an earlier topic: find it with `learnbuild threads`, run `learnbuild thread switch --id <thread-id>`, then record the follow-up.

   Wrap learner text in single quotes and drop any apostrophes from it.
3. Answer in terms of this project. Where the answer depends on existing code, read the files and cite `path:line`. Say so when a point is your inference and the code does not state it.
4. Put code examples in the reply only. Do not create or edit files, and do not run `learnbuild decision resolve`, `learnbuild task start`, `learnbuild task verify` or `learnbuild checkpoint satisfy`.
5. If the status output showed a pending decision, finish by telling the learner it is still open and naming the options. They can keep asking questions, or reply with the name of the option they want.

If the learner's message sounds like a choice but is not exactly an option name, such as "let's go with the simple one", do not record it. Tell them which option name to reply with.
