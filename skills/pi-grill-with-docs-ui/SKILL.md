---
name: pi-grill-with-docs-ui
description: Internal backend skill for the Pi /pi:grill-with-docs extension. Supplies docs-aware grill-with-docs behavior while the extension supplies structured grill_ask UI instructions.
metadata:
  internal: true
---

# pi-grill-with-docs-ui

This is the Pi structured-UI complement to portable `grilling` plus `domain-modeling`. It must remain self-contained because `/pi:grill-with-docs` fallback prompts still need to work when skill expansion is unavailable.

Interview me relentlessly about every aspect of this plan or design until we reach shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one by one. Ask exactly one user-facing question at a time, and include your recommended answer.

If `grill_ask` is available, use it for every user-facing grill question instead of asking in prose. Ask exactly one question per tool call. Include 2-5 affirmative, mutually exclusive options; your recommendation and rationale; `estimatedRemaining`; a freeform path; a status path; and an end-session path.

If `grill_ask` reports `status_request`, do not treat it as an answer. Give the compact status report, include the `Documentation updates:` line described below, then re-ask the same pending question through `grill_ask`.

If `grill_ask` is unavailable or reports `ui_unavailable`, ask the same one question in prose with numbered choices, including Other/freeform, Show current grill status, and End grilling session when applicable.

## Bounded docs-first preflight

Before the first user-facing question, do a bounded exploration pass:

1. Check `CONTEXT-MAP.md` if present to route to the relevant domain language.
2. Check the root `CONTEXT.md` and any relevant nested `CONTEXT.md` identified by the map or by the plan's named area.
3. Check relevant ADRs under `docs/adr/`, including nested context ADR directories when the map or plan points to them.
4. Inspect code only when the plan names a concrete area, or when a user claim or documented claim needs verification.

Explore the codebase instead of asking when the answer is discoverable. Create documentation lazily only when there is something specific to write.

Do not ask routine validation-scope or test-coverage questions such as which package checks should be mandatory before keeping implementation changes. That is an implementation-agent responsibility governed by project policy and changed-file judgment. Only ask about validation when it is itself a product/design requirement, an externally imposed release gate, or a user-visible compatibility promise. Otherwise, record validation guidance as: run relevant targeted validation, broaden when shared wrappers/workspace config are touched, and document commands run plus unrelated blockers.

## During the session

Challenge terminology against the glossary immediately. If the glossary defines a term one way and the plan appears to use it another way, surface the conflict and ask which meaning should win.

Sharpen fuzzy or overloaded language into canonical project terms. When a term resolves, update the relevant `CONTEXT.md` inline instead of batching the change.

Keep `CONTEXT.md` a glossary only: one or two sentence definitions of project-specific concepts, with `_Avoid_:` lines for rejected synonyms. Do not add implementation details, specs, scratch notes, or decision records to `CONTEXT.md`.

Stress-test domain relationships with concrete scenarios and edge cases. When claims about current behavior are checkable, cross-reference the code and surface contradictions.

Offer ADR creation sparingly and explicitly. Only offer an ADR when all three are true: the decision is hard to reverse, surprising without context, and the result of a real trade-off. ADRs live under `docs/adr/`, are numbered `0001-slug.md`, `0002-slug.md`, and can be as small as a title plus a one-to-three sentence context/decision/why paragraph.

## Docs-aware status checkpoints

When `grill_ask` returns `status_request`, include a compact status report with the normal grill status fields — answered-question count, estimated questions remaining, resolved decisions, unresolved branches, current pending question, and current recommendation — plus:

`Documentation updates:` summarize `CONTEXT.md` edits made, ADRs created or offered, or say `none yet`.

After the status report, re-ask the exact same pending question with `grill_ask`; do not advance and do not count the status request as an answer.
