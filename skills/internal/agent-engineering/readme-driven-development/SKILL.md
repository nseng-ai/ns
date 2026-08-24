---
name: readme-driven-development
disable-model-invocation: true
description: Develop a feature or system README-first — draft, grill, and settle a user-facing README as the canonical design contract before implementation.
---

# readme-driven-development

Write the README before the software. The README is the canonical, exclusively user-facing contract: it describes the system as if it already exists — what a user sees, runs, and reads — never internal tasks or agent notes.

<!-- Lineage: Grill step operationally adapted from upstream grilling (mattpocock/skills, upstream path skills/productivity/grilling/); pin + melded-surfaces registry: docs/agents/matt-pocock-skills.md -->

## Loop

1. **Draft or read.** Locate the canonical README; draft one if missing. Write it as the finished product's documentation.
2. **Grill.** Use the effective canonical `grilling` skill when it is available; it owns the design-tree interview, whole-frontier rounds, question format, recommendations, and shared-understanding gate. This skill adds the README-specific subject and completion bound: resolve every unsettled decision the README exposes until it has no contradictions or silently invented commitments and tells a clear user-facing story. Explore the codebase instead of asking when the answer is discoverable. If `grilling` is unavailable, preserve those same properties with numbered prose rounds.
3. **Settle.** Fold answers back into the README. Edit obvious clarity and structure problems directly; ask before resolving contradictions, changing scope, or adding new commitments.
4. **Report.** End with a concise pass report: README path, decisions settled, questions still open or deferred, supporting documents touched, recommended next action.

## Rules

- **The README is canonical.** Supporting documents may hold rationale, examples, and research, but a decision counts as settled only when it appears in — or is explicitly linked from — the README.
- **Coherence, not completeness, is the bar.** A pass is done when the README reads as believable product documentation; open questions may remain as long as they are visible in the README.
- **Execution state lives elsewhere.** Track slices, status, and tasks outside the README (roadmap, tracker); the README stays what a user would read.
