# Implementation roadmap

## M0 — Repository and test harness (implement first)
- Establish TypeScript project, package scripts, build/check/test commands.
- Use Node built-in test runner (`node:test`) and modern Node version target specified in package engines. Avoid external deps unless necessary.
- Create `src/domain`, `src/state`, `src/router`, `src/threads`, `src/learning`, `src/explain`, `src/cli`.
- Create fixtures and tests with temp repositories, not framework source.
- Ensure `npm test` and `npm run check` work. If TS runtime execution requires tool choices, pick a minimal sound option and document the choice.

## M1 — Durable core, pause/resume, permission invariants (highest priority)
- Define executable schemas/types and state loader with version/revision validation.
- Persist workflow tasks, dependencies, decisions, checkpoint states, evidence references.
- Build deterministic transitions: initialise, request decision, open question, add follow-up, resume, resolve decision, start task, verify task.
- Implement atomic state writes with concurrency safety; error on stale revision, not silent overwrite.
- Add explicit CLI commands for transition testing and JSON output.
- Tests: questions preserve workflow; resume returns to pending decision; no accidental execution; schema/version errors don't corrupt state; dependency/checkpoint gating.

## M2 — Learner competency and teaching metadata
- Define starter competency catalogue with prerequisite relationships.
- Persist evidence with provenance, level candidates and time.
- Implement conservative proficiency calculation (exposure does not mean mastery).
- Implement guided/hands-on/accelerated settings.
- Test difference between project progress and learner progress.

## M3 — Read-only explanation engine
- Build bounded repository inspector that discovers manifests/entrypoints and can return snippets with `path:line` identifiers.
- Reject outside-root and symlink-escape paths; ignore secrets and vendor/build directories.
- Add support for file, directory, architecture, feature and changed-code discovery at a modest scope.
- Build `/learn-explain` skill that uses inspector outputs and explicitly labels inferences.
- Test inspection causes no tracked/untracked changes in target repo; limit tests and dangerous path fixtures.

## M4 — Claude Code skills and one end-to-end learning workflow
- Implement `/learn-new`, `/learn-plan`, `/learn-build`, `/learn-ask`, `/learn-explain`, `/learn-resume`, `/learn-progress` as `.claude/skills/.../SKILL.md` files.
- Skills should be concise; include references to detailed docs rather than bloated global instructions.
- Prove hands-on scenario: local football game organiser, small backend/API and simple client, safe local persistence, one verified vertical slice.
- At auth decision, ask arbitrary questions/follow-ups then resume unchanged; require explicit decision to proceed.
- Do not pretend arbitrary user text automatically triggers tool routing if unverified; test interactively in actual Claude Code.

## M5 — Expand workflow coverage (post-MVP)
- Integration, testing, deployment, operations, and context recovery beyond one slice.
- Broader competencies, re-assessment and transfer exercises.
- Runtime-agnostic adapters / support Codex or OpenCode only after core workflow succeeds.

## First implementation session priority
Do M0 and a meaningful, tested slice of M1. Don't spend the entire session rewriting the PRD, inventing branding, building a UI, or introducing orchestration complexity. Implement code and report tests actually run.

## Definition of done per milestone
Working source + tests + documentation of verified behaviour + unimplemented limitations + decisions recorded. A doc-only milestone does not count as implemented.
