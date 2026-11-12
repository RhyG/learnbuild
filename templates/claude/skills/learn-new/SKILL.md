---
name: learn-new
description: Start a new LearnBuild project from an idea. Use when someone wants to begin building something new and learn as they go, or runs /learn-new.
argument-hint: "[project name or idea]"
allowed-tools: Bash(learnbuild status), Bash(learnbuild new *), Bash(learnbuild git *), Write, Edit
---

# Start a new project

What the learner typed after the command: $ARGUMENTS

The learner may never have programmed. Use everyday words, ask one question at a time and wait for each answer.

Run `learnbuild status` first. What it returns decides which part below applies.

## A. No project here yet (`STATE_NOT_FOUND`)

1. Settle on a project name without an extra question where you can. If the learner gave a name, use it. If they described an idea but gave no name, make a short name from the idea, two or three words long. Only if they gave neither, ask "What would you like to call your project?" and wait.
2. Run `learnbuild new --name '<name>' --no-launch`. If you had to ask for the name, Claude Code may ask the learner to approve this command; tell them that approving it creates the folder. Drop any apostrophes from the name. This creates a new folder inside the current one and prints its path.
3. If the learner has already described their idea, add it under an "Idea so far" heading at the end of `<new folder>/.learn-build/PROJECT.md`, so they do not have to repeat it.
4. Tell the learner the project folder is ready, what you called it if you chose the name, and that Claude Code needs to be opened inside it. Mention that they can also open that folder in a code editor such as VS Code to watch the files as they are written. Give them these steps exactly, with the real path:
   - Leave this session by typing `/exit`.
   - Run `cd "<path>"` and then `claude "/learn-new"`.
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

If the brief is already written, summarise it in a few lines and ask whether they want to change anything. If not, tell them to say **next** to plan the building steps.

If it says the brief has not been written yet, find out what they want to build. Ask these one at a time, skipping any they have already answered, including under "Idea so far":

1. What do you want to build? Describe it however you like.
2. Who will use it, and what is the main thing they will do with it?
3. What is the smallest version that would already be useful? If they are unsure, suggest one and ask if it sounds right.
4. Where should it run: in a web browser, on a phone, or only on your own computer? If they do not know, recommend a web page running on their own computer, because it needs no accounts or payments.
5. Have you written any code before? Any answer is fine; it sets how much you explain.

Do not ask about programming languages, databases or tools. Those come later, with explanations.

Then write two files:

- `.learn-build/PROJECT.md`: keep the title line, replace the placeholder text, and add short sections for the idea, who it is for, what the first version does (a few things a user can do), what is left for later, where it runs, and the learner's experience.
- `.learn-build/REQUIREMENTS.md`: a numbered list (R1, R2, …) of what the first version must do, each with a plain "Done when …" line that someone could check by using the software.

Read the summary back in a few lines and ask the learner to correct anything. Update the files if they do.

When they are happy, tell them to say **next**, and that the next stage turns this into a short list of building steps.

Write these files with the Write tool; shell commands that write files are blocked until a task is started. Do not create any other files, choose technology, install anything or write code in this step.
