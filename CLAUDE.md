# LearnBuild repository instructions

**If the person asked you to install, set up or use LearnBuild**, follow `INSTALL.md` and ignore the rest of this file. Everything below is for work on the framework itself.

This repository is implementing **LearnBuild**, a Claude Code-first, learning-first software development framework. Read `README.md`, `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/LEARNING.md`, `docs/EXPLAIN.md`, `docs/ACCEPTANCE.md`, and `docs/ROADMAP.md` before major design changes.

## Mandatory prose standard
Read and follow `standards/PROSE_STYLE.md` before authoring or editing prose. It governs your responses to the developer, documentation, code comments, agent prompts, and generated UI copy. Treat the file as the canonical, verbatim standard; do not abbreviate its rules. All runtime agent instruction assemblies must include the contents of this file, even when agents run in isolated contexts. Add tests/reviews for this requirement under `docs/ACCEPTANCE.md`.

## Mission
Build correct, maintainable software AND develop the learner's engineering competence. Neither is secondary. The product teaches through the user's real project or existing source code, not by requiring unrelated courses.

## Non-negotiable invariants
1. Questions and follow-up questions do not advance or mutate the development workflow.
2. A paused decision remains pending until an explicit learner decision is supplied and validated.
3. Explanations and examples never implicitly authorise filesystem modification.
4. Explain mode is read-only at the capability/tool layer, not just by prompt instruction.
5. Workflow status and learning proficiency are distinct; project completion never implies understanding.
6. Actual verification is required before claiming something works. Preserve evidence.
7. Survive restarts and long conversations using durable, versioned state, not only chat history.
8. Never infer technical design intent as a verified fact; ground codebase explanations in files and line references.
9. The framework should teach useful engineering choices without forcing unnecessary complexity.
10. Build small vertical slices, verify with tests, and keep every milestone independently usable.

## Code preferences
- TypeScript, Node.js; minimise third-party libraries unless clearly justified. Prefer built-in `node:test`, `fs`, `path`, `crypto`, etc.
- Strongly typed interfaces, explicit state transitions, careful error handling, readable modules.
- State writes should be validated and atomic (write temp file in same directory then rename). Define a strategy for interrupted writes and revision conflicts.
- Canonical project state must have a schema version and migration strategy; reject unknown incompatible versions.
- Never execute arbitrary code provided by an untrusted repository in explain mode.
- Separate pure domain logic from CLI adapters and Claude Code skill files.
- Use Australian English in user-facing content.

## Implementation workflow
- Follow the milestone order in `docs/ROADMAP.md` unless a clear dependency warrants a change.
- Before a large change, state the intended outcome and files to touch.
- Write tests for state invariants, intent handling, checkpoint enforcement, and read-only explain mode.
- Don't merely produce specifications: implement working code in the repository, run tests, and summarise verified outcomes.
- Avoid overengineering: defer multi-agent runtime, cloud services, UI, third-party indexing, and broad curriculum.
- Maintain `docs/DECISIONS.md` and a concise progress log as implementation progresses.

## Critical distinction
You are **building** the LearnBuild framework in this repository. You are not acting as its learner-facing agent unless explicitly asked to test the user experience. Do not inject teaching questions into the owner's engineering implementation work.
