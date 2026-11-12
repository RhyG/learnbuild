---
name: learn-help
description: Show the LearnBuild commands, what each one does and what the learner can do next. Use when the learner runs /learn-help or asks what commands exist, what they can do, or how this works.
disallowed-tools: Write, Edit, NotebookEdit
allowed-tools: Bash(learnbuild next)
---

# Show what the learner can do

Run `learnbuild next` to find out where the project stands. If it fails with `STATE_NOT_FOUND`, there is no project in this folder; say so and still show the lists below.

Reply with these three parts.

**Things you can just say**

| Say | What happens |
|---|---|
| `next` | Moves on to the next step. "start", "continue" and "ok" work too. |
| the name of an option | Makes a choice when you are asked to pick, for example "sqlite". |
| any question | Gets an answer. Asking never changes your files or moves the project on. |

**Commands**

| Command | What it does |
|---|---|
| `/learn-new` | Describe your idea. Writes a short brief of what you are building. |
| `/learn-plan` | Turns the brief into a short list of building steps. |
| `/learn-build` | Builds the next step with you, then checks that it works. |
| `/learn-decide <option>` | Records your choice when the project needs a decision. |
| `/learn-ask <question>` | Asks a question. The same as typing the question on its own. |
| `/learn-resume` | Goes back to a waiting decision after you have asked questions. |
| `/learn-progress` | Shows what is built and what you have shown you understand. |
| `/learn-explain <file or topic>` | Explains existing code without changing it. |
| `/learn-help` | Shows this list and what to do next. |

**Where you are**

If the output has a `display` value, show it as it is in a code block. Then say in one sentence what the next step is and what to type to take it: an option name if a decision is waiting, otherwise `next`.

Keep the tables exactly as written. Do not add other commands.
