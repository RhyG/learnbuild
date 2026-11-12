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

2. Choose the simplest design that meets the requirements. Prefer TypeScript on Node.js, data stored on the learner's own computer, and nothing that needs a paid account or cloud service.

   Choose every tool by the rules below. A tool here means the language, a framework, a library, a database, the testing tool or anything else the project installs.
   - Pick the tool most developers use for that job today. It should be widely adopted, used in production for years, actively maintained and well documented. A learner who gets stuck will search for help, and common tools have the most answers.
   - Use the current stable version, in the way its own documentation recommends now. Do not use an older style that the tool has moved away from.
   - Do not pick a tool that is niche, experimental, newly released or no longer maintained, even where it would fit this project slightly better.
   - When two tools are both common, pick the one with the longer record of use.
   - Add a tool only when the project needs it. Where something built into the language or Node.js is what most developers use for the job, use that.

   Write `.learn-build/ARCHITECTURE.md` in plain language: the parts of the system, what each one is responsible for, how they talk to each other, and why you chose each. List every tool the project will use with the reason it was chosen. Say which choices are yours and which are left for the learner to decide.

3. Pick the decisions that belong to the learner. Include one only when the options lead to different software and the learner can weigh the trade-off once it is explained, such as how people will sign in or where data is kept. The first plan should have at most two. Give each decision two or more options with short lowercase ids. Where the options are tools, each one must meet the rules in step 2.

4. Break the first version into small tasks, usually between three and six.
   - The first task sets up the project so that it can be run. It adds no automated tests and no testing tools.
   - Each later task adds one thing a user can do, working from end to end.
   - Give automated testing a task of its own, tagged `automated-testing`. Place it after the first one or two tasks that add something a user can do, so there is working behaviour to test and the learner has already seen it checked by hand. That task adds the testing tool and tests for what has been built so far. Tasks before it contain no tests, and tasks after it include tests for what they add.
   - Every task needs acceptance criteria that can be checked by running a command, with no judgement calls. Before the testing task, word each criterion around what a command can show, such as the output of running the program or the response to a request. From the testing task on, a criterion can be a passing test run.
   - Tag each task with the competencies it gives a chance to teach, using only these ids: `problem-framing`, `requirements-vs-implementation`, `mvp-prioritisation`, `acceptance-criteria`, `git-workflow`, `debugging-methodology`, `client-server-boundary`, `http-request-lifecycle`, `api-contracts`, `validation-and-trust-boundaries`, `authentication-vs-authorisation`, `state-management`, `relational-data-modelling`, `database-queries-and-transactions`, `error-handling`, `automated-testing`, `test-pyramid-tradeoffs`, `secrets-and-environments`, `deployment-lifecycle`, `logs-and-observability`, `architecture-tradeoffs`, `dependency-management`, `source-control-review`, `ai-generated-code-verification`, `maintenance-and-technical-debt`.
   - Add at most one `understanding_gate` checkpoint in the first plan, on a task where a wrong mental model would hurt later work.

5. Write the plan to `.learn-build/plans/plan-01.json` (use the next free number if that file exists) in this shape:

   ```json
   {
     "phaseId": "first-version",
     "tasks": [
       {
         "id": "setup",
         "title": "Set up the project so it runs",
         "acceptanceCriteria": [{ "id": "starts", "description": "npm start exits with code 0 and prints the project name" }],
         "competencyIds": ["dependency-management"]
       },
       {
         "id": "create-game",
         "title": "Create a game and see it in the list",
         "dependencies": ["setup"],
         "acceptanceCriteria": [{ "id": "game-listed", "description": "A created game appears in the list response" }],
         "competencyIds": ["http-request-lifecycle"]
       },
       {
         "id": "add-tests",
         "title": "Add automated tests for creating and listing games",
         "dependencies": ["create-game"],
         "acceptanceCriteria": [{ "id": "tests-pass", "description": "npm test exits with code 0 and runs a test that creates a game" }],
         "competencyIds": ["automated-testing"]
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
   - **What I chose for you, and why.** A table with one row for every tool the project will use and for each design choice that shapes it, such as where data is kept. Columns: the choice, the reason for it in a few words, and what else was possible. The reason says why it suits this project and, for a tool, that it is the common choice for the job. Do not leave a tool out to keep the table short, and do not send the learner to a file to find this out.
   - **What you will decide.** Each decision left to them, in one line.

   Then invite them to dig in: they can ask about any row or ask for a different choice. Mention once that the longer write-up is in `.learn-build/ARCHITECTURE.md`. End by telling them to say **next** to start the first step.

Write the notes and the plan file with the Write tool; shell commands that write files are blocked until a task is started. Do not create source files, install anything or start a task in this step.
