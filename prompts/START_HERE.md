# First Claude Code session — BUILD prompt

You are implementing a new open-source TypeScript framework called **LearnBuild**, described by the documents in this repository.

Your job in this session is to **write working framework code**, not to act as an end-user learner and not merely to produce another high-level plan.

## Read first
Read, in this order:
1. `CLAUDE.md`
2. `standards/PROSE_STYLE.md`
3. `docs/PRODUCT.md`
4. `docs/ARCHITECTURE.md`
5. `docs/LEARNING.md`
6. `docs/EXPLAIN.md`
7. `docs/ACCEPTANCE.md`
8. `docs/ROADMAP.md`
9. `docs/DECISIONS.md`
10. Example fixtures under `specs/`

Use https://github.com/open-gsd/gsd-core as *inspiration*, particularly its structured phase, context and verification philosophy. Do not install/fork/copy it in this milestone. Consult up-to-date Claude Code skills documentation only when necessary to implement actual skills. Project-scoped skills use `.claude/skills/<name>/SKILL.md`.

## Objective for this session
Implement **M0 and the useful core of M1** from `docs/ROADMAP.md`:
- TypeScript/Node foundation with working scripts and test harness.
- Versioned durable workflow state with validation and safe atomic persistence.
- Task, checkpoint and explicit decision contracts.
- Learning thread opening, follow-up and resume with NO workflow advancement.
- Deterministic authorised task/decision transitions and dependency gates.
- Minimal CLI allowing these transitions to be exercised independently of Claude.
- Comprehensive unit tests for T01–T10 where possible, particularly T01–T09.

If the repository is empty of implementation code, create it. Prefer Node built-ins, no unnecessary third-party libraries, no backend or hosted dependencies. Choose a supported modern Node version; note it in package engines/docs. Do not confuse compile success with functional success.

## Behavioural requirements
- A question is never an implicit implementation request or decision. The learner may ask multiple follow-up questions and return to the original pending decision with `/learn-resume` later.
- Only explicit validated input can resolve a pending decision.
- A code example in chat doesn't authorise edits.
- State is durable across process restarts and includes schemaVersion and revision. Guard against stale/multiple writers.
- A task only executes when required dependencies/decisions/checkpoints are satisfied.
- Explain mode will be read-only; implement its domain boundary later, not a fake guarantee today.
- Learning proficiency is independent of task completion.
- Follow `standards/PROSE_STYLE.md` in all prose output. Preserve that file as the single source of truth for all eventual runtime-agent prompt assembly; see T19–T21.

## Working process
1. Briefly identify architecture/typing decisions requiring attention. Make reasonable choices without asking me to repeat the product vision.
2. Implement a thin vertical slice of core behaviour and its tests.
3. Continue building out M0/M1 and run check/build/tests.
4. Document exactly what is working, what isn't, and the next engineering tasks. Update `docs/DECISIONS.md` with actual decisions.
5. If M0/M1 are completed in this session, begin M2 only if it can be done with tests and without undermining quality.

## Boundaries
- Do not build a full learning platform, web UI, LLM service, hosted system, plugin marketplace, multi-agent swarm or deployment automation.
- Do not install GSD in this repository; our design may take inspiration from it, but the pedagogical and conversational state machine is the differentiated product.
- Don't create fake `/learn-*` commands that claim working capabilities before their underlying logic exists.
- Maintain short, factual completion notes rather than claiming unverified outcomes.

## Before finishing, report
- Files created/changed and why.
- Commands/tests actually executed and their results.
- A brief demonstration showing the pending auth decision survives `what is a token?`, follow-up questions and resume.
- Any risks and gaps, particularly concurrency and permissions.
- The next 3–5 implementation tasks for the following session.

Proceed with implementation now.
