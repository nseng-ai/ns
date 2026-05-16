# Repo Ontology and CONTEXT-MAP

## Thesis

The asdl monorepo has rich domain language spread across 7 active packages and the multi-subpackage `asdl-core`, but no shared glossary or map. The Clinkr H2 section of `packages/asdl-core/CONTEXT.md` (commit `8de0a295`) showed that the `grill-with-docs` skill produces high-signal glossaries; the next improvement is to run the same workflow across every package with meaningful domain language and tie them together with a root `CONTEXT-MAP.md`.

The outcome: a contributor or agent landing on the repo can navigate the asdl ontology from a single entry point, with cross-context naming collisions (Review/Comment/Feedback, State variants, branch/ref usage) explicitly flagged rather than buried in source.

## Scope

A whole-repo grilling and documentation sweep, sequenced bottom-up by dependency depth so vocabulary established earlier flows into later sessions:

- Phase 0 — Scaffold `/CONTEXT-MAP.md` with a planned-contexts list and an explicit "Out of scope" note for `asdl-dispatcher` (CLI stub) and `asdl-initiatives` (empty namespace).
- Phase 1 — Finish `packages/asdl-core/CONTEXT.md` by appending H2 sections for `Git`, `Gt`, `Gh`, and `Top-level utilities` in that order, alongside the existing `Clinkr` section.
- Phase 2 — Create `packages/brmem/CONTEXT.md`. brmem is a foundational primitive used by other plugins; landing its vocabulary first lets later sessions reference it canonically.
- Phase 3 — Create per-package `CONTEXT.md` for `asdl-pr-address`, `asdl-reviewer`, `asdl-slots`, and `asdl-objectives`. These are peers in dependency depth; ordering within Phase 3 surfaces the cross-package "Review"/"Comment" overload early.
- Phase 4 — Finalize `/CONTEXT-MAP.md`: populate the Relationships section with concrete cross-package import/runtime edges discovered during sessions, and add a top-level "Flagged ambiguities" section for cross-context naming collisions.

Each phase is one or more focused grilling sessions driven by `.claude/skills/grill-with-docs`, conducted across separate user turns. The Objective spans ~9 grilling sessions plus the Phase 0 scaffold and Phase 4 finalize.

## Non-Goals

- Do not split `asdl-core` into per-subpackage `CONTEXT.md` files. Keep it as a single file with H2 sections; revisit only if a labs subpackage graduates.
- Do not create `CONTEXT.md` for `asdl-dispatcher` (CLI stub, no live operations) or `asdl-initiatives` (empty namespace). They are explicit skips, noted in the map.
- Do not produce ADRs unless the `grill-with-docs` three-criteria bar fires (hard to reverse, surprising without context, real trade-off). Expect 0–2 ADRs total across all sessions.
- Do not edit production Python code as part of this Objective. The work is documentation/ontology only.
- Do not auto-generate glossaries from source or AST analysis. The value is in human-led grilling that surfaces ambiguity and forces canonical choices.
- Do not introduce a documentation generator, lint check, or CI gate for `CONTEXT.md` shape. The skill's format is the contract; enforcement is human review.

## Completion Criteria

- `/CONTEXT-MAP.md` exists at repo root, lists all 6 in-scope contexts (`asdl-core` plus the 5 plugin packages) with active links, includes explicit "Out of scope" notes for `asdl-dispatcher` and `asdl-initiatives`, and contains a populated Relationships section reflecting real import edges discoverable from `pyproject.toml` or source.
- `packages/asdl-core/CONTEXT.md` contains H2 sections for `Clinkr`, `Git`, `Gt`, `Gh`, and `Top-level utilities`. Each section follows the Clinkr pattern: Language entries with `Avoid:` aliases, followed by Relationships.
- Each of `packages/brmem/CONTEXT.md`, `packages/asdl-pr-address/CONTEXT.md`, `packages/asdl-reviewer/CONTEXT.md`, `packages/asdl-slots/CONTEXT.md`, and `packages/asdl-objectives/CONTEXT.md` exists with Language and Relationships sections.
- Cross-context naming collisions surfaced during sessions (the "Review" overload across `gh` / `pr-address` / `reviewer`, "State" usage in `gh` vs `format.state_badge`, branch/ref usage across `git`/`gt`/`slots`) are either resolved identically across files or recorded in the map's "Flagged ambiguities" section.
- Readback test: an unfamiliar contributor can open `/CONTEXT-MAP.md`, navigate to any listed context, and explain back its key terms and `Avoid:` aliases without opening the source files.
- Every relationship listed in `/CONTEXT-MAP.md` corresponds to a real import edge or runtime interaction — no speculative connections.

## Assumptions and Risks

Assumptions:

- The `grill-with-docs` skill's output shape (Language entries with `Avoid:` aliases, Relationships subsection, optional Flagged ambiguities) is the right format. We are not inventing a new convention.
- `asdl-core`'s labs subpackages (`clinkr`, `gh`, `git`, `gt`) will not graduate to standalone packages during this Objective, so keeping them as H2 sections in one file is stable.
- `asdl-dispatcher` and `asdl-initiatives` stay stub-shaped for the duration of this Objective; if either gains real domain language mid-sweep, its CONTEXT.md becomes a follow-on, not a blocker for closure.
- Bottom-up dependency ordering will let vocabulary established earlier flow forward into later sessions. If a later session forces a rename in an earlier section, those edits are cheap because Markdown is the only artifact.
- A 9-session sweep is acceptable across many user turns. This is not a single-session deliverable.
- The `grill-with-docs` ADR criteria (hard to reverse, surprising, real trade-off) are correctly tuned. Most sessions will produce zero ADRs and that is the expected outcome.

Risks:

- Grilling appetite drops mid-sweep, leaving partial `CONTEXT.md` files. Mitigation: each session is self-contained — a partial Objective still leaves correct glossaries for the packages already done, and closure can be deferred without rework on earlier files.
- Cross-context naming collisions discovered late may force edits in earlier files. Mitigation: bottom-up ordering minimizes this; revisiting a closed H2 section is straightforward Markdown editing and does not invalidate the rest of the work.
- The repo's domain language drifts as packages add new concepts after their sessions close. Mitigation: out of scope for this Objective; flag as future work in a closure note.
- A future `asdl-core` subpackage graduation could orphan its H2 section. Mitigation: the graduation process owns splitting the section into its own `CONTEXT.md` as part of the move; not a blocker today.
- "Flagged ambiguities" entries could grow into unresolved-debate noise. Mitigation: each entry is one line and resolved (term: meaning chosen, alternatives listed); never a venue for open argument.
- A grilling session could devolve into source-code archaeology rather than language-sharpening. Mitigation: the skill's `<what-to-do>` block already constrains this — questions one at a time, answered by code lookup when possible, written into `CONTEXT.md` inline as they resolve.

## Open Questions

- Should `/CONTEXT-MAP.md` link into `asdl-core`'s H2 sections individually (e.g. `Clinkr → packages/asdl-core/CONTEXT.md#clinkr`), or treat `asdl-core` as a single linked context? — _Provisional answer at Phase 0 scaffold:_ treat `asdl-core` as one linked context but name each H2 anchor inline next to the link. Revisit at Phase 4 readback if per-anchor naming proves noisy or insufficient.
- When a cross-context ambiguity is severe (e.g. "Review" used differently in `gh`, `pr-address`, and `reviewer`), is the right response to canonicalize a single name across packages, or to keep package-local names with the boundary documented?
- Once the sweep is done, what is the maintenance cadence — opportunistic on PRs that touch domain code, or a periodic re-grilling cycle?
