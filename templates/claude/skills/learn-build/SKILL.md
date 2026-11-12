---
name: learn-build
description: Start or continue the next LearnBuild step, teaching as it goes and verifying the result. Use when the learner runs /learn-build or gives a go-ahead such as "next" or "start" and the project has a plan.
allowed-tools: Bash(learnbuild next), Bash(learnbuild status), Bash(learnbuild progress), Bash(learnbuild decision request *), Bash(learnbuild task start *), Bash(learnbuild task verify *), Bash(learnbuild checkpoint satisfy *), Bash(learnbuild checkpoint defer *), Bash(learnbuild learner evidence *), Write, Edit
---

# Build the next step

The learner asked to move on, by running `/learn-build` or by saying something like "next". That is their instruction to start or continue one step. The project allows a step to start only on a turn where the learner's message was a go-ahead, so never start one for any other reason.

Run `learnbuild next` and act on `next.action`. When the output has a `display` value, show it to the learner as it is, in a code block, so they can see where they are.

## `plan`
There are no tasks yet. Follow the learn-plan skill now (or learn-new if there is no brief).

## `request_decision`
The next task needs a choice from the learner. Run `learnbuild decision request --id <decisionId>`, then handle it as `await_decision`.

## `await_decision`
Show the decision's question and its options exactly as written. Lay the options out as a small table with the option name, what it means in this project, and what it makes easier or harder. Do not pick one unless the learner asks for your recommendation. Tell them they can ask anything first, and that they choose by replying with the option's name. Then stop without building anything.

## `await_evidence`
The next task has an understanding check.
- If you have not yet asked the check in this conversation, ask one question that has the learner predict what the code will do or explain a part of the design in their own words. Do not hint at the answer. Ask them to reply in their own words, then stop.
- If the learner has answered it in this conversation, assess the answer honestly. After an answer that does not yet show understanding, they continue by answering again; after one that does, they say "next".
  - If it shows understanding, record it and satisfy the checkpoint:
    `learnbuild learner evidence --id '<short-unique-id>' --competency <competency id> --type <explained or predicted> --level <1 or 2> --source-ref 'learn-build-${CLAUDE_SESSION_ID}' --assessor agent --confidence <medium or high>`
    then `learnbuild checkpoint satisfy --id <checkpoint id> --evidence-ref '<the evidence id>'`, then run `learnbuild next` again and continue.
  - If it does not, explain the idea a different way using this project's code, ask a fresh question and stop. Saying "I understand" is not an answer.
- The check cannot be skipped. If the learner says they do not know, or asks to move on, explain the idea again from a different angle and ask an easier question about the same idea.

## `start_task`
1. Tell the learner what this task adds and why it comes now, in a few sentences. Name the one or two ideas they will meet.
2. Run `learnbuild task start --id <task id> --confirm-ref '<ref>'`, using the confirm ref given in the LearnBuild note for this message.
3. Carry on as `continue_task`.

## `continue_task`
Work on this task only.
- Build in small steps. After each step, show the learner the important lines and say what they do and why they are there. Skip the routine parts.
- Before running something, say what you expect to happen, then compare with what did happen.
- If `learnbuild progress` shows the mode `hands_on`, leave one small, well-defined piece for the learner to write and guide them with hints.
- If the learner asks a question, answer it and continue only when they ask you to.
- Use the tools listed in `.learn-build/ARCHITECTURE.md`. If the step needs one that is not listed, choose it by the rules in step 2 of the learn-plan skill, tell the learner what it is and why you chose it before installing it, and add it to that file.
- Automated tests arrive in a step of their own (see "The testing step"). Until that step has started, do not write tests or install a testing tool, and check the work with commands. If the learner asks about tests before then, tell them which step covers it.
- In the steps after the testing step, write tests for what the step adds and show the learner one of them.

### The testing step

A task tagged `automated-testing` in a project that has no tests yet is the step that introduces them. Teach it as well as build it:

1. Start from what the learner has already seen. Point to a check that was run by hand in an earlier step, and explain that an automated test is a small program that repeats such a check whenever it is asked to.
2. Say which testing tool you are using and why, then write the first test for behaviour that already works. Show the whole test and name its parts: what it sets up, what it does, and the result it expects.
3. Say what you expect before running it, then run it and show the output.
4. Show what a failing test looks like. Change the code being tested so that it is wrong, run the test, and read the failure message with the learner. Put the code back and run the test again so that it passes.
5. Add tests for the rest of what has been built so far. Tell the learner what the tests cover and what they leave unchecked.
6. Give the learner the command that runs every test, and tell them that later steps add tests as they go.

Then verify. For every acceptance criterion of the task:
1. Run a real check: a command whose output shows the criterion is met, or a test once the project has tests.
2. Save the output: `mkdir -p .learn-build/evidence` and write it to `.learn-build/evidence/<task id>-<criterion id>.txt`.

### Committing

If every check passed and the project has a Git repository (a `.git` folder), save the work as a commit before recording the results. Once the task is recorded as verified, file changes are blocked until the next task starts. If there is no repository, skip this section and do not create one.

Run the `git add` and `git commit` commands straight away, without explaining first.

For each of the project's first three commits, the project pauses the command: it comes back blocked, with a list of what to tell the learner. That is expected, and the list gets shorter each time. Explain each point on it in your reply, ask if they are happy for you to go ahead, then stop and wait. When they reply, answer any question first. If they agree, run the same commands again, which now go through, and then record the result as described below. If they decline, skip the commit and record the result.

From the fourth commit on, the command runs without a pause. Give the commit line in your summary of the step.

Write a commit message that says what the step added, in plain words. After committing, show the line `git log --oneline -1` prints.

Do not include files that should stay private, such as `.env`. Never push or add a remote unless the learner asks, and do not bring up hosting services yourself.

If the learner has said they would rather make commits themselves, do not commit. Give them the commands to run, wait for them to say it is done, and note the preference on the `Version control:` line of `.learn-build/PROJECT.md` so later sessions follow it.

### Recording the result

Record the results in one command, with one `--result` per criterion:
`learnbuild task verify --id <task id> --result '<criterion id>=pass@.learn-build/evidence/<file>' --result '<criterion id>=fail@.learn-build/evidence/<file>'`

Mark a criterion `pass` only if you ran its check in this session and saw it succeed. If a check fails, fix the problem and run it again. If you cannot fix it, record `fail` and tell the learner what is wrong.

When the task is verified:
- Tell the learner what now exists and give the exact command to run or try it themselves.
- Say what was checked and anything that was not.
- Show the updated checklist from `learnbuild next`.
- Stop after this one step, and end by telling them to say **next** when they are ready for the following one.

## `done`
Every planned step is complete. Tell the learner what they have built, and that saying what they want to add next will start a new plan.

## `blocked`
Explain the reason from the output and suggest `/learn-progress`.
