---
name: learn-plan
description: Turn the LearnBuild project brief into an architecture and a short list of verifiable building tasks. Use when the learner runs /learn-plan or asks to plan the project.
allowed-tools: Bash(learnbuild status), Bash(learnbuild next), Bash(learnbuild plan apply *), Write, Edit
---

# Plan the first working version

The learner may be new to programming. Explain each technical word once, in a sentence, when it first appears.

1. Run `learnbuild status`, then read `.learn-build/PROJECT.md` and `.learn-build/REQUIREMENTS.md`.
   - If there is no project or the brief has not been written, follow the learn-new skill instead.
   - If `learnbuild next` shows tasks already exist, show the learner the current plan and ask what they want to add or change. Add new tasks with a new plan file; existing tasks cannot be edited here.

2. Choose the simplest design that meets the requirements. Prefer TypeScript on Node.js, few dependencies, data stored on the learner's own computer, and nothing that needs a paid account or cloud service. Write `.learn-build/ARCHITECTURE.md` in plain language: the parts of the system, what each one is responsible for, how they talk to each other, and why you chose each. Say which choices are yours and which are left for the learner to decide.

3. Pick the decisions that belong to the learner. Include one only when the options lead to different software and the learner can weigh the trade-off once it is explained, such as how people will sign in or where data is kept. The first plan should have at most two. Give each decision two or more options with short lowercase ids.

4. Break the first version into small tasks, usually between three and six.
   - The first task sets up the project so that it can be run and tested.
   - Each later task adds one thing a user can do, working from end to end.
   - Every task needs acceptance criteria that can be checked by running a command or a test, with no judgement calls.
   - Tag each task with the competencies it gives a chance to teach, using only these ids: `problem-framing`, `requirements-vs-implementation`, `mvp-prioritisation`, `acceptance-criteria`, `git-workflow`, `debugging-methodology`, `client-server-boundary`, `http-request-lifecycle`, `api-contracts`, `validation-and-trust-boundaries`, `authentication-vs-authorisation`, `state-management`, `relational-data-modelling`, `database-queries-and-transactions`, `error-handling`, `automated-testing`, `test-pyramid-tradeoffs`, `secrets-and-environments`, `deployment-lifecycle`, `logs-and-observability`, `architecture-tradeoffs`, `dependency-management`, `source-control-review`, `ai-generated-code-verification`, `maintenance-and-technical-debt`.
   - Add at most one `understanding_gate` checkpoint in the first plan, on a task where a wrong mental model would hurt later work.

5. Write the plan to `.learn-build/plans/plan-01.json` (use the next free number if that file exists) in this shape:

   ```json
   {
     "phaseId": "first-version",
     "tasks": [
       {
         "id": "setup",
         "title": "Set up the project so it runs and has one passing test",
         "acceptanceCriteria": [{ "id": "tests-run", "description": "npm test exits with code 0" }],
         "competencyIds": ["automated-testing"]
       },
       {
         "id": "create-game",
         "title": "Create a game and see it in the list",
         "dependencies": ["setup"],
         "acceptanceCriteria": [{ "id": "game-listed", "description": "A created game appears in the list response" }],
         "competencyIds": ["http-request-lifecycle"]
       }
     ],
     "decisions": [
       { "id": "storage", "question": "Where should games be saved?", "options": ["json-file", "sqlite"], "taskId": "create-game" }
     ],
     "checkpoints": [
       { "id": "storage-gate", "type": "decision_gate", "decisionId": "storage", "taskId": "create-game" }
     ]
   }
   ```

   Ids use lowercase letters, digits and dashes. A task can depend only on tasks listed before it. Every decision needs a `decision_gate` checkpoint on the task it blocks.

6. Run `learnbuild plan apply --file .learn-build/plans/plan-01.json`. If it reports an error, fix the file and run it again. Nothing is added unless the whole plan is valid.

7. Write `.learn-build/ROADMAP.md`: the tasks in order, in plain words, followed by rough ideas for later versions.

8. Present the plan to the learner in three short parts.
   - **The steps.** Show the `display` checklist from `learnbuild next` in a code block, then one line per step on what they will be able to do after it.
   - **What I chose for you, and why.** A table with one row per main choice you made, such as the language and where data is kept. Columns: the choice, why it suits this project in a few words, and what else was possible. Keep it to the choices that shape the project, usually between three and six. Do not send the learner to a file to find this out.
   - **What you will decide.** Each decision left to them, in one line.

   Then invite them to dig in: they can ask about any row or ask for a different choice. Mention once that the longer write-up is in `.learn-build/ARCHITECTURE.md`. End by telling them to say **next** to start the first step.

Write the notes and the plan file with the Write tool; shell commands that write files are blocked until a task is started. Do not create source files, install anything or start a task in this step.
