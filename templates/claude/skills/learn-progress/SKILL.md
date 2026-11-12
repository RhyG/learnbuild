---
name: learn-progress
description: Summarise LearnBuild project progress and the learner's recorded evidence of understanding. Use when the learner runs /learn-progress or asks how far along they are.
disallowed-tools: Write, Edit, NotebookEdit
allowed-tools: Bash(learnbuild progress)
---

# Report progress

1. Run `learnbuild progress`.
2. Show the `display` value from the output as it is, in a code block. Then report the two parts of the output separately.
   - **Project**: status, current task, tasks complete out of the total, and any pending decision with its options.
   - **Learning**: the teaching mode, and each competency with recorded evidence and its level (0 not assessed, 1 introduced, 2 practised, 3 demonstrated).
3. Finished tasks say nothing about understanding. Do not describe a competency as learnt because a related task is complete, and do not raise a level yourself. Levels come only from recorded evidence.
4. End with the one thing they can do next: reply with an option name if a decision is pending, otherwise say **next**.
