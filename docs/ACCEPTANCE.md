# Acceptance scenarios / executable specification

Build automated tests for these invariants before broader integration. Names below are suggestions for test names.

## Workflow and conversational integrity

### T01 — Question doesn't decide or execute
Given pending task `auth-01` and decision `auth-strategy`, when learner asks "what is a token?", workflow phase/task/status/decision unchanged. Learning thread opens. No source edits. No implementation action requested.

### T02 — Follow-ups preserve discussion
After T01, learner asks "how is that different from a cookie?" then "where would we store it?". Both remain in same contextually relevant thread; workflow unchanged.

### T03 — Resume restores pending decision
After T02, `/learn-resume` closes or suspends current learning thread and points back at auth decision. It does not mark auth decision resolved.

### T04 — Explicit decision advances correctly
If pending decision is `auth-strategy`, explicit learner choice `sessions` records choice and allows dependent tasks when all other conditions satisfied. An unrelated answer or ambiguous phrase does not.

### T05 — Code example is not code edit
A request to show a hypothetical token implementation produces a nonmutating explanatory task. No files edited or task started.

### T06 — Nested or switched topics
Question about auth token, unrelated Git question, then return to auth: original checkpoint still recoverable.

### T07 — Restart and compaction durability
Write state, terminate process, load state from another process/session. Pending decision and thread pointers survive without access to original chat transcript.

### T08 — Stale revision rejected
If two writers read revision N, first update commits N+1; second cannot silently overwrite it. Concurrency-safe, deterministic error/retry.

### T09 — Required checkpoints block action
Task requiring an unresolved decision or understanding gate cannot transition to executing. Optional learning opportunity can be deferred with a record.

### T10 — No false verification
Task not marked complete without explicit verification evidence and validated acceptance criteria.

## Learning

### T11 — No mastery for reading
Teaching explanation or 'I understand' does not promote competency to demonstrated. Evidence and assessment required.

### T12 — Adaptive intensity
Guided/hands-on/accelerated change participation rules but don't bypass hard decision/security/verification gates.

### T13 — Separate project and learner progress
Completing a task does not automatically promote learner competency.

## Explain mode

### T14 — Existing repo entry
A repo without `.learn-build/` can be inspected with `/learn-explain` equivalent. No project init required.

### T15 — Grounded explanations
A function/file explanation references real paths and accurate line ranges; absent symbols are reported as absent rather than fabricated.

### T16 — Read-only behaviour
Inspections create no files, alter no content, run no untrusted scripts, and do not install dependencies in target repo.

### T17 — Path and symlink protection
Reject traversal and symlink targets outside root; don't scan secrets or vendor/build output.

### T18 — Bounded inspection
Large repository scan honours size, count and depth limits; explains partial coverage clearly.

## Prose compliance

### T19 — Canonical prose standard applies during development
`standards/PROSE_STYLE.md` exists and contains the project owner's exact prose rules. `CLAUDE.md` points to it, and documentation, comments and developer-facing progress reports follow it. The rules are not duplicated in divergent files.

### T20 — Runtime agent instructions include the full standard
Every agent role that generates prose (including teaching, architectural explanation, codebase exploration and verification feedback) receives the canonical file's full content, including in isolated contexts. Test this at the prompt-assembly boundary, not only by checking that a pathname occurs in a prompt.

### T21 — Representative outputs respect the prose standard
Review sample long-form explanations, checkpoint prompts, assessment feedback, generated UI copy and source comments for natural readability and the listed rhetorical patterns. Preserve source quotations and exact technical terms. Automated checks may assist, but do not assert full compliance based only on regexes.

## Full interactive smoke test in Claude Code
1. Open new empty learner repo (fixture).
2. Run `/learn-new` and supply local football game organiser idea.
3. `/learn-plan` and initiate first vertical slice.
4. Pause at an architectural/auth decision.
5. Ask 'what is a token?' and two follow-ups without a slash command.
6. Ask for an illustrative code example; confirm no project changes.
7. Run `/learn-resume`; confirm original decision still pending.
8. Choose an option explicitly; build and verify slice.
9. Run `/learn-explain` on an unrelated code fixture; confirm read-only.
10. Restart Claude Code; confirm durable project/learner state.

Note: unit tests of the CLI cannot prove Claude Code's unrestricted tools never write. Document actual permission sandbox/skill constraints and limitations; validate in real Claude Code.
