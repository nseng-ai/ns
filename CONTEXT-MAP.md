# CONTEXT-MAP

This is the entry point into the asdl repo's domain ontology. Each in-scope package owns a `CONTEXT.md` with a `Language` glossary (term, definition, `Avoid:` aliases) and a `Relationships` section; this map indexes those files, declares which packages are explicitly out of scope, and (once finalized) records the real cross-package edges and any cross-context naming ambiguities that survived per-package canonicalization.

The map and the per-package files are produced by focused grilling sessions driven by `.claude/skills/grill-with-docs`. The format is the contract — there is no linter or generator behind it; human review is the enforcement mechanism.

## In-scope contexts

The asdl repo has 6 packages with meaningful domain language. Each gets one `CONTEXT.md`:

- **asdl-core** — `packages/asdl-core/CONTEXT.md`
  - The shared substrate. One file with one H2 section per logical subdomain:
    - [`## Clinkr`](packages/asdl-core/CONTEXT.md#clinkr) — operation / group / exit-envelope CLI framework. _Present._
    - `## Git` — git gateway: branches, refs, worktrees, patch-id, `NonIdealState` arms. _Planned._
    - `## Gt` — Graphite gateway: stack metadata, ancestors/children/descendants, `StackInfo`. _Planned._
    - `## Gh` — GitHub gateway: PRs, reviews, threads, comments, state filters. _Planned._
    - `## Top-level utilities` — `plugin.py`, `console.py`, `format.py`, `click_utils.py`. _Planned._
- **brmem** — `packages/brmem/CONTEXT.md`. _Planned._
  - Branch-scoped durable memory: `Entry`, `Namespace`, `EntryKey`, `RefLayout`, snapshots, prompt resolution.
- **asdl-pr-address** — `packages/asdl-pr-address/CONTEXT.md`. _Planned._
  - PR review address book: `ReviewThread`, `ReviewComment`, `DiscussionComment`, `IssueComment`, `Reaction`, `Feedback`. Cross-references (does not redefine) `asdl-core.gh` types.
- **asdl-reviewer** — `packages/asdl-reviewer/CONTEXT.md`. _Planned._
  - Reviewer harness: `Reviewer`, `ReviewDefinition`, `HarnessAdapter`, `Finding`, `InlineCommentability`, severity. Explicitly disambiguates `Review` against `gh.PRReview` and `pr-address.ReviewThread`.
- **asdl-slots** — `packages/asdl-slots/CONTEXT.md`. _Planned._
  - Worktree slot manager: `SlotRecord`, `SlotInventory`, `InventoryStatus`, `RepoContext`, `SlotGcPlan`, `InitPlan`, `ResizePlan`.
- **asdl-objectives** — `packages/asdl-objectives/CONTEXT.md`. _Planned._
  - Objective lifecycle: `Objective`, `ObjectiveListEntry`, `ObjectiveRecord`, `exec` group conventions.

## Out of scope

These packages exist in `packages/` but do not get a `CONTEXT.md` under this Objective. Both are stubs today; they become follow-ons if and when live domain language lands.

- **asdl-dispatcher** — CLI stub. No live operations to glossarize. Revisit when commands land.
- **asdl-initiatives** — empty namespace package. Revisit when an implementation lands.

## Relationships

_To be populated in Phase 4, once per-package `CONTEXT.md` files exist._

This section will record concrete cross-package edges discoverable from `pyproject.toml` dependencies or runtime imports — no speculative connections. Expected edges include (subject to confirmation during the sweep):

- `asdl-objectives → brmem` (storage)
- `asdl-pr-address → asdl-core.gh` (PR / review / comment types)
- `asdl-reviewer → asdl-core.gh`, `asdl-core.gt` (PR + stack context)
- `asdl-slots → asdl-core.git`, `asdl-core.gh` (worktree + repo facts)
- _All in-scope packages_ `→ asdl-core.clinkr` (CLI framework)

## Flagged ambiguities

_To be populated in Phase 4, once per-package `CONTEXT.md` files exist._

This section captures cross-context naming collisions that could not be canonicalized to a single term across packages and instead live with documented boundaries. Each entry is one line: `term — meaning chosen in this context vs. that one; resolution.` This is not a venue for open debate; entries are resolved.

Candidates known at scaffold time (to confirm or resolve during sessions):

- **Review** — used differently in `asdl-core.gh` (`PRReview` = a single review submission), `asdl-pr-address` (`ReviewThread` = a conversation), and `asdl-reviewer` (a `Reviewer` runs a `ReviewDefinition`).
- **Comment** — `PRReviewComment` vs `IssueComment` vs `DiscussionComment` vs `ReviewComment` across `gh` and `pr-address`.
- **State** — `gh.PRState` / `gh.PRStateFilter` vs `format.state_badge` rendering.
- **Branch / ref / start_point** — usage across `asdl-core.git`, `asdl-core.gt`, and `asdl-slots`.

## Open question — deferred

Whether this map should link into `asdl-core`'s H2 sections individually (e.g. `Clinkr → packages/asdl-core/CONTEXT.md#clinkr`) or treat `asdl-core` as a single linked context. _Provisional answer:_ treat `asdl-core` as one linked context but name each H2 anchor inline (as above). Revisit at Phase 4 if readback shows the per-anchor links are friction or noise.
