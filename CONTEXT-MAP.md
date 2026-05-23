# CONTEXT-MAP

This is the entry point into the asdl repo's domain ontology. Each in-scope package owns a `CONTEXT.md` with a `Language` glossary (term, definition, `Avoid:` aliases) and a `Relationships` section; this map indexes those files, declares which packages are explicitly out of scope, and records the real cross-package edges and any cross-context naming ambiguities that survived per-package canonicalization.

The map and the per-package files are produced by focused grilling sessions driven by `.claude/skills/grill-with-docs`. The format is the contract — there is no linter or generator behind it; human review is the enforcement mechanism.

## Repo-level context

- **asdl repo / Objective system** — [`CONTEXT.md`](CONTEXT.md). _Present._
  - Checked-in durable planning vocabulary: Objective, Objective Slug, Semantic Update, Tracking Gate, Objective Update, Objective Close, and Closure Marker.

## In-scope package contexts

The current tracked workspace has 7 packages with meaningful domain language. Each gets one `CONTEXT.md`:

- **asdl-core** — [`packages/asdl-core/CONTEXT.md`](packages/asdl-core/CONTEXT.md)
  - The shared substrate. One file with one H2 section per logical subdomain:
    - [`## Clinkr`](packages/asdl-core/CONTEXT.md#clinkr) — operation / group / exit-envelope CLI framework. _Present._
    - [`## Git`](packages/asdl-core/CONTEXT.md#git) — git gateway: branches, refs, worktrees, patch-id, `NonIdealState` arms. _Present._
    - `## Gt` — Graphite gateway: stack metadata, ancestors/children/descendants, `StackInfo`. _Planned._
    - `## Gh` — GitHub gateway: PRs, reviews, threads, comments, state filters. _Planned._
    - `## Top-level utilities` — `plugin.py`, `console.py`, `format.py`, `click_utils.py`. _Planned._
- **brmem** — [`packages/brmem/CONTEXT.md`](packages/brmem/CONTEXT.md). _Planned._
  - Branch-scoped durable memory: `Entry`, `Namespace`, `EntryKey`, `RefLayout`, snapshots, prompt resolution.
- **asdl-pr-address** — [`packages/asdl-pr-address/CONTEXT.md`](packages/asdl-pr-address/CONTEXT.md). _Planned._
  - PR review address book: `ReviewThread`, `ReviewComment`, `DiscussionComment`, `IssueComment`, `Reaction`, `Feedback`. Cross-references (does not redefine) `asdl-core.gh` types.
- **asdl-reviewer** — [`packages/asdl-reviewer/CONTEXT.md`](packages/asdl-reviewer/CONTEXT.md). _Planned._
  - Reviewer harness: `Reviewer`, `ReviewDefinition`, `HarnessAdapter`, `Finding`, `InlineCommentability`, severity. Explicitly disambiguates `Review` against `gh.PRReview` and `pr-address.ReviewThread`.
- **asdl-slots** — [`packages/asdl-slots/CONTEXT.md`](packages/asdl-slots/CONTEXT.md). _Planned._
  - Worktree slot manager: `SlotRecord`, `SlotInventory`, `InventoryStatus`, `RepoContext`, `SlotGcPlan`, `InitPlan`, `ResizePlan`.
- **asdl-objectives** — [`packages/asdl-objectives/CONTEXT.md`](packages/asdl-objectives/CONTEXT.md). _Planned._
  - Objective lifecycle: `Objective`, `ObjectiveListEntry`, `ObjectiveRecord`, `exec` group conventions, checked-in Markdown records.
- **packagechk** — [`packages/packagechk/CONTEXT.md`](packages/packagechk/CONTEXT.md). _Planned._
  - Standalone package-name availability and claimability CLI: `Registry`, `CheckStatus`, `RegistryCheckResult`, `PackageCheckReport`, PyPI normalization, npm validation/scoped-name caveat, claim project specs, publish gateways, and parked Homebrew support.

## Out of scope

These tracked workspace packages do not get a `CONTEXT.md` under this Objective. They become follow-ons if and when live domain language lands.

- **asdl-dispatcher** — tracked CLI stub. Its dispatcher group currently has no operations (`operations=[]`), so there is no live command vocabulary to glossarize. Revisit when commands land.

Historical or absent package names are not reserved as context slots:

- **asdl-initiatives** — no tracked workspace package exists in the current ground truth (no tracked `pyproject.toml` or implementation files). Do not create or reserve a context for it unless the package is reintroduced with implementation.

## Relationships

Phase 4 will finalize this section after every per-package `CONTEXT.md` exists. Current ground truth and candidate edges must remain evidence-based — discoverable from `pyproject.toml` dependencies, source imports, or runtime behavior — with no speculative storage or workflow links.

Current package-level facts:

- `brmem`, `asdl-pr-address`, `asdl-reviewer`, `asdl-slots`, and `asdl-objectives` depend on `asdl-core` in `pyproject.toml` and import its subdomains in source.
- `packagechk` is standalone relative to asdl packages: its `pyproject.toml` depends on `click` only and has no `asdl-core`, `brmem`, or other asdl package dependency.
- There is no current `asdl-objectives → brmem` storage edge. Objectives are checked-in Markdown records read directly by `asdl-objectives`; Branch Memory remains a CLI/skill primitive rather than Objective package storage.

Candidate edges to confirm and sharpen during package sessions:

- `brmem → asdl-core.git + asdl-core.clinkr` — repo/ref facts and clinkr CLI framework.
- `asdl-pr-address → asdl-core.gh + asdl-core.git + asdl-core.clinkr` — PR/review/comment types, branch-to-PR lookup, and clinkr CLI framework.
- `asdl-reviewer → asdl-core.gh + asdl-core.git + asdl-core.clinkr` — PR/inline-comment interactions, local diff facts, and clinkr CLI framework.
- `asdl-slots → asdl-core.git + asdl-core.gh + asdl-core.gt + asdl-core.clinkr` — worktree/repo facts, PR lifecycle facts, explicit `slot gt` stack navigation, and clinkr CLI framework.
- `asdl-objectives → asdl-core.git + asdl-core.clinkr` — deterministic branch/objective listing over git facts and clinkr CLI framework.
- `packagechk` — standalone/no-`asdl-core` edge; package registry and publish gateways are package-internal boundaries around external services, not repo package dependencies.

## Flagged ambiguities

Phase 4 will finalize this section once package sessions either canonicalize collisions inside context files or deliberately preserve package-local meanings. Each entry is one line: `term — meaning chosen in this context vs. that one; resolution.` This is not a venue for open debate; entries are resolved.

Candidates to confirm or resolve during sessions:

- **Review** — used differently in `asdl-core.gh` (`PRReview` = a single review submission), `asdl-pr-address` (`ReviewThread` = a conversation), and `asdl-reviewer` (a `Reviewer` runs a `ReviewDefinition`).
- **Comment** — `PRReviewComment` vs `IssueComment` vs `DiscussionComment` vs `ReviewComment` across `gh` and `pr-address`.
- **State/status** — `gh.PRState` / `gh.PRStateFilter` vs `format.state_badge` rendering vs `packagechk.CheckStatus` / `PackageCheckReport.exit_code` availability outcomes.
- **Branch / ref / start_point** — usage across `asdl-core.git`, `asdl-core.gt`, and `asdl-slots`.

## Open question — deferred

Whether this map should link into `asdl-core`'s H2 sections individually (e.g. `Clinkr → packages/asdl-core/CONTEXT.md#clinkr`) or treat `asdl-core` as a single linked context. _Provisional answer:_ treat `asdl-core` as one linked context but name each H2 anchor inline (as above). Revisit at Phase 4 if readback shows the per-anchor links are friction or noise.
