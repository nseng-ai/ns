# CONTEXT-MAP

This is the entry point into the asdl repo's domain ontology. Each in-scope context owns a `CONTEXT.md` with a `Language` glossary (term, definition, `Avoid:` aliases) and a `Relationships` section; this map indexes those files, declares explicitly out-of-scope package slots, and records real cross-context edges and naming ambiguities that survived per-context canonicalization.

The map and the per-context files are produced by focused grilling/readback sessions driven by `.claude/skills/grill-with-docs` or adjacent Objectives that land conforming context sections. The format is the contract — there is no linter or generator behind it; human review is the enforcement mechanism.

## Repo-level context

- **asdl repo / Objective system** — [`CONTEXT.md`](CONTEXT.md). _Present._
  - Checked-in durable planning vocabulary: Objective, Active Objective Root, Objective Archive Root, Archived Objective, Objective Slug, Semantic Update, Tracking Gate, Objective Update, Objective Close, Objective Archive, and Closure Marker.

## In-scope package and extension contexts

The current tracked workspace has 8 Python packages with meaningful domain language plus one substantial repo-local TypeScript/Pi extension package. Each gets one `CONTEXT.md` unless explicitly parked below.

- **asdl-core** — [`packages/asdl-core/CONTEXT.md`](packages/asdl-core/CONTEXT.md). _Present._
  - The shared substrate. One file with one H2 section per logical subdomain:
    - [`## Clinkr`](packages/asdl-core/CONTEXT.md#clinkr) — operation / group / exit-envelope CLI framework. _Present._
    - [`## Git`](packages/asdl-core/CONTEXT.md#git) — git gateway: branches, refs, worktrees, patch-id, commit graphs, path-touch facts, `NonIdealState` arms. _Present._
    - [`## Gt`](packages/asdl-core/CONTEXT.md#gt) — Graphite gateway: stack metadata, trunk-scoped branch graphs, ancestors/children/descendants, `StackInfo`. _Present._
    - [`## Gh`](packages/asdl-core/CONTEXT.md#gh) — GitHub PR gateway: PR lifecycle, reviews, threads, comments, state filters. _Present._
    - [`## Top-level utilities`](packages/asdl-core/CONTEXT.md#top-level-utilities) — plugin specs, context factories, Rich console/table helpers, relative-time/state-badge rendering, Click aliases. _Present._
    - [`## Sessions`](packages/asdl-core/CONTEXT.md#sessions) — harness-neutral session facts, source adapters, privacy-preserving session summaries, and deterministic evidence aggregation. _Present._
- **@asdl/pi-extensions** — [`ts/packages/pi-extensions/CONTEXT.md`](ts/packages/pi-extensions/CONTEXT.md). _Present._
  - Repo-local Pi extension architecture: `.pi/extensions/` discovery adapters vs engineered TS implementation package, planned-branch workflow, checkpoint/new-branch flow, runner subagents, terminal presentation, and runtime CLI edges.
- **brmem** — [`packages/brmem/CONTEXT.md`](packages/brmem/CONTEXT.md). _Planned._
  - Branch-scoped durable memory: Branch Memory System, Branch Memory, Entry, Namespace, Entry Key, base vs namespaced Entries, Entry/Ref locators, snapshots, copy conflicts, export, and prompt resolution. Planned-branch terms belong to the Pi/planning layer; brmem is only the lower storage adapter for attached plans.
- **asdl-pr-address** — [`packages/asdl-pr-address/CONTEXT.md`](packages/asdl-pr-address/CONTEXT.md). _Planned._
  - PR review address book: package behavior around core `PRReviewThread`, `PRReviewComment`, `PRDiscussionComment`, reactions, feedback, thread resolution and replies. Cross-references (does not redefine) `asdl-core.gh` types; `IssueComment` is legacy command/API wording, not canonical domain language.
- **roaster** — [`packages/roaster/CONTEXT.md`](packages/roaster/CONTEXT.md). _Planned._
  - Roaster harness: renamed former review harness / `asdl-reviewer` surface; `asdl-reviewer` is not a live package slot. Covers `Roaster`, `ReviewDefinition`, review runs, harness runtime/definition/request, `ReviewCatalog`, `ReviewSource`, `ReviewFormat`, `ReviewFinding`, findings comments, inline commentability, severity, and frontmatter. Explicitly disambiguates roaster "Review" vocabulary against `gh.PRReview` and `pr-address` thread/comment vocabulary.
- **asdl-slots** — [`packages/asdl-slots/CONTEXT.md`](packages/asdl-slots/CONTEXT.md). _Planned._
  - Worktree slot manager: `SlotRecord`, `SlotInventory`, `InventoryStatus`, `RepoContext`, `SlotGcPlan`, `InitPlan`, `ResizePlan`, shell directive files, explicit `slot gt` stack operations, and `free-stack --downstack` downstack-only release.
- **asdl-objectives** — [`packages/asdl-objectives/CONTEXT.md`](packages/asdl-objectives/CONTEXT.md). _Planned._
  - Objective CLI package: Objective records, Objective status (`open`/`closed`/`in-flight`), record status, status sources, branch slices/path-touch attribution, archive/unarchive, opt-in `objective gt` stack projection, hidden exec read/runner-subagent-usage commands, and checked-in Markdown rather than brmem storage.
- **packagechk** — [`packages/packagechk/CONTEXT.md`](packages/packagechk/CONTEXT.md). _Planned._
  - Standalone package-name availability and claimability CLI: `Registry`, `CheckStatus`, `RegistryCheckResult`, `PackageCheckReport`, PyPI normalization, npm validation/scoped-name caveat, claim project specs, publish gateways, and parked Homebrew support.
- **aretro** — [`packages/aretro/CONTEXT.md`](packages/aretro/CONTEXT.md). _Planned._
  - Branch retrospective evidence CLI: `AretroCliContext`, `collect-evidence`, branch resolution sources, session query/source/warning DTOs, session summaries, aggregate metrics, `EvidenceItemDto`, deterministic evidence item kinds, and the boundary between factual evidence collection and `branch-retro` recommendation judgment.

## Out of scope

These tracked workspace packages do not get a `CONTEXT.md` under this Objective. They become follow-ons if and when live domain language lands.

- **asdl-dispatcher** — tracked CLI stub. Its dispatcher group currently has no operations (`operations=[]`), so there is no live command vocabulary to glossarize. Revisit when commands land.

Historical or absent package names are not reserved as context slots:

- **asdl-initiatives** — no tracked workspace package exists in the current ground truth (no tracked `pyproject.toml` or implementation files). Do not create or reserve a context for it unless the package is reintroduced with implementation.
- **asdl-reviewer** — historical package identity renamed to `roaster`; no live tracked package slot exists. Do not create or reserve an `asdl-reviewer` context unless that package is deliberately reintroduced as a separate tracked package.

## Relationships

Phase 4 will finalize this section after every planned per-package `CONTEXT.md` exists. Current ground truth and candidate edges must remain evidence-based — discoverable from `pyproject.toml` dependencies, source imports, checked-in extension adapters, or runtime CLI behavior — with no speculative storage or workflow links.

Current package-level facts:

- `brmem`, `asdl-pr-address`, `roaster`, `asdl-slots`, `asdl-objectives`, and `aretro` depend on `asdl-core` in `pyproject.toml` and import its subdomains in source.
- `asdl-dispatcher` also depends on `asdl-core`, but remains out of context scope while its tracked group has no operations.
- `packagechk` is standalone relative to asdl packages: its `pyproject.toml` depends on `click` only and has no `asdl-core`, `brmem`, or other asdl package dependency.
- There is no current Python package import edge between the peer in-scope packages (`brmem`, `asdl-pr-address`, `roaster`, `asdl-slots`, `asdl-objectives`, `aretro`, `packagechk`).
- There is no current `asdl-objectives → brmem` storage edge. Objectives are checked-in Markdown records read directly by `asdl-objectives`; Branch Memory remains a CLI/skill primitive rather than Objective package storage.
- `@asdl/pi-extensions` is not a Python workspace package. Its checked-in `.pi/extensions/*.ts` discovery adapters import implementation modules from `ts/packages/pi-extensions/src/` and shell out at runtime to `git`, `gt`, `gh`, `brmem`, `objective`, and `slot` where the command contract requires those tools.

Candidate edges to confirm and sharpen during package sessions:

- `brmem → asdl-core.git + asdl-core.clinkr` — repo/ref facts and clinkr CLI framework.
- `asdl-pr-address → asdl-core.gh + asdl-core.git + asdl-core.clinkr + asdl-core.plugin` — PR/review/comment types, branch-to-PR lookup, clinkr CLI framework, and standalone/plugin construction.
- `roaster → asdl-core.gh + asdl-core.git + asdl-core.clinkr + asdl-core.plugin` — PR findings-comment/inline-comment interactions, local diff facts, clinkr CLI framework, and standalone/plugin construction.
- `asdl-slots → asdl-core.git + asdl-core.gh + asdl-core.gt + asdl-core.clinkr + asdl-core.console/plugin` — worktree/repo facts, PR lifecycle facts, explicit `slot gt` stack navigation, clinkr CLI framework, and shared presentation/plugin helpers.
- `asdl-objectives → asdl-core.git + asdl-core.gt + asdl-core.clinkr + asdl-core.console/format/plugin` — deterministic branch/objective listing over git facts, the opt-in `objective gt` stack-projection edge, clinkr CLI framework, status/time rendering, and standalone/plugin construction.
- `aretro → asdl-core.sessions + asdl-core.git + asdl-core.clinkr + asdl-core.plugin` — sessions owns normalized session facts and deterministic evidence aggregation, while `aretro` owns the branch-facing CLI and JSON DTO envelope.
- `@asdl/pi-extensions → Pi runtime + git/gt/gh/brmem/objective/slot CLIs` — repo-local extension commands/tools are discovered by Pi and use external CLIs at runtime rather than Python imports.
- `packagechk` — standalone/no-`asdl-core` edge; package registry and publish gateways are package-internal boundaries around external services, not repo package dependencies.

## Flagged ambiguities

Phase 4 will finalize this section once package sessions either canonicalize collisions inside context files or deliberately preserve package-local meanings. Each entry is one line: `term — meaning chosen in this context vs. that one; resolution.` This is not a venue for open debate; entries are resolved.

Candidates to confirm or resolve during sessions:

- **Review** — `asdl-core.gh.PRReview` is a submitted review event; `asdl-pr-address` works mostly with core review threads/comments; `roaster` uses review-definition and review-run vocabulary for local harness reviews.
- **Comment** — `asdl-core.gh` distinguishes `PRReviewComment` from `PRDiscussionComment`; `asdl-pr-address` should cross-reference those terms and treat `IssueComment` as legacy/API wording when it remains in command names; `roaster` adds findings summary comments and inline comments generated from review findings.
- **State/status** — `gh.PRState` / `gh.PRStateFilter` vs `format.state_badge` rendering vs `packagechk.CheckStatus` / `PackageCheckReport.exit_code` availability outcomes vs `ObjectiveStatus` / `ObjectiveRecordStatus` / `InventoryStatus` / slot GC actions.
- **Active** — root Objective context distinguishes **Active Objective Root** from active status filters (`open` + `in-flight`); package contexts should spell out which axis they mean.
- **Branch / ref / start point / snapshot ref** — usage across `asdl-core.git`, `asdl-core.gt`, `asdl-slots`, `brmem` entry/snapshot refs, `asdl-objectives` status sources, planned-branch source/target branch terms, `aretro` branch resolution sources (`explicit`, `git_current_branch`, `detached`, `unresolved`), and session association branch facts.
- **Evidence / finding** — `asdl-core.sessions.SessionEvidenceItem` and `aretro.EvidenceItemDto` are deterministic factual observations; Objective completion evidence is narrative proof of progress or satisfied criteria; `roaster.ReviewFinding` is review feedback intended for humans/PRs. Do not collapse these into one term.
- **Plan** — Objective roadmap plans, local saved plans, planned branches, attached plans, and Branch Memory entries are separate concepts; `@asdl/pi-extensions` owns planned-branch policy while `brmem` owns generic branch-scoped text storage.

## Open question — deferred

Whether this map should link into `asdl-core`'s H2 sections individually (e.g. `Clinkr → packages/asdl-core/CONTEXT.md#clinkr`) or treat `asdl-core` as a single linked context. _Provisional answer:_ treat `asdl-core` as one linked context but name each H2 anchor inline (as above). Revisit at Phase 4 if readback shows the per-anchor links are friction or noise.
