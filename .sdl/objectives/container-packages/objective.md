# Container Packages

## Thesis

The workspace should stop paying per-published-package overhead to keep architectural discipline. A **subpackage** is a package-like architecture unit inside a published package: rooted at `src/<name>/`, declared in the package manifest at `sdl.subpackages`, owning its own import boundary and topology circle, and free to expose multiple subpath exports (for example `./time` and `./time/testing` both belong to the `time` subpackage). A **container package** is a published package whose goal in life is to contain subpackages; it is **properly formed** when all of its code is associated with one of its subpackages — no loose root source. The published package remains the distribution unit; the subpackage becomes the architecture unit.

Conversion has an explicit in-between state: a package may declare a **remainder subpackage** — the unit holding all code not yet in a named subpackage. Membership in the remainder is implicit (everything unclaimed), but its existence is explicitly declared as a dedicated manifest field, `sdl.remainder: true`, beside `sdl.subpackages`. Sentinel entries inside the subpackage list (`"."` or named placeholders) were considered and rejected as too implicit. A package is properly formed exactly when it declares no remainder; graduation is deleting the `remainder` line. Lightweight rules-of-the-road tooling (the TypeScript style guard) enforces whichever state is declared.

This Objective defines and documents that vocabulary, pilots it with `@sdl/core` declaring `subpackages: ["time"]` plus `remainder: true`, makes an upfront per-package decision inventory (containerize with a proposed subpackage split, or keep flat with rationale), and then converts the codebase package by package through autonomous execution once the inventory is approved.

## Scope

- Canonical vocabulary: **Subpackage**, **Container package**, **Remainder subpackage**, and the properly-formed rule as root `CONTEXT.md` headwords with Avoid lists; reconcile the existing **Topology circle** entry (its "source component" phrasing) and confirm no conflict with the **Published package** Avoid list.
- An ADR recording the container-package end state and `sdl.subpackages` as the manifest source of truth (topology circles stay presentation).
- Manifest config: `sdl.subpackages` beside `sdl.tier`, consumed by both the architecture topology overlay (`skills/architecture-topology-report/scripts/extract-graph.mjs`) and the TypeScript style guard, replacing auto-discovery of `src/<dir>/` circles.
- The pilot: branch `core-time-topology-circle-consolidation` / PR #2677, renaming the in-flight `sdl.topologyCircles` config to `sdl.subpackages` with `@sdl/core` declaring `["time"]`.
- Rules-of-the-road tooling in the style guard: every source file in a declaring package must belong to a declared unit (a named subpackage directory, or the remainder when declared); named subpackages must exist as `src/<name>/` directories; a package with no remainder declaration fails on any unassociated code (properly formed).
- The upfront decision inventory covering every workspace package, reviewed and approved by the user in one pass before autonomous conversion begins.
- Autonomous per-package conversion slices executing approved inventory rows.

## Non-Goals

- Creating new published packages, or splitting container packages back into many published packages.
- Changing Package Tier semantics; subpackages inherit their container's tier for now.
- Redesigning the topology report beyond consuming `sdl.subpackages`.
- Registries, frontmatter, or hidden state; the manifest field plus guard plus report are the whole mechanism.
- Landing or merging PRs; landing stays human.

## Completion Criteria

- Vocabulary documented: `CONTEXT.md` headwords for Subpackage and Container package exist, the Topology circle entry is reconciled, and the end-state ADR is recorded.
- `sdl.subpackages` is the single config both the topology report and the style guard read; convention-based auto-discovery of directory circles is gone.
- The decision inventory is complete and approved: every workspace package has an explicit recorded containerize or keep-flat decision.
- Every containerize-decided package is converted and properly formed, enforced by the style guard.
- Every keep-flat decision carries recorded rationale.

## Definition of Progress

Progress is keepable when:

- A conversion slice implements exactly its approved inventory row, `just` passes, and the work sits on a feature branch or submitted PR.
- A documentation slice lands the agreed vocabulary without inventing new terms.
- Guard or report changes keep existing package-tier enforcement intact while narrowing circle discovery to declared subpackages.

Do not keep changes that:

- Convert a package with no recorded decision, or contradict its recorded decision.
- Add code to a declaring package that belongs to no declared unit, or reintroduce a remainder declaration to a properly formed container.
- Weaken tier enforcement or guard coverage as a side effect of conversion.

Useful evidence includes: style-guard test runs, topology report node counts before/after, and per-package PR links.

## Runner Policy

This Objective is execution-friendly for `objective-next` and autonomous pursuit under the boundaries below. Decision-making is front-loaded by design: the approved decision inventory is the execution permission for conversion slices.

- Direct execution is allowed when: a roadmap row's per-package decision is recorded and approved — including moving files under subpackage directories, updating imports/exports, editing `package.json` `sdl` config, and updating guard/report code and tests to match.
- Steer or ask first when: a package has no recorded decision; code reality contradicts the approved split; a slice would change vocabulary (`CONTEXT.md`, ADRs) beyond the documentation slice; or a whole-package rename, deletion, or fold is implied.
- How work may change files and be left: feature branches only (never `main`/`master`), one package or one coherent group per slice; the runner may create branches, commit, and submit PRs via Graphite (`gt`) for human review.
- Validation before keeping work: `just` passes; targeted style-guard and topology-report checks for the affected package.
- What will not happen unless explicitly requested: landing/merging PRs, publishing, external writes beyond Graphite/GitHub PR submission, edits to other Objectives, or archive/lifecycle changes to this Objective.

## Assumptions and Risks

Assumptions:

- `sdl.subpackages` as an array of `src/<name>/` roots is expressive enough for the whole conversion; per-subpackage tiers are not needed initially.
- Subpath exports can be regrouped under subpackage directories without unmanageable consumer churn (SDL is private and unreleased; breaking changes are allowed).
- The style guard and the topology overlay can share one manifest config reader.

Risks:

- The upfront decision inventory goes stale as packages evolve before their conversion slice runs; a contradicted row is steer-first, and inventory rows are re-confirmable rather than immutable.
- (De-risked by the remainder model.) Declaring subpackages is not the same as being properly formed: the pilot `@sdl/core` declares `time` while still holding substantial unconverted code. Resolution: the transitional state is itself declared via `sdl.remainder: true`; the guard enforces the declared state, so the pilot passes and graduates by deleting the `remainder` line. The term "remainder subpackage" and the `sdl.remainder` field are user-confirmed.
- Import-path churn produces large mechanical PRs that can mask regressions; per-package slices with full validation mitigate.
- "Decide per package" can drift into indefinite keep-flat; every keep-flat needs recorded rationale so drift is visible.
- Overlap with the `repo-ontology` Objective (glossary sync): coordinate `CONTEXT.md` edits rather than racing them.

## Open Questions

- Do subpackages ever need their own tier (for example a capability container whose `api` subpackage should sit differently)?
- Does the remainder unit carry any import-boundary rules of its own during the transition, or is it exempt until converted?
- Should the guard eventually require every subpath export of a properly formed container to resolve into a declared subpackage?
- What is the recorded name for a keep-flat package in the end-state vocabulary — "flat package," or simply a package with no container aspiration?
