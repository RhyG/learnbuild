# Explore & Learn — `/learn-explain`

## Purpose
Teach how an existing repository works, without assuming LearnBuild initially created it. The learner can ask questions indefinitely and understand the code that already exists.

## Invocation examples
- `/learn-explain` — overview and suggested exploration routes.
- `/learn-explain architecture` — entrypoints, layers, dependencies, interfaces.
- `/learn-explain src/auth` — directory scope.
- `/learn-explain src/api/users.ts` — focused file explanation.
- `/learn-explain login` — feature trace across source files.
- `/learn-explain --changed` — explain current changes from read-only Git diff.
- `/learn-explain --concept dependency-injection` — examples from real code.

## Explanation levels
1. What it does — grounded behaviour visible in code.
2. Why it is arranged this way — reasoned design analysis; label intent as inference when the code doesn't document it.
3. General concept — e.g. separation of concerns, transaction boundary, dependency injection, idempotency.
4. Walk through actual data/control flow — reference file paths, symbols and ideally line ranges.
5. Optional learning exercise — prediction, small review thought experiment, or hypothetical modification *without editing*.

## Scan strategy
Start with safe top-level discovery: language/tool manifests, structural dirs, docs, known entrypoints. Narrow searches iteratively. Ignore vendor/build/secrets. Limit search breadth and output size. Do not blindly load entire large repositories into context. For actual source snippets, cite `path:line` references when grounded. Distinguish static inferences from runtime evidence.

## Read-only requirements
Default deny for writes, external side effects and arbitrary program execution. Implement a read-only Node inspector with bounded root and explicit path protection. Do not automatically install dependencies, run scripts, execute test suites, mutate Git or create indexes inside the inspected target repository.

The Claude Code session may still have general-purpose tools. The Explain skill must additionally avoid delegating to unrestricted tools, and documentation must make clear that a stronger guarantee requires Claude permission/tool restrictions or a separate isolated inspector. Design for genuine capability separation, not merely instructions.

## Question handling
A new question opens/continues a learning thread scoped to the current file/feature. Examples:
- "What exactly is middleware?"
- "Why does the controller call a service instead of the database?"
- "How would this differ with a document database?"
- "Can we trace how an unauthorised request fails?"
Return to the original source exploration with `/learn-resume` or an explicit natural-language return request, without modifying project state.

## Future evolution
Concept dependency maps, remembered codebase paths and a progressive learning itinerary, across-project competency portability, and code review challenges.
