# Product requirements — LearnBuild v0.1

## Vision
An AI engineering mentor that helps people turn their own ideas into deployed software while developing the judgement and understanding necessary to build and maintain software in the AI era. It also teaches using existing codebases.

**Promise:** Build the software you want to build. Learn the engineering you need along the way.

## Positioning
Not a syntax-first programming course and not a fully autonomous vibe-coding agent. It combines structured software delivery, adaptive teaching, explicit learner decisions, contextual explanations, and verifiable evidence of understanding.

## Target audience
Primary: aspiring software developers with limited or developing programming experience who have a real project idea and want to become capable in AI-assisted software engineering. No assumption that they need an exhaustive introductory syntax course.
Secondary: existing developers learning unfamiliar stacks, architectures, codebases or infrastructure.

## Two entry points
### A. Build & Learn
Learner describes a project idea. Framework guides discovery, requirements, scope/MVP, architecture, implementation in vertical slices, integration, testing, deployment, operation and iteration. It identifies teaching opportunities and asks for consequential decisions.

### B. Explore & Learn
Learner invokes `/learn-explain` on an existing repo, or a file, symbol, directory, feature or Git diff. Framework inspects actual code, teaches what it does, why the design exists (clearly labelled inference where appropriate), and broader engineering concepts. Default read-only. No prior LearnBuild project required.

## Core behaviours (must-have)
P01. Create a project with a durable project brief, requirements and first vertical-slice roadmap.
P02. Maintain separate durable project execution and learner competency records.
P03. Identify consequential decisions (e.g. authentication strategy) and require explicit choice before action.
P04. Allow natural-language questions at any time, including multi-turn follow-ups, without advancing a pending task or authorising changes.
P05. Allow learner to resume exactly the original pending task after questioning; recognise explicit `/learn-resume`.
P06. Distinguish question, request to explain, decision, request to implement, resume and progress request. When intent is ambiguous and a side effect is possible, do not execute.
P07. Explain key concepts in terms of the current project's actual architecture and code; avoid generic lectures.
P08. Record learning evidence separately from explanations read. Knowledge exposure alone is not mastery.
P09. Guide a minimal vertical slice through client, API and persistence where appropriate for the chosen product.
P10. Verify technical implementation with tests and acceptance checks; report what was actually run.
P11. `/learn-explain` can inspect a repo and explain architecture, file, directory, feature, changed code or concept using grounded file references.
P12. Explain mode must prohibit writes and high-risk commands at a technical boundary.
P13. State survives new CLI sessions and conversation compaction.
P14. A user can ask 'why?', 'what is a token?', 'show me an example' or 'how is that different?' without being forced to select a menu item.
P15. User can choose guided, hands-on or accelerated teaching intensity; core safety/verification gates remain.

## Suggested command surface (implementation targets)
- `/learn-new` — initialise a learning project and guided discovery.
- `/learn-plan` — requirements, architecture and phased implementation plan.
- `/learn-build` — execute next authorised task with contextual teaching.
- `/learn-ask` — explicitly open a learning thread, optional because natural language must work.
- `/learn-explain [target]` — read-only explanation of existing code.
- `/learn-resume` — resume pending workflow from its durable checkpoint.
- `/learn-progress` — project and learning progress summary.

Use project-scoped Claude Code Skills (`.claude/skills/<name>/SKILL.md`) as the initial UX. Implement deterministic state changes in TypeScript, not as model-only promises.

## Example journey
User: 'I want an app to organise nearby football games.'
Framework: defines users, core workflows, MVP and acceptance criteria; explains choice of client/API/database. Builds 'create a game and list games' end-to-end with actual verification. Later teaches joins, relationships, validation, concurrent access, tests and deployment.

At an authentication decision:
Agent: 'We can use sessions or token-based authentication. Which would you prefer?'
Learner: 'What is a token?'
Agent explains without changing decision. Learner asks two follow-ups. Learner says '/learn-resume'. Agent presents the original decision, still pending. Learner explicitly chooses sessions. Only then may implementation start.

## Teaching rules
- Focus on what/why, architecture, trade-offs, code review, verification, debugging and responsible AI collaboration.
- Use prediction, explanation, tiny modifications and debugging as evidence; never treat 'yes, I understand' as demonstrated competence.
- Skip redundant teaching when learner has previously demonstrated concept; revisit through transfer tasks.
- Avoid requiring learners to implement every boilerplate line manually.
- Don't turn every step into a quiz; contextual teaching and project momentum are both essential.

## v0.1 exclusions
Hosted platform, web UI, certification, social features, syncing profiles across devices, full interactive coding course, automated deployment to every provider, mobile runtime integration, paid tiers, heavyweight code graph/embedding infrastructure, complex agent swarms.

## Success criteria
A novice can start a realistic project, encounter a decision, ask multiple natural-language questions, return without losing state, complete a verified vertical slice and articulate its structure. An unrelated repository can be explored read-only, and explanations cite actual code. Restarting the session preserves progress and pending decisions.

## Product quality measures
- Technical: verified vertical slices, no false completion claims, state integrity.
- Teaching: evidence of understanding and independent completion of analogous tasks with reduced help.
- Experience: no unintentional implementation during questions; reliable resume; reasonable interruptions.
