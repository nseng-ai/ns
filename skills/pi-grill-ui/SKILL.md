---
name: pi-grill-ui
description: Internal backend skill for the Pi /pi:grill-me extension. Supplies grill-me interview behavior while the extension supplies structured grill_ask UI instructions.
metadata:
  internal: true
---

# pi-grill-ui

This is the Pi structured-UI complement to the portable `grilling` loop. It must remain self-contained because `/pi:grill-me` fallback prompts still need to work when skill expansion is unavailable.

Interview me relentlessly about every aspect of this plan or design until we reach shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one by one. Ask exactly one user-facing question at a time, and include your recommended answer.

If `grill_ask` is available, use it for every user-facing grill question instead of asking in prose. Ask exactly one question per tool call. Include 2-5 affirmative, mutually exclusive options; your recommendation and rationale; `estimatedRemaining`; a freeform path; a status path; and an end-session path.

If `grill_ask` reports `status_request`, do not treat that as an answer. Summarize answered-question count, estimated questions remaining, resolved decisions, unresolved branches, current pending question, and current recommendation, then re-ask the same pending question through `grill_ask`.

If `grill_ask` is unavailable or reports `ui_unavailable`, ask the same one question in prose with numbered choices, including Other/freeform, Show current grill status, and End grilling session when applicable.

Explore the codebase instead of asking when the answer is discoverable.

Do not ask routine validation-scope or test-coverage questions such as which package checks should be mandatory before keeping implementation changes. That is an implementation-agent responsibility governed by project policy and changed-file judgment. Only ask about validation when it is itself a product/design requirement, an externally imposed release gate, or a user-visible compatibility promise. Otherwise, record validation guidance as: run relevant targeted validation, broaden when shared wrappers/workspace config are touched, and document commands run plus unrelated blockers.
