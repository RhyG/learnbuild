---
name: learn-plan
description: Turn the LearnBuild project brief into an architecture and a short list of verifiable building tasks. Use when the learner runs /learn-plan or asks to plan the project.
allowed-tools: Bash(learnbuild status), Bash(learnbuild next), Bash(learnbuild plan apply *), Write, Edit
---

# Plan the first working version

The learner may be new to programming. Explain each technical word once, in a sentence, when it first appears.

1. Run `learnbuild status`, then read `.learn-build/PROJECT.md` and `.learn-build/REQUIREMENTS.md`.
   - If there is no project or the brief has not been written, follow the learn-new skill instead.
   - If the brief describes an app for a phone or a tablet, follow Part 2 of the learn-mobile skill for the tool choices and the shape of the plan. The rest of this skill still applies.
   - If the brief describes something that needs a particular kind of computer, a large application, a device or a paid account, and has no "What this project needs" section, the learner has not been told. Tell them what is needed and what it costs, ask whether they want to go ahead, and add the section to `PROJECT.md` before planning.
   - If `learnbuild next` shows tasks already exist, show the learner the current plan and ask what they want to add or change. Add new tasks with a new plan file; existing tasks cannot be edited here.

2. Choose the simplest design that meets the requirements. Prefer data stored on the learner's own computer, and nothing that needs a paid account or cloud service.

   Choose the language from the brief:
   - If `PROJECT.md` records a language or tool the learner wants, use it. If it cannot do what the brief asks, tell the learner why and what you suggest in its place, and wait for their answer before planning.
   - For a web page or a web application, use TypeScript on Node.js.
   - For anything else, use the language most developers use for that kind of software, such as Python for a script that works with files or data, and Swift for an iPhone app.

   Choose every tool by the rules below. A tool here means the language, a framework, a library, a database, the testing tool or anything else the project installs.
   - Pick the tool most developers use for that job today. It should be widely adopted, used in production for years, actively maintained and well documented. A learner who gets stuck will search for help, and common tools have the most answers.
   - Use the current stable version, in the way its own documentation recommends now. Do not use an older style that the tool has moved away from.
   - Do not pick a tool that is niche, experimental, newly released or no longer maintained, even where it would fit this project slightly better.
   - When two tools are both common, pick the one with the longer record of use.
   - Add a tool only when the project needs it. Where something built into the language or Node.js is what most developers use for the job, use that.

   Work out what has to be installed on the learner's computer before the project can run: the language itself, and anything else that is installed once for the whole computer, such as a database server. Packages that are installed into the project folder do not count. For each one, note the command that prints its version, the lowest version the project needs, and the install page on the tool's official site. Applications that are installed and used through windows and menus belong on this list too. For one with no version command, note a command that shows it is installed, and how large the download is. Run `uname -sm` and leave out any tool that does not run on the learner's computer; if the project cannot be built without it, tell the learner and wait for their answer before planning.

   Work out how the learner will run what is built and use it themselves, on their own computer or device. Take this from the current official documentation of the tools you chose. Read those pages now if you can fetch web pages, because these steps change between versions; if you cannot, work from what you know and say in the notes that it was not checked against the documentation. Cover each of these:
   - What starts it: the exact command, or the button and the application it is in.
   - Where it appears: an address in the web browser, a window, the terminal, a simulator or their phone.
   - What that needs beyond what building needs, such as an app on the phone, the phone and computer on the same Wi-Fi, a cable, an account or a setting switched on. Add each one to "What needs to be installed", or tell the learner about it as the brief's "What this project needs" section would.
   - How to stop it, and how to see a change after the code is edited.
   - What cannot be tried in that setup, such as a camera in a simulator.
   - Which parts of the result a command can check and which only a person can, such as how a screen looks or whether a tap responds.

   Write `.learn-build/ARCHITECTURE.md` in plain language: the parts of the system, what each one is responsible for, how they talk to each other, and why you chose each. List every tool the project will use with the reason it was chosen. Add a "What needs to be installed" section holding the notes above, and a "How you will run and use it" section holding the answers to the list above. Say which choices are yours and which are left for the learner to decide.

3. Pick the decisions that belong to the learner. Include one only when the options lead to different software and the learner can weigh the trade-off once it is explained, such as how people will sign in or where data is kept. The first plan should have at most two. Give each decision two or more options with short lowercase ids. Where the options are tools, each one must meet the rules in step 2.

4. Break the first version into small tasks, usually between three and six.
   - The first task sets up the project so that it can be run. It adds no automated tests and no testing tools. Give it one acceptance criterion for each tool in "What needs to be installed", worded as the version command and the lowest version it must print, and tag it `development-toolchain`. Node.js is already on the computer because LearnBuild runs on it, so it needs a criterion only when the project needs a newer version.
   - Each later task adds one thing a user can do, working from end to end.
   - Give automated testing a task of its own, tagged `automated-testing`. Place it after the first one or two tasks that add something a user can do, so there is working behaviour to test and the learner has already seen it checked by hand. That task adds the testing tool and tests for what has been built so far. Tasks before it contain no tests, and tasks after it include tests for what they add.
   - Every task needs acceptance criteria that can be checked by running a command, with no judgement calls. Before the testing task, word each criterion around what a command can show, such as the output of running the program or the response to a request. From the testing task on, a criterion can be a passing test run.
   - Tag each task with the competencies it gives a chance to teach, using only these ids: `problem-framing`, `requirements-vs-implementation`, `mvp-prioritisation`, `acceptance-criteria`, `git-workflow`, `debugging-methodology`, `client-server-boundary`, `http-request-lifecycle`, `api-contracts`, `validation-and-trust-boundaries`, `authentication-vs-authorisation`, `state-management`, `relational-data-modelling`, `database-queries-and-transactions`, `error-handling`, `automated-testing`, `test-pyramid-tradeoffs`, `secrets-and-environments`, `deployment-lifecycle`, `logs-and-observability`, `architecture-tradeoffs`, `dependency-management`, `source-control-review`, `ai-generated-code-verification`, `maintenance-and-technical-debt`, `development-toolchain`, `command-line-programs`, `data-types-and-structures`, `files-and-data-formats`.
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

7. Write `.learn-build/ROADMAP.md`: the tasks in order, in plain words, followed by rough ideas for later versions. Under each task that adds or changes something a person sees or does, add a "Try it" line saying what the learner will do and what they should see, taken from the "Done when" lines of the requirements it covers.

8. Present the plan to the learner in these short parts.
   - **The steps.** Show the `display` checklist from `learnbuild next` in a code block, then one line per step on what they will be able to do after it.
   - **What I chose for you, and why.** A table with one row for every tool the project will use and for each design choice that shapes it, such as where data is kept. Columns: the choice, the reason for it in a few words, and what else was possible. The reason says why it suits this project and, for a tool, that it is the common choice for the job. Do not leave a tool out to keep the table short, and do not send the learner to a file to find this out.
   - **What you will install.** Only when "What needs to be installed" lists something: each tool in one line with what it is for, and for a large application roughly how big the download is. Repeat anything from "What this project needs" in the brief that costs money or needs an account. Tell them the first step checks for each one and walks them through installing any that are missing.
   - **How you will use it.** From "How you will run and use it": how they will start it, where it will appear and anything that needs, in two or three lines.
   - **How each step is checked.** Say what commands will check in this project, such as that it builds and that its tests pass, and what commands cannot see. Where part of the result can only be judged by a person, tell them that each step ends with them trying it and saying what happened, and that the step is not finished until they have.
   - **What you will decide.** Each decision left to them, in one line.

   Then invite them to dig in: they can ask about any row or ask for a different choice. Mention once that the longer write-up is in `.learn-build/ARCHITECTURE.md`. End by telling them to say **next** to start the first step.

Write the notes and the plan file with the Write tool; shell commands that write files are blocked until a task is started. Do not create source files, install anything or start a task in this step.
