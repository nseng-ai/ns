---
name: pi-grill-ui
description: Internal backend skill for the Pi /grill-ui extension. Supplies grill-me interview behavior while the extension supplies structured grill_ask UI instructions.
metadata:
  internal: true
---

Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

Ask the questions one at a time.

If a structured question tool such as `grill_ask` is available, use it for each user-facing question instead of asking in prose. Ask exactly one question per tool call, include your recommended answer, offer explicit affirmative choices, allow freeform input, and include an end-session choice. If the tool is unavailable, continue with one prose question at a time.

If a question can be answered by exploring the codebase, explore the codebase instead.
