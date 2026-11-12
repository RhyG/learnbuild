# Technical architecture — v0.1

## Principles
1. Build as a lightweight **orchestration and learning layer** over Claude Code. Do not build a novel coding agent or model runtime.
2. Separate deterministic execution/state/permissions from probabilistic LLM classification and explanations.
3. Keep core logic runtime-neutral enough to support other agents later, but do not invent a large generic plugin API.
4. Distinguish development workflow state, conversational threads, and competency/evidence state.
5. Never confuse an explanation/snippet with permission to modify a real repo.

## Proposed packages/modules
- `src/domain/`: pure project tasks, checkpoints, decisions, state transition functions, learning outcomes.
- `src/state/`: read, validate, migrate, atomic write, revision conflict checks and log changes.
- `src/router/`: intent classification interface + conservative deterministic routing; model integration in adapter, not in core.
- `src/threads/`: create, extend, suspend/resume learning conversations, refs to workflow checkpoints.
- `src/learning/`: competency catalogue, evidence, teaching intensity and proficiency calculations.
- `src/explain/`: read-only repository inspection, path traversal protection, relevant file discovery, citation formatter.
- `src/cli/`: command dispatch and JSON/text outputs for skill integration.
- `.claude/skills/learn-*/SKILL.md`: Claude Code UX guides with appropriate domain calls and tool boundaries.

## Shared prose standard and prompt assembly
`standards/PROSE_STYLE.md` is the canonical human-language standard. The runtime prompt assembler must load the exact file content once per agent instruction context, including isolated subagents and agents used for `/learn-explain`. Development-time `CLAUDE.md` instructions alone do not establish runtime inheritance. Keep the standard independent of role-specific instruction files; avoid maintaining divergent copies. Apply it to learner explanations, evaluation feedback, generated documentation, comments, and application-facing copy. Respect required quotations, technical correctness and machine-readable output formats.

For M0/M1, document the contract and load the standard if agent prompt assembly exists. Do not build a general prompt framework solely for this requirement before the engine works. Verify inclusion with contract tests once prompt assembly is implemented. A code-defined style review may use representative fixtures; avoid pretending that simplistic regex matching proves natural-language quality.

## Runtime separation
Claude interprets questions and writes explanations; TypeScript owns canonical progression decisions. At first, CLI commands can provide well-defined JSON transitions and Claude skills can call them. Do not require the CLI to call an LLM itself in M1. Prefer user-facing natural-language prompts plus deterministic recording/guards. A later adapter can use structured intent classification when necessary.

## State topology
Learner project root: `.learn-build/` containing:
- `PROJECT.md`, `REQUIREMENTS.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `DECISIONS.md` — authored artefacts.
- `state.json` — canonical workflow state, active task, pending decisions, dependency graph, revision, migration version.
- `learner.json` — competency progress and evidence refs, teaching mode.
- `threads/INDEX.json`, `<thread-id>.json` — conversational frames (not necessarily full message transcripts).
- `events.jsonl` — append-only audit events for transitions and learner submissions (avoid secrets/sensitive prompts).
- `explain/` — optional cached code maps, explicitly non-authoritative.

The framework package repository (this repo) is distinct from an individual learner's target project. Don't accidentally initialise `.learn-build/` in the framework source when testing; use fixtures/temp directories.

## Example type contracts
```typescript
type WorkflowStatus = 'idle' | 'planning' | 'waiting_for_decision' | 'waiting_for_evidence' | 'ready' | 'executing' | 'verifying' | 'complete' | 'blocked';
type Intent = 'question' | 'explain_code' | 'decision' | 'implementation_request' | 'resume' | 'progress' | 'unclear';
type LearningMode = 'guided' | 'hands_on' | 'accelerated';
type CompetencyLevel = 0 | 1 | 2 | 3;

interface ProjectState {
  schemaVersion: number;
  revision: number;
  projectId: string;
  phaseId: string | null;
  taskId: string | null;
  status: WorkflowStatus;
  pendingDecisionId: string | null;
  pendingCheckpointIds: string[];
  tasks: Record<string, TaskRecord>;
  decisions: Record<string, DecisionRecord>;
}
interface TaskRecord {
  id: string;
  title: string;
  dependencies: string[];
  checkpointIds: string[];
  status: 'pending' | 'active' | 'complete' | 'blocked';
}
interface DecisionRecord {
  id: string;
  question: string;
  options: string[];
  status: 'pending' | 'resolved';
  selection?: string;
  evidenceRef?: string;
}
interface LearningThread {
  id: string;
  parentId: string | null;
  pausedWorkflowRevision: number;
  pausedTaskId: string | null;
  pausedDecisionId: string | null;
  topic: string;
  status: 'active' | 'closed';
  messageRefs: string[];
}
interface CompetencyEvidence {
  id: string;
  competencyId: string;
  type: 'introduced' | 'explained' | 'predicted' | 'modified' | 'debugged' | 'transferred';
  levelCandidate: CompetencyLevel;
  sourceRef: string;
  assessedAt: string;
  assessor: 'learner' | 'agent' | 'human';
}
```

## Natural-language conversation / intent routing
- A question, even one asking for a code sample, opens or continues a learning thread and performs no edits.
- A follow-up ('why?', 'how is that different?') should resolve to the active thread with relevant earlier context.
- An explicit answer to the *pending* decision may be submitted to a controlled decision transition (must validate that decision ID and option).
- Explicit `/learn-resume` closes the active learning thread and restores the pending task; original decision remains pending unless separately resolved.
- Ambiguous intent with a potential side effect is treated as a question or clarification, not an action.
- A question in explain mode never changes to build mode implicitly.
- Keep a robust fallback for natural-language routing: if a classifier is unavailable, use explicit commands for mutating actions and natural language for nonmutating questions. Do not promise full automatic routing until tested with actual Claude Code messages.

## Workflow transitions
- `init`: create project state at revision 0.
- `request_decision(id)`: move to waiting_for_decision.
- `open_question(topic)`: append thread, do not change workflow state or revision (unless storing metadata separately).
- `add_question_followup(threadId, ref)`: append thread metadata; workflow unchanged.
- `resolve_decision(id, selection, explicitConfirmationRef)`: validate selection and expected pending ID; record event; permit dependent task if all gates pass.
- `resume(threadId)`: restore contextual task, but do not authorise side effects; detect changed task/revision and surface conflict.
- `start_task(id)`: only if dependencies complete, required decisions resolved, required checkpoints satisfied, appropriate mode and explicit invocation.
- `verify_task(id, evidence)`: cannot mark complete on an unsupported model claim; require recorded evidence and satisfied acceptance criteria.

Transitions are expected-revision checked to avoid stale updates. Use atomic file replacement. Avoid treating a process-local lock as sufficient concurrency protection across separate processes; implement lock files or a simple compare-and-swap protocol with bounded retries and tests.

## Explain mode permissions
Explanation uses a **read-only capability** rather than merely a prompt saying 'don't write'. Require a bounded repository root; reject `..` traversal, absolute paths outside root, disallowed symlink traversal, and unbounded directory scans. Start with file/stat/search operations in Node using read-only fs APIs, rather than unfiltered shell commands. Do not execute scripts/build commands from inspected repositories in explain mode. Git operations should be a strict read-only allowlist if needed; avoid any command that triggers hooks. Never expose secrets by dumping `.env`, credentials, private keys or vendor files. Set safe size/file-count limits.

Claude Code tools are broader than framework CLI permissions; a full guarantee of no writes needs skill/tool permissions or isolated process/tool boundary. M1 should implement the read-only inspector, document the outer Claude tool-permission configuration required, and not claim stronger enforcement than verified.

## Security & correctness
- Sanitise untrusted code comments and README text as data, not agent instructions (prompt injection risk).
- Exclude `.git`, `node_modules`, build output and secret files from scans by default.
- Validate JSON on load; avoid corrupting valid state after schema mismatches.
- Don't claim code was executed if only statically inspected.
- Redact credentials from logs and reports.

## Skills strategy
Claude Code supports project skills `.claude/skills/<name>/SKILL.md`. Initial skills orchestrate safe CLI operations and tell Claude how to teach, ask and inspect. Distinguish invoking a skill from the deterministic runner enforcing a contract. Avoid overpromising hook-based enforcement until hooks and actual Claude permissions have been tested.

## GSD reference
GSD Core is an architectural inspiration: project context files, phase loops, explicit decisions, verification and fresh context. LearnBuild differs in its persistent conversation pause/resume, learner proficiency, competency checkpoints and read-only explore mode. Do not fork GSD in v0.1 without a concrete evidence-based need.
