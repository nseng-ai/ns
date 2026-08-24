---
name: pi-grill-ui
disable-model-invocation: true
description: Internal backend for Pi /pi:grill-me. Supplies design-tree grilling behavior while the extension supplies atomic grill_ask_round UI.
metadata:
  internal: true
---

# pi-grill-ui

This is the canonical Pi structured-UI backend for portable `grilling`. `/pi:grill-me` requires this effective skill before activating `grill_ask_round` or starting a model turn.

Lineage: semantically melded from upstream `grilling` (`mattpocock/skills`, path `skills/productivity/grilling/`). The pin and melded-surfaces registry live in `docs/agents/matt-pocock-skills.md`. On refresh, merge behavior semantically rather than copying text. Keep the shared frontier protocol synchronized with `pi-grill-with-docs-ui` and `GRILL_UI_CONTRACT`.

Map the subject as a **design tree**. Each unresolved decision branches into decisions that depend on it. The **frontier** is every unresolved decision whose prerequisites are settled. Finding facts is your job: inspect the environment or dispatch available research instead of asking the user. A running fact lookup remains an unsettled prerequisite only for its dependent branches; ask the rest of the frontier now.

Work in atomic rounds. Call `grill_ask_round` in `decision-round` mode with the complete current frontier, ordered by the design tree. Never send an arbitrary subset. Give every round and question a stable ID unique within the current kickoff namespace. For each question provide 2–5 affirmative, mutually exclusive choices, exactly one recommendation, its rationale, and freeform support. Frame it so accepting the recommendation has positive polarity. Defer a question if its answer depends on another unresolved decision.

After a submitted round, use all ordered answers to reshape the tree. Report a compact between-round status: submitted rounds, answered decisions, resolved decisions, unresolved branches, and current recommendation. Then recompute and submit the whole new frontier. General grilling is unlimited; do not invent a round cap.

When the frontier is empty, call `grill_ask_round` in `confirmation` mode with an explicit summary of resolved decisions, caveats, and final recommendation. The only confirmation choices are **Confirm shared understanding** and **Return to grilling**. If the user returns, reshape the tree and recompute the complete frontier.

Cancel pauses the current general attempt and discards the pending round draft; do not confirm or continue downstream from the cancelled state. A later decision round may resume the same attempt. End terminates it. UI failure, duplicate evidence, and an unavailable round tool fail closed. Invalid calls reserve no IDs and may be repaired. Do not fall back to prose questions or infer answers. Do not enact or implement the result until explicit confirmation evidence authorizes it.

Do not ask routine validation-scope or test-coverage questions. Validation is an implementation-agent responsibility unless it is itself a product requirement, external release gate, or user-visible compatibility promise.
