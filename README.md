# LearnBuild

Build the software you want to build, and learn the engineering you need along the way.

LearnBuild is a guide that sits inside [Claude Code](https://code.claude.com/docs/en/setup), an AI coding assistant that runs in your terminal. You describe an idea in your own words. LearnBuild turns it into a short plan, builds it with you one small step at a time, checks that each step works, and explains what it is doing as it goes.

You do not need to have written any code before.

## Who it is for

- You have an idea for an app or a tool and have never programmed.
- You already program and want to learn an unfamiliar codebase or a new kind of project.

## What makes it different

LearnBuild has two goals for every project: software that works, and you understanding how it was built.

- **You can ask anything, at any time.** Asking a question never changes your files or moves the project on.
- **You make the choices that matter.** When there is a real fork in the road, such as where your data should be stored, LearnBuild explains the options using your project and waits for you to pick.
- **Each step is checked before it counts.** A step is marked done only after its checks have been run and the results saved. LearnBuild does not say something works unless it ran it.
- **Explanations use your project.** New words are explained when they first come up, with your own code as the example.
- **You can stop and come back.** Your progress is saved in the project folder, so you can close Claude Code and carry on another day.
- **Your code stays on your computer.** Nothing is uploaded unless you decide to do that yourself.

## What you need

| You need | Why | Where to get it |
|---|---|---|
| A terminal | It is where you type commands. On a Mac it is the Terminal app; on Windows, use Windows Terminal. | Already on your computer |
| Node.js, version 22 or newer | LearnBuild runs on it, and so will most projects you build. | https://nodejs.org |
| Claude Code | The AI assistant LearnBuild works inside. It is a paid product; its setup page explains the options. | https://code.claude.com/docs/en/setup |

Two things are optional and worth having:

- **A code editor**, so you can see your files as they are written. [VS Code](https://code.visualstudio.com) is free.
- **Git**, for saving snapshots of your work. LearnBuild asks whether you want it and explains what it is. You can get it from https://git-scm.com/downloads.

To check Node.js is installed, type `node --version` in your terminal. You should see a number starting with 22 or higher.

## Install LearnBuild

LearnBuild is not in the npm package registry yet, so for now you install it from this folder. In your terminal, go to the LearnBuild folder and run:

```sh
npm install
npm run build
npm link
```

The last command makes `learnbuild` available everywhere on your computer. To check it worked, type `learnbuild help`.

## Start your first project

In your terminal, go to the folder where you want to keep your projects and type:

```sh
learnbuild new
```

LearnBuild then:

1. Asks what you want to call your project.
2. Asks whether you want a Git repository. Type `?` to have it explained before you answer.
3. Creates a folder for the project.
4. Offers to open that folder in your code editor, if you have one.
5. Opens Claude Code in the folder and starts asking about your idea.

When you close Claude Code, your terminal is left inside the project folder, so you can type `claude` to carry on. Type `exit` to go back to the folder you started in.

From there you are in a conversation. It goes through three stages:

| Stage | What happens | What you do |
|---|---|---|
| 🌱 Your idea | A few plain questions about what you want to build and who it is for. No technical questions. | Answer in your own words |
| 🧭 The plan | A short list of building steps, the tools chosen for you with the reason for each, and any choices left to you. | Ask about anything, then say `next` |
| 🔨 Building | One step at a time: LearnBuild writes the code, shows you the important parts, runs the checks and tells you how to try it yourself. | Say `next` for each step |

### Things you can say

You do not need to remember commands. These work at any point:

| Say | What happens |
|---|---|
| `next` | Moves on to the next step. "start" and "ok" work too. |
| the name of an option | Makes a choice when you are asked to pick, for example "sqlite". |
| any question | Gets an answer. Asking never changes your files or moves the project on. |

A choice only counts when you reply with the option's exact name. If you say "the simple one", LearnBuild asks you to confirm by name, so that a passing remark is never taken as a decision.

### Commands

Each stage also has a command, if you prefer to be explicit. Type `/learn-help` inside Claude Code to see this list at any time.

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

### What it looks like

```
You:        next

LearnBuild: 🤔 Your decision

            Where should games be saved?

            | Option    | What it means here              | Trade-off                    |
            | json-file | One readable text file          | Simple; awkward if it grows  |
            | sqlite    | A small database in one file    | More to learn; scales better |

            Ask me anything first, or reply with the name of the one you want.

You:        what's a database?

LearnBuild: A database is a program that stores information in an organised way...
            The decision is still open: json-file or sqlite.

You:        json-file

LearnBuild: Recorded: games will be saved in a JSON file. Say next to start building it.
```

## Coming back to a project

Open your terminal, go to the folder where you keep your projects and run:

```sh
learnbuild open my-project
```

This moves into the project folder and starts Claude Code there. If you are already in the project folder, typing `claude` does the same.

Then say `next`, or type `/learn-progress` to see where you are. LearnBuild reads the saved progress, so it does not matter that the earlier conversation is gone.

## Starting from inside Claude Code

If you are already in a Claude Code session, type `/learn-new` followed by your idea:

```
/learn-new I want an app to track my running
```

LearnBuild creates the project folder, then asks you to type `/exit` and run `learnbuild open` with the folder's name. A running Claude Code session cannot move itself into a new folder, so this one step is needed. Starting this way works in any folder once you have run `learnbuild new` one time on your computer.

## Understanding code that already exists

You can also use LearnBuild to learn how an existing project works. In that project's folder, run this once:

```sh
learnbuild install
```

Then start `claude` and type `/learn-explain` followed by a file name or a topic. It explains what the code does and points to the exact file and line for each claim. In this mode it can only read files.

## Git, commits and where your code goes

Git is a tool that saves snapshots of your project, called commits, so you can see what changed and go back if something breaks. LearnBuild asks whether you want it when you create a project, and you can say no and add it later.

If you say yes:

- LearnBuild saves a commit after each step that passes its checks.
- For the first three commits it stops beforehand, tells you what it is about to do and why, shows the commands, and waits for your go-ahead. The explanations get shorter each time.
- It never uploads your code or connects it to GitHub or any other service. If you want to share or back up your code later, ask and it will explain how.

The free [Pro Git book](https://git-scm.com/book/en/v2/Getting-Started-About-Version-Control) explains Git from the beginning.

## How LearnBuild keeps you in control

The tool itself enforces each of these.

- **Files change only during a step you started.** Outside a step, the tools that edit files are blocked.
- **A step starts only when you say so.** Your message has to be a go-ahead such as `next`, or the `/learn-build` command.
- **A decision is recorded only when you name the option.** The AI cannot pick for you.
- **A step is complete only with evidence.** Every check needs a saved result from a real run.
- **Explain mode is read-only.** It runs in a restricted helper that can only read.

`docs/DECISIONS.md` describes how each one works, what was tested and where the limits are.

## What is in your project folder

| Folder or file | What it is |
|---|---|
| `.learn-build/` | Your progress, plan and decisions. `PROJECT.md`, `REQUIREMENTS.md`, `ARCHITECTURE.md` and `ROADMAP.md` in here are written for you to read. |
| `.claude/` | The LearnBuild commands and safeguards for Claude Code. |
| `CLAUDE.md` | Instructions Claude Code reads so it knows this is a learning project. |
| Everything else | Your project's own code. |

Leave the `.learn-build/` and `.claude/` folders in place. Deleting them removes your progress and the safeguards.

## If something goes wrong

| What you see | What to do |
|---|---|
| `learnbuild: command not found` | Run the three install commands again from the LearnBuild folder. |
| `claude: command not found` | Claude Code is not installed. Follow https://code.claude.com/docs/en/setup. |
| "LearnBuild guard hook cannot run" inside Claude Code | Claude Code cannot find `learnbuild`. Close it, check `learnbuild help` works in your terminal, then start `claude` again. |
| Claude Code asks permission to run a command | Claude Code asks before it runs commands. Read what it wants to run and approve it if it matches what you asked for. Building a step needs commands such as `npm install`. |
| You are not sure where you are | Type `/learn-progress`, or `/learn-help` for the list of what you can do. |
| LearnBuild asks you a question before a step and will not continue | It is checking you have understood an idea the next step depends on. Answer in your own words; a wrong answer is fine and gets you another explanation. |
| "A folder called ... already exists" | Choose a different project name, or run the command from another folder. |

## Limits worth knowing

- LearnBuild is at an early version. It has been tested with automated tests and with scripted Claude Code sessions, and less so by people using it day to day.
- The check that stops shell commands from changing files outside a step works by recognising common patterns. It catches accidental writes, and a command written to hide a write could get past it.
- `/learn-explain` cannot yet explain what changed between two versions of your code.
- Understanding checks, where LearnBuild asks you to predict or explain something before continuing, cannot be skipped and have had little real use.

## For people working on LearnBuild itself

```sh
npm run check   # type-check
npm test        # build, then run the test suite
```

- `src/` holds the TypeScript source. Pure rules are in `src/domain/`, saved state in `src/state/`, the Claude Code hooks in `src/hooks/` and the read-only inspector in `src/explain/`.
- `templates/` holds the skills, the explain agent and the project `CLAUDE.md` that `learnbuild new` installs.
- `learnbuild --help` lists every subcommand. All of them except `new` and `help` print JSON.
- `docs/DECISIONS.md` records each design decision with what was tested. `docs/PROGRESS.md` is the running log. The other files in `docs/` are the original specification.
- `standards/PROSE_STYLE.md` is the writing standard for all text, including what the AI says to learners.
