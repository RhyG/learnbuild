---
name: learn-new
description: Start a new LearnBuild project from an idea. Use when someone wants to begin building something new and learn as they go, or runs /learn-new.
argument-hint: "[project name or idea]"
allowed-tools: Bash(learnbuild status), Bash(learnbuild new *), Bash(learnbuild git *), Write, Edit
---

# Start a new project

What the learner typed after the command: $ARGUMENTS

The learner may never have programmed. Use everyday words and ask one question at a time, waiting for each answer.

Run `learnbuild status` first. What it returns decides which part below applies.

## A. No project here yet (`STATE_NOT_FOUND`)

1. Settle on a project name without an extra question where you can. If the learner gave a name, use it. If they described an idea but gave no name, make a short name from the idea, two or three words long. Only if they gave neither, ask "What would you like to call your project?" and wait.
2. Run `learnbuild new --name '<name>' --no-launch`. If you had to ask for the name, Claude Code may ask the learner to approve this command; tell them that approving it creates the folder. Drop any apostrophes from the name. This creates a new folder inside the current one and prints its path.
3. If the learner has already described their idea, add it under an "Idea so far" heading at the end of `<new folder>/.learn-build/PROJECT.md`, so they do not have to repeat it.
4. Tell the learner the project folder is ready, what you called it if you chose the name, and that Claude Code needs to be opened inside it. Mention that they can also open that folder in a code editor such as VS Code to watch the files as they are written. Give them these two steps exactly, with the real folder name:
   - Leave this session by typing `/exit`.
   - Run `learnbuild open <folder name>`. It moves into the folder and opens Claude Code there.
5. Stop there. The project's commands and safeguards load only when Claude Code starts in that folder, so do not continue the conversation about the idea in this session.

If `learnbuild` is not found, tell the learner LearnBuild is not installed on this computer and stop.

## B. A project exists

Read `.learn-build/PROJECT.md`.

### Version control comes first

If the file has no line starting with `Version control:`, the learner has not been asked about Git yet. Settle that before anything else:

1. Ask exactly this and nothing more: "Do you want to initialise a Git repository for this project? Answer yes or no, or ask me what that means first."
2. If they ask what it is, or seem unsure, explain in a few sentences. Git is a version control tool: it saves snapshots of the project, called commits, so they can see what changed and go back to an earlier version if something breaks. The repository lives in the project folder on their own computer. Answer any follow-up questions before asking again.
3. Give them this link for reading more: https://git-scm.com/book/en/v2/Getting-Started-About-Version-Control (the free Pro Git book).
4. Be straightforward about whether they need it. Saving commits is worth doing if they want that history to go back to, plan to share the code with other people, or want a copy kept safely somewhere other than this computer. If none of that matters to them yet, skipping it is a reasonable choice and they can add it later.
5. Do not suggest GitHub or any other hosting service, and do not offer to upload the code. If the learner asks about sharing or backing up, explain that it is a separate step they can take later.
6. Record a clear yes with `learnbuild git --init` and a clear no with `learnbuild git --skip`. Claude Code may ask the learner to approve the command. If the output says `not_installed`, tell them Git is not on this computer yet, give them https://git-scm.com/downloads, and carry on without it.

Then continue below. Keep the `Version control:` line when you rewrite the file.

### The brief

If the brief is already written, summarise it in a few lines and make the offer under "Review or move on" below.

If it says the brief has not been written yet, find out what they want to build. Ask these one at a time, skipping any they have already answered, including under "Idea so far":

1. What do you want to build? Describe it however you like.
2. Who will use it, and what is the main thing they will do with it?
3. What is the smallest version that would already be useful? If they are unsure, suggest one and ask if it sounds right.
4. Where should it run? Give examples that fit the idea, such as a page in a web browser, an app on a phone, a program started from the terminal, or a script that runs on its own. If they do not know and the idea suits a web page, recommend a web page running on their own computer, because it needs no accounts or payments.
5. Have you written any code before? Use the answer to set how much you explain.

Do not ask about programming languages or tools. Those come later, with explanations. If the learner names a language or tool they want to use or learn, record it in `PROJECT.md` under a "Learner's preferences" heading so that planning uses it.

Then write two files:

- `.learn-build/PROJECT.md`: keep the title line, replace the placeholder text, and add short sections for the idea, who it is for, what the first version does (a few things a user can do), what is left for later, where it runs, and the learner's experience.
- `.learn-build/REQUIREMENTS.md`: a numbered list (R1, R2, …) of what the first version must do, each with a plain "Done when …" line that someone could check by using the software.

Do not create any other files, choose technology, install anything or write code in this step. Write and change these files with the Write and Edit tools; shell commands that write files are blocked until a task is started.

### Review or move on

Once both files exist, read the summary back in a few lines and tell the learner where the files are. Then give them two ways to continue, naming both words, and stop:

- **review** goes through the brief and the requirements with them one part at a time, so they can change anything before planning.
- **next** moves on to planning, which turns the brief into a short list of building steps.

Do not phrase the offer as a yes-or-no question, because a bare "yes" is read as a go-ahead. If their reply does not show which they want, ask once more with the two words. If they reply with a correction instead, update the files and make the offer again.

### Going through the brief

Follow this when the learner says "review" or asks in their own words to go through, check or change the brief or the requirements. A learner who asks for one specific change gets that change and the offer again, without the full walk-through.

Start by saying in a sentence what each file is for: `PROJECT.md` describes what is being built and who it is for, and `REQUIREMENTS.md` lists what the first version must do. Tell them that saying **next** at any point ends the review and moves on to planning, and that any other reply is taken as their answer.

1. Go through `PROJECT.md` one section at a time. Say what the section currently records in a sentence or two, ask whether it is right or needs changing, and wait for the answer.
2. Go through `REQUIREMENTS.md` one requirement at a time. Show the requirement and its "Done when" line as written, and ask whether it describes what they want. If a "Done when" line could not be checked by using the software, or it says how something will be built instead of what the user can do, suggest clearer wording and give the reason in a sentence.
3. After the last requirement, ask whether anything they expected to see is missing. Then ask whether anything on the list could wait for a later version, and move whatever they defer to the "left for later" section of `PROJECT.md`.

While going through:

- When the learner asks for a change, make it straight away, change only what they asked for, and confirm it in one line. Keep the requirements numbered in order with no gaps.
- When they ask a question, answer it and return to the part you were on. The review does not move forward because a question was asked.
- Suggest a change only when something is unclear, cannot be checked or is too big for a first version. The learner decides whether to take the suggestion.
- Keep technology out of it. If they ask which language or tools will be used, tell them planning covers that and explains each choice.

When the last part is done, or the learner says they have seen enough, list what changed in a few lines, or say that nothing did. Then tell them to say **next** to plan the building steps.

If building steps already exist when the learner asks for a review, go through the files the same way. Tell them once that the steps were planned from the earlier wording, and that a changed or added requirement may need a new step, which `/learn-plan` can add.
