# Teaching design and competency model

## Learning through real work
The project provides the order and context. The curriculum provides outcomes and prerequisite concepts; it is not a sequential course. Teach the important what/why, boundaries, decisions and verification. Coding syntax is taught as needed, not from scratch.

## Teaching loop per consequential task
1. Determine concepts implicated by the task.
2. Check the learner's demonstrated proficiency and prerequisites.
3. Present the decision or concept in the context of the current project's actual code.
4. Offer meaningful alternatives and trade-offs when relevant; let learner ask questions without advancing.
5. Invite an appropriate learner action: choose, predict, explain, modify or debug.
6. Implement/inspect the code; demonstrate actual behaviour.
7. Record verifiable evidence; adapt later instructions accordingly.

## Learning modes
- **Guided** (default): learner chooses meaningful approaches, reviews key changes and participates in some exercises; AI does routine implementation.
- **Hands-on**: learner writes selected code/tests and diagnoses failures with incremental hints.
- **Accelerated**: agent handles more execution; learner still reviews consequential decisions and understanding checkpoints.
All modes must respect permission gates, verify functionality and avoid inferring proficiency from completed features.

## Proficiency levels
- 0 Not assessed: no reliable evidence.
- 1 Introduced: learner can recognise/describe it; exposure alone does not prove level 1.
- 2 Practised: applies concept with guidance.
- 3 Demonstrated: applies to relevant task with limited help, explains trade-offs or handles a comparable problem.
Record evidence provenance, timestamp and confidence; permit revisiting or downgrading proficiency when evidence contradicts prior assessment.

## Checkpoint types
- `decision_gate`: consequential option requires explicit choice; always blocking.
- `understanding_gate`: demonstrates a critical concept; can be blocking depending on phase and teaching mode.
- `learning_opportunity`: useful optional explanation, deferrable.
Required checkpoints must not be silently bypassed. Optional ones may be deferred with traceable state.

## Example starter competencies
1. problem-framing
2. requirements-vs-implementation
3. mvp-prioritisation
4. acceptance-criteria
5. git-workflow
6. debugging-methodology
7. client-server-boundary
8. http-request-lifecycle
9. api-contracts
10. validation-and-trust-boundaries
11. authentication-vs-authorisation
12. state-management
13. relational-data-modelling
14. database-queries-and-transactions
15. error-handling
16. automated-testing
17. test-pyramid-tradeoffs
18. secrets-and-environments
19. deployment-lifecycle
20. logs-and-observability
21. architecture-tradeoffs
22. dependency-management
23. source-control-review
24. ai-generated-code-verification
25. maintenance-and-technical-debt

## Evidence types
- Explanation of actual project design (moderate evidence)
- Prediction of behaviour before execution (moderate evidence)
- Correct small change in a new context (stronger evidence)
- Debugging and identifying root cause (stronger evidence)
- Transfer to an analogous but different task (strong evidence)
- Passive reading or saying 'got it' (no competence advancement)

## Assessment principles
Assess sparingly at meaningful points; don't gate every function. Avoid leading questions that give away the answer. Teach trade-offs without pretending a single universal best architecture exists. If code is not available or explanation is inferential, say so. Do not grade confidence as fact.

## Sample competency metadata
```json
{
  "id": "backend.http-request-lifecycle",
  "title": "HTTP Request Lifecycle",
  "prerequisites": ["architecture.client-server"],
  "outcomes": [
    "Trace a request from client to API",
    "Explain methods and response status codes",
    "Identify validation boundaries"
  ],
  "triggers": ["implement-api-endpoint", "integrate-client-api"],
  "assessments": ["explain", "predict", "modify"],
  "recommendedLevel": 2
}
```
