# Installing LearnBuild: instructions for an AI agent

Follow this file when a person has asked you to install or set up LearnBuild for them. It is written for a coding agent such as Claude Code. A person installing by hand should read the "Install LearnBuild" section of `README.md`.

LearnBuild is a command-line tool and a set of Claude Code skills. It helps someone build a software project one checked step at a time and explains the engineering as it goes. The person you are helping may never have programmed, so use everyday words and say what each command does before you run it.

## Your job, and where it ends

Install the `learnbuild` command, create the person's first project folder, and tell them the two things to type next. Then stop.

- You are installing LearnBuild. You are not developing it, so do not change any file in this repository. The rest of `CLAUDE.md`, the files in `docs/` and `prompts/` are for people working on the framework and you do not need to read them.
- Do not start asking about the person's project idea. LearnBuild does that itself once Claude Code is opened inside the project folder.
- Run only the commands in this file, and commands that only read, such as version checks.

## Steps

### 1. Check Node.js

Run `node --version`. LearnBuild needs version 22 or newer.

If Node.js is missing or older, do not install it yourself. Tell the person what Node.js is (the program LearnBuild runs on) and give them numbered steps for their operating system: open https://nodejs.org, download the installer marked LTS, open it and click through. Ask them to tell you when it has finished, then check the version again. If the command is still not found, ask them to close Claude Code, open it again and repeat their request.

### 2. Get the LearnBuild folder

- If you are already inside a copy of this repository, use it.
- If `~/.learnbuild` exists, run `git -C ~/.learnbuild pull --ff-only` to update it.
- Otherwise run `git clone https://github.com/RhyG/learnbuild.git ~/.learnbuild`.

If the person named a different folder, use that in place of `~/.learnbuild`. If `git` is not installed, tell the person, give them https://git-scm.com/downloads and wait.

### 3. Run the setup script

Tell the person that the script downloads what LearnBuild depends on, builds it and adds the `learnbuild` command for their user account, and that it takes about a minute. Then run it from the LearnBuild folder:

```sh
./setup.sh
```

It can also be run by its full path from any folder.

Read what it prints and act on it:

| It prints | What to do |
|---|---|
| `LearnBuild is installed.` | Go to step 4. |
| `...your terminal cannot find the learnbuild command yet` | The script shows an `export PATH=...` line. Explain that the terminal keeps a list of folders it searches for commands, and that this line adds the folder holding `learnbuild`. Ask whether they want you to add it to their shell start-up file, and add it only if they say yes. For the rest of this session, run `learnbuild` by its full path in the folder the script named. |
| `...your terminal finds a different copy first` | An older copy is installed. Tell the person which copy the script named and ask whether to remove it. Do not remove it without their answer. |
| `Setup stopped: ...` | Tell the person the reason in plain words. Fix it only if the fix is inside the LearnBuild folder; otherwise give them the steps. |

### 4. Check that it works

Run `learnbuild help`. It should print a list of commands. If it fails, show the person the error and stop.

### 5. Create the first project

Ask the person two things, one at a time, unless they have already told you:

1. What would they like to call their project? A working name is fine.
2. Which folder should hold their projects? Suggest a `projects` folder in their home folder and create it if they agree.

Then run this from that folder, with any apostrophes removed from the name:

```sh
learnbuild new --name '<name>' --no-launch
```

It creates a folder for the project and prints its path. If the person only wanted LearnBuild installed, skip this step.

### 6. Hand over

Claude Code loads a project's LearnBuild commands only when it starts inside that project's folder, so you cannot carry on from this session. Tell the person:

- LearnBuild is installed and where their project folder is.
- To type `/exit` to leave this session.
- To then run `learnbuild open '<full path to the project folder>'`. Give the real path. This opens Claude Code in the project, and LearnBuild begins by asking about their idea.

If you skipped step 5, tell them to run `learnbuild new` from the folder where they keep their projects.

Stop here.

## Updating later

To update an existing install, do steps 2 and 3 again. The setup script is safe to run more than once.
