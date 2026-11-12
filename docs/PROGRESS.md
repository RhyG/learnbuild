# Progress log

## 2026-11-12 — M0, M1 and core of M2

### Working and tested
- Build and test harness: `npm run check`, `npm run build` and `npm test` (91 tests passing).
- Workflow domain (`src/domain/workflow.ts`): add task, decision and checkpoint; request and resolve a decision; satisfy and defer checkpoints; select, start and verify a task. All transitions are pure and raise typed `LearnBuildError` codes.
- Durable state (`src/state/`): schema validation with referential checks, a migration hook, atomic replacement, a cross-process lock, revision conflict detection and an append-only event log.
- Learning threads (`src/threads/threads.ts`): open, follow up, switch, nest and resume. Resume closes threads, returns the current decision and reports a conflict if the workflow changed while the thread was open.
- Router (`src/router/router.ts`): slash-command parsing and a conservative fallback that never routes free text to a mutating operation.
- Learner record (`src/learning/`): a 25-item competency catalogue with prerequisites, evidence recording, derived proficiency and the three learning modes.
- CLI (`src/cli/`): JSON output for every transition. Exit code 1 means a domain error and 2 means a usage error.

### Acceptance coverage
| Scenario | Status | Tests |
|---|---|---|
| T01–T06 | Covered at domain, repository and CLI level | `test/conversation.test.ts`, `test/cli.test.ts` |
| T07 | Covered: state read from a separate Node process | `test/durability.test.ts` |
| T08 | Covered: five concurrent processes; stale lock recovery | `test/durability.test.ts` |
| T09, T10 | Covered | `test/workflow.test.ts` |
| T11–T13 | Covered for the domain model | `test/learning.test.ts` |
| T14–T18 | Not started (M3 explain inspector) | — |
| T19 | Covered: file exists, `CLAUDE.md` references it, no other repository file copies the rules | `test/prose.test.ts` |
| T20 | Partial: tested at `withProseStandard()` only; no agents assemble prompts yet | `test/prose.test.ts` |
| T21 | Not started; needs representative generated output | — |

### Not implemented
- `src/explain/` (M3) and every `.claude/skills/learn-*` skill (M4). No skill files were created, so no `/learn-*` command is available inside Claude Code yet.
- Authored artefacts such as `PROJECT.md` and `REQUIREMENTS.md` under `.learn-build/`.
- No real Claude Code session has exercised any of this. Natural-language routing is untested with real messages.

### Next tasks
1. M3 read-only inspector: bounded root, traversal and symlink rejection, secret and vendor exclusion, size and count limits, `path:line` snippets (T14–T18).
2. M4 skills `/learn-ask`, `/learn-resume` and `/learn-progress` as thin wrappers over the CLI, then test them in a real Claude Code session against a fixture project.
3. Configure Claude Code tool permissions for `/learn-explain` (`allowed-tools` or a restricted subagent) and record what is actually enforced.
4. Wire `withProseStandard()` into whatever assembles skill or subagent instructions, and extend the T20 tests to every role.
5. Clean up stray temp files on startup, and decide whether the stale-lock reclaim race needs a stronger protocol.

## 2026-11-12 — M3 inspector, first skills, lock hardening

### Working and tested (177 tests passing)
- Read-only inspector (`src/explain/inspector.ts`) with `overview`, `list`, `read`, `search` and `symbol`, exposed as `learnbuild explain …`. It works in any directory and creates no `.learn-build/`.
- Explain guard (`src/explain/guard.ts`) and `learnbuild hook explain-guard`.
- `learnbuild install`, which renders the templates in `templates/claude/` with the full prose standard and merges the guard hook into project settings.
- Skills `/learn-ask`, `/learn-resume`, `/learn-decide`, `/learn-progress` and `/learn-explain`, plus the `learn-explainer` agent.
- Stale-lock reclaim now happens under a second marker file, and stray temp files are removed by the next writer.
- Fixed: a mutating command in a directory with no project crashed with a raw `ENOENT`; it now reports `STATE_NOT_FOUND`.

### Live Claude Code checks (headless `claude -p`, version 2.1.322, scratch fixture project)
| Run | Result |
|---|---|
| `/learn-ask what is a token?` | Thread recorded, `state.json` hash unchanged, no permission prompts |
| `/learn-resume` | Presented the pending decision and both options; state unchanged |
| `/learn-decide whichever is easier` | Nothing recorded; options shown again |
| `/learn-decide sessions` | Resolved with `--expected-revision 4`; status `ready` at revision 5 |
| `/learn-progress` | Project and learning reported separately |
| `/learn-explain src/games.ts` | Read through the inspector with `path:line` citations; tree unchanged |
| `/learn-explain` told to run `cat .env`, a redirect and a chained `touch` | All three blocked by the hook; tree unchanged; secret absent from the transcript |

These were single runs, most on the Haiku model. They show the wiring works; they are not a reliability measurement.

### Acceptance coverage changes
- T14–T18: covered by `test/explain.test.ts`, except `--changed` (see D15).
- T20: covered at the install boundary for every skill and agent (`test/integration.test.ts`).
- T21: still not started.
- Smoke-test steps 5–7 and 9: exercised by the live runs above with slash commands. Step 5 asks for questions with no slash command, which is untested.

### Still missing
- `/learn-new`, `/learn-plan` and `/learn-build`, and the authored artefacts they would write.
- Changed-code explanation (`--changed`).
- An interactive (non-headless) session, and unprefixed free-text questions.
- Recording learner evidence from a skill; the CLI command exists but no skill calls it.

### Next tasks
1. `/learn-new` and `/learn-plan`: write the project brief and requirements, then create tasks, decisions and checkpoints through the CLI.
2. `/learn-build`: start the current task only through `learnbuild task start`, and require `task verify` with real test output before reporting completion.
3. Test unprefixed questions in an interactive session while a decision is pending; if `/learn-ask` does not trigger reliably, add project `CLAUDE.md` guidance or a `UserPromptSubmit` hook.
4. Hardened read-only Git diff for `/learn-explain --changed`, tested against a repository with hostile Git config.
5. T21: collect representative skill outputs and review them against the prose standard.

## 2026-11-12 — Zero-setup start, full command set, hook enforcement

### Working and tested (209 tests passing)
- `learnbuild new`, the global `/learn-new` skill and a project `CLAUDE.md`.
- `/learn-new`, `/learn-plan` and `/learn-build`, completing the command set.
- `learnbuild plan apply` and `learnbuild next`; project commands work from any subfolder.
- Hooks: edit gate, shell-write heuristic, per-message state with automatic thread recording, and the explain guard (D22–D24, D18).

### Live journey (headless Claude Code 2.1.322, Sonnet, one multi-turn session plus a fresh one)
A simulated first-time programmer, typing as one would:

| Step | Result |
|---|---|
| `learnbuild new --name "Football Finder"` | Folder, state, skills, hooks and `CLAUDE.md` created |
| `/learn-new`, then four casual replies | Brief and requirements written; one question per turn; no technology questions |
| `/learn-plan` | Architecture, roadmap and a four-task plan with one decision, applied in one revision |
| "what's the difference between typescript and javascript? show me a tiny example" | Answered with code in chat; no files changed |
| "just go ahead and build the whole thing" | Declined; pointed to `/learn-build` |
| `/learn-build` | Task 1 started, built, both criteria checked with saved output, committed, verified; `npm test` passes when re-run by hand |
| `/learn-build` again | Presented the storage decision with both options explained; built nothing |
| Three unprefixed messages, including "write the sqlite one in src/games.ts" and "let's just go with the simple one" | `state.json` byte-identical; no source changes; all three recorded on one thread by the hook; choice not recorded |
| New session, `/learn-resume` | Same decision presented, still pending |
| `/learn-decide json-file`, `/learn-progress` | Recorded at the expected revision; progress and learning reported separately |
| `/learn-new <idea>` in a folder with no project | Named the project, created the folder, saved the idea, gave the two commands to reopen |

Three problems found by this run were fixed: notes written through shell heredocs (D23), an unprefixed question that left no thread (D24), and a permission prompt on the second turn of `/learn-new` (D27).

### Not yet exercised
- A real interactive terminal session, including `learnbuild new` launching Claude Code and the permission prompts a learner will see for commands such as `npm install`.
- An understanding check (`await_evidence`) and evidence recording from `/learn-build`; the plan in the live run had no understanding gate.
- Tasks two to four of the live project, and a model other than Sonnet or Haiku for the full journey.
- `hands_on` and `accelerated` modes in a skill.

### Next tasks
1. Run the journey by hand in an interactive session and note every point where a newcomer would be confused or prompted unexpectedly.
2. Exercise an understanding gate end to end and adjust the `/learn-build` wording from what happens.
3. Publish the package, or provide an install script, so setup is one command.
4. Hardened read-only Git diff for `/learn-explain --changed`.
5. T21: review a sample of real skill output against the prose standard.

## 2026-11-12 — Git as an explicit, explained choice

- `learnbuild new` and `/learn-new` ask about Git before anything else and explain it on request (D28). 214 tests passing.
- Checked through a pseudo-terminal: name, `?`, explanation with the link, `y`, repository created with no remote.
- Checked in a live session (Sonnet): the question, "what's that? do I need it", "should I put it on GitHub", then yes. Git was explained with the project as the example, GitHub was described as a separate later step and not recommended, and `learnbuild git --init` ran only after the yes. No remote and no commit were created.

## 2026-11-12 — First commit explained before it is made

- D29 added; 216 tests passing.
- Live (Sonnet, a two-step project with a new repository): the first commit attempt was paused, the reply explained all six points and asked to go ahead, and "yeah go ahead" was followed by the commit and verification in one round. The second commit was made without notice beforehand and reported afterwards.
- The reworded summary notes for the second and third commits have not been re-run live.

## 2026-11-12 — First three commits each pause, with shorter explanations

- D29 updated; 218 tests passing.
- Live (Sonnet, a four-step project with a new repository): commits one to three were each paused and explained in 139, 47 and 44 words, each committed after a one-word reply, and the fourth was committed without a pause and reported in the summary. Four commits, no remote.

## 2026-11-12 — Natural replies, presentation, help, README

Changes from hands-on feedback (D30–D33). 235 tests passing.

Live checks (Sonnet, headless, only natural replies after `/learn-new`):
- Discovery, then "next" ran planning, which showed the checklist, a table of choices with reasons and alternatives, and the decision to come. "why not python?" was answered without changing anything.
- "next" built step 1; the first-commit pause appeared and "ok" let it through.
- The plan included an understanding gate on step 2. "yep", "sure" and "next" did not get past it. A real answer was assessed, evidence was recorded at level 1 for `state-management`, the gate cleared, and "next" started the step. This is the first live run of that path.
- In a project with a decision on its first step: "next" presented the options as a table; "let's go with the simple one" recorded nothing and named the option to type; a request to write code into a file showed it in chat only; "text-file" recorded the choice; "next" built and verified the step.
- `/learn-help` printed both tables.
- `learnbuild new` through a pseudo-terminal: banner, name, Git question, editor question, next steps.

Not exercised: the editor actually opening, colour as rendered in a real terminal, and all of the above in an interactive session.

## 2026-11-12 — Prose audit of templates, automatic move into the project folder

- Every skill template, the explain agent and the project `CLAUDE.md` were read against the prose standard and about twenty slips fixed, mostly illustrative lists of three, clipped fragments and one stock metaphor. This was a manual read by the same author, so a second reader may find more.
- `learnbuild new` and the new `learnbuild open <folder>` leave the terminal inside the project folder (D34). Checked through a pseudo-terminal: after creation, `pwd` in the resulting shell printed the project folder.
- Owner decisions recorded in D35.
- 238 tests passing.

### Open items
1. Run the whole journey in an interactive terminal session: `learnbuild new` launching Claude Code, the editor opening, colour, the shell left in the project folder, and the permission prompts a learner sees.
2. Add a `LICENSE` file; `package.json` says MIT and the repository has none. Do this before making the repository public.
3. Publish the package. Until then `./setup.sh` installs it (D39).
4. Hardened read-only Git diff for `/learn-explain --changed`.
5. T21: review real skill output against the prose standard.
6. Try the `hands_on` and `accelerated` modes in a session.
7. Projects created before 2026-11-12 need `learnbuild install --force` to get the current skills and hooks.
8. The personal copy of `learn-new` in `~/.claude/skills` overrides a project's copy and is rewritten only by `learnbuild new`. `learnbuild install --force` and `learnbuild open` leave an old one in place.
9. In a headless run, a natural "next" that leads to planning could not run `learnbuild plan apply` because the command was not pre-approved. Check whether an interactive session shows a permission prompt there.

## 2026-11-12 — Reviewing the brief before planning

- `/learn-new` now ends the brief stage by offering `review` or `next` (D36). The skill has a walk-through for the review, and the per-message hook points to it while there is a brief and no plan.
- The project `CLAUDE.md` allows a stage to end with two ways to continue where a skill offers them.
- 240 tests passing, two of them new: the hook note for this stage, and the offer's wording in the skill.

Live check (Sonnet, headless, user-level settings excluded, scratch project):
- After the brief was written the reply ended with both words. "review" started the walk-through at the first section of `PROJECT.md`.
- "yeah thats right" moved to the next section. "what does done when mean?" was answered and the review returned to the same section.
- "actually can the kids lists be first on the page" changed `PROJECT.md` and R1 in `REQUIREMENTS.md`, and no other file was created. The state revision stayed at 0 throughout.
- In a fresh session, "can we go over the requirements before planning" got all five requirements in one table with two suggestions, not the part-by-part walk-through. "next" then ran planning.

Not exercised: a full walk-through to the last requirement, the review after a plan exists, and an interactive session.

## 2026-11-12 — Tests introduced in their own step

- `/learn-plan` and `/learn-build` changed as described in D37. The example plan in the plan skill has a third task, `add-tests`.
- 241 tests passing. One is new and checks the wording of both skills and the shape of the example plan.

Live check (Sonnet, headless, scratch project with an existing brief):
- `/learn-plan` produced five steps: setup, two features, "Add automated tests for the people list and adding chores", then a last feature whose criteria include a test run. The setup and feature criteria before the testing step were `curl` checks.
- `/learn-build` built the setup step with no test files and no testing tool, and verified it with `curl`.

Not exercised: the testing step itself, and the steps on either side of it.

## 2026-11-12 — Mainstream tools, each with a reason

- `/learn-plan` and `/learn-build` changed as described in D38.
- 242 tests passing. One is new and checks the wording of both skills.

Live check (Sonnet, headless, scratch project with an existing brief): `/learn-plan` chose TypeScript, Node.js with npm, Vite, Vitest and jsdom, with plain HTML and CSS for the page. The table had a row for each with a reason and the alternatives, and marked the two testing tools as added in step 4. The storage decision offered `browser-storage` or `json-file`.

Not exercised: a build step that needs a tool the plan did not list.

## 2026-11-12 — One setup script

- `./setup.sh` replaces `npm install`, `npm run build` and `npm link` for a new user (D39). The README install section now gives that one command.
- 244 tests passing. Two are new: the script stops on an old Node.js before installing anything, and the README no longer mentions `npm link`.

Checked by hand on macOS with a fresh clone and a scratch npm prefix, so the owner's linked `learnbuild` was not replaced:
- A full run installed, built and linked, and `learnbuild help` ran from the scratch prefix.
- With the scratch prefix off `PATH`, the script printed the `export PATH` line; with the owner's copy earlier on `PATH`, it named that copy.
- With no Claude Code on `PATH` it printed the setup link. With Node.js 18 and with no Node.js it stopped with exit code 1 and a message.

Not exercised: Linux, a failing download or build, and an `npm link` permission error.
