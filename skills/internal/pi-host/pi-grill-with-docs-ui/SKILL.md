---
name: pi-grill-with-docs-ui
disable-model-invocation: true
description: Internal backend for Pi /pi:grill-with-docs. Supplies docs-aware design-tree grilling while the extension supplies atomic grill_ask_round UI.
metadata:
  internal: true
---

# pi-grill-with-docs-ui

This is the canonical Pi structured-UI backend for portable `grilling` plus `domain-modeling`. `/pi:grill-with-docs` requires this effective skill before activating `grill_ask_round` or starting a model turn.

<!-- Lineage: semantically melded from upstream grilling + domain-modeling (mattpocock/skills, paths skills/productivity/grilling/ and skills/engineering/domain-modeling/); pin + registry: docs/agents/matt-pocock-skills.md. Keep the shared frontier protocol synchronized with pi-grill-ui and GRILL_UI_CONTRACT. -->

## Docs-first preflight

Before the first round, do a bounded pass:

1. Use `CONTEXT-MAP.md`, if present, to route domain language.
2. Read the root and relevant nested `CONTEXT.md` files.
3. Read relevant ADRs under `docs/adr/`, including context ADR directories identified by the map or subject.
4. Inspect code when the subject names an area or a current-behavior claim needs verification.

Finding facts is your job. During planning, retain proposed vocabulary in the plan or discussion. Do not update `CONTEXT.md` before corresponding code or other authoritative ground truth changes. Documentation-only corrections may repair drift from already-existing ground truth.

## Complete-frontier rounds

Map the subject as a **design tree**. The **frontier** is every unresolved decision whose prerequisites are settled. A running fact lookup remains an unsettled prerequisite only for dependent branches; ask the rest now.

Call `grill_ask_round` in `decision-round` mode with the complete current frontier, ordered by the tree. Never send an arbitrary subset. Use stable attempt-scoped round and question IDs. Each question has 2–5 affirmative, mutually exclusive choices, exactly one recommendation, a rationale, and freeform support. Frame it so accepting the recommendation has positive polarity. Defer decisions that depend on an unresolved answer.

After each submitted round, use all ordered answers to reshape the tree and report:

- submitted rounds and answered decisions;
- resolved decisions, unresolved branches, and current recommendation;
- `Documentation updates:` proposed vocabulary retained in discussion, synchronized `CONTEXT.md` corrections, ADRs created or offered, or `none yet`.

Then recompute and submit the whole new frontier. General grilling is unlimited.

When the frontier is empty, report `Documentation updates:` again, then call `grill_ask_round` in `confirmation` mode with an explicit summary of resolved decisions, caveats, final recommendation, and documentation disposition. The only choices are **Confirm shared understanding** and **Return to grilling**. Returning reshapes the tree and requires a newly computed complete frontier.

Cancel pauses the current general attempt and discards the pending round draft; do not confirm, write docs, or continue downstream from the cancelled state. A later decision round may resume the same attempt. End terminates it. UI failure, duplicate evidence, and an unavailable round tool fail closed. Invalid calls reserve no IDs and may be repaired. Do not fall back to prose questions or infer answers. Explicit confirmation evidence is required.

## Domain-modeling discipline

Challenge glossary conflicts immediately and sharpen fuzzy language into canonical terms. Keep `CONTEXT.md` glossary-only: concise definitions and `_Avoid_:` aliases, not implementation details, specs, scratch notes, or future declarations. Stress-test relationships with concrete scenarios and verify claims against code.

Offer an ADR only when the decision is hard to reverse, surprising without context, and a real trade-off. ADRs live under `docs/adr/` and can be concise.

Do not ask routine validation-scope or test-coverage questions unless validation is itself a product requirement, external release gate, or user-visible compatibility promise.
