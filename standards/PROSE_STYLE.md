# LearnBuild prose style standard

This is the single canonical source of the project's prose rules. The section below is preserved verbatim from the project owner.

## Scope and application

Apply the rules to developer-facing responses, runtime agent messages, learner-facing explanations and assessments, project documentation, source comments, generated application UI copy, errors and other human-readable text. A learner's explicitly requested tone or an existing application's terminology may be accommodated where compatible with the standard. Preserve accuracy and required technical terms. Do not apply prose restrictions to code syntax, identifiers or machine-readable formats.

All runtime roles, including the conversation router when it generates prose, the teaching mentor, architect, implementation agent, verifier and explain mode, must receive this canonical file's content in their instruction context. The application should load it from a single maintained source. A path reference alone is insufficient if an agent runs in a separate context without access to the file. Avoid duplicating or paraphrasing its rules in agent-specific prompts.

## Review expectation

Check natural language output against the full standard before returning it. Where rules conflict with factual accuracy, required literal text, or a learner's explicit request to quote or analyse text, preserve fidelity and explain when relevant. Do not silently rewrite quoted material.

---

## Prose style

Apply this to all copy, documentation, comments, and responses to
the user. This includes both in the framework, the responses from the models, any application copy etc. Write plainly and give the reader concrete information. Avoid stock
LLM phrasing and sentence shapes that manufacture emphasis through symmetry. Language should sound human regardless of where it is.

- Avoid negation pairs followed by a resolution, rhetorical antithesis
  ("not X, but Y"), and escalators ("not just X, fundamentally Y").
- Avoid definitional pivots ("X isn't about Y. It's about Z.").
- Do not write illustrative lists of three ("X, Y, or Z", "X, Y and Z"). Give
  one, two or four examples, or rewrite the sentence so it needs no list. Use
  three only when there are exactly three real options, meanings or items.
- Avoid participial tails such as ", making it easier...", ", ensuring...", and
  ", allowing..." when they append a vague benefit or repeat the main clause.
- Avoid rhetorical ranges ("from X to Y") and question-answer reveals
  ("The result? ...").
- Avoid consecutive fragments for punch, repeated sentence openings for
  emphasis, and reversed-word slogans (chiasmus).
- Avoid knowing closes ("that's exactly the point", "that's not an accident")
  and concessive setups ("Sure, X. But Y.").
- Avoid generic reassurance, inflated benefits, stock metaphors, and claims
  about how everyone or locals will react. Explain when a phrase is useful
  without promising smiles, goodwill, or instant credibility.
- Remove filler such as "a great way to", "it's worth noting", and "genuinely"
  when it adds no information. Avoid other formulaic LLM wording even when it
  is not named above.

- Avoid short paired sentences of the same shape ("Ask when X. Do Y first.").
  Use one plain sentence unless the second adds a fact the reader needs.

Passing each rule above does not make a line good. Read the finished line
aloud: if it sounds clipped, padded or like a tip card, rewrite it.

Keep necessary factual contrasts, genuine questions, and lists of actual
options. Review the surrounding copy for repeated cadence as well as individual
sentences. When revising, preserve useful facts and do not invent replacement
claims just to make the wording sound different.
