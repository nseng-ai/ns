# Container Packages

## Thesis

The workspace should stop paying per-published-package overhead to keep architectural discipline. A **subpackage** is a package-like architecture unit inside a published package: rooted at `src/<name>/`, declared in the package manifest at `sdl.subpackages`, owning its own import boundary and topology circle, and free to expose multiple subpath exports (for example `./time` and `./time/testing` both belong to the `time` subpackage). A **container package** is a published package whose goal in life is to contain subpackages; it is **properly formed** when all of its code is associated with one of its subpackages — no loose root source. The published package remains the distribution unit; the subpackage becomes the architecture unit.

Conversion has an explicit in-between state: a package may declare a **remainder subpackage** — the unit holding all code not yet in a named subpackage. Membership in the remainder is implicit (everything unclaimed), but its existence is explicitly declared as a dedicated manifest field, `sdl.remainder: true`, beside `sdl.subpackages`. Sentinel entries inside the subpackage list (`"."` or named placeholders) were considered and rejected as too implicit. A package is properly formed exactly when it declares no remainder; graduation is deleting the `remainder` line. Lightweight rules-of-the-road tooling (the TypeScript style guard) enforces whichever state is declared.

This Objective defines and documents that vocabulary, pilots it with `@sdl/core` declaring `subpackages: ["time"]` plus `remainder: true`, makes an upfront per-package decision inventory, and then converts the codebase package by package through autonomous execution once the inventory is approved.

The end state is also a consolidation (user-confirmed): fewer top-level packages (top-level = container + standalone) than the 44 in the workspace at inventory time. The inventory therefore records one of **three** decisions per package: **containerize** (the package becomes a container of its own subpackages), **keep standalone** (with rationale), or **fold** (the package's code moves into a container package as one of its subpackages and the published package is deleted). Folds are the mechanism that reduces the top-level count; the ≥4 threshold below applies to self-containerization decisions, not to fold targets.

This Objective is designed for autonomous pursuit (an autoobjective in the colloquial sense — prose-shaped for a runner, not a schema): decision-making is front-loaded into the approved inventory, so a runner may pick an approved conversion row, convert the package, validate it, and submit its PR without asking each time, under the Runner Policy below. The inventory detail is durable source material under `references/`, not current truth — a runner re-verifies the approved split against current code at pickup before acting.

## Scope

- Canonical vocabulary: **Subpackage**, **Container package**, **Remainder subpackage**, and the properly-formed rule as root `CONTEXT.md` headwords with Avoid lists; reconcile the existing **Topology circle** entry (its "source component" phrasing) and confirm no conflict with the **Published package** Avoid list.
- An ADR recording the container-package end state and `sdl.subpackages` as the manifest source of truth (topology circles stay presentation).
- Manifest config: `sdl.subpackages` beside `sdl.tier`, consumed by both the architecture topology overlay (`skills/architecture-topology-report/scripts/extract-graph.mjs`) and the TypeScript style guard, replacing auto-discovery of `src/<dir>/` circles.
- The pilot: branch `core-time-topology-circle-consolidation` / PR #2677, renaming the in-flight `sdl.topologyCircles` config to `sdl.subpackages` with `@sdl/core` declaring `["time"]`.
- Rules-of-the-road tooling in the style guard: every source file in a declaring package must belong to a declared unit (a named subpackage directory, or the remainder when declared); named subpackages must exist as `src/<name>/` directories; a package with no remainder declaration fails on any unassociated code (properly formed).
- The pi-subpackage model (user-confirmed): a capability with a Pi surface owns a `pi` subpackage exported as `./pi` instead of a separate `*-pi` published package. `@sdl/pi` becomes an optional peer dependency (plus devDependency) of such capabilities — only the `pi` subpackage may import it (guard-enforced); the neutral `@sdl/pi/...` helpers consolidate as an `@sdl/pi` `kit` subpackage; and `@sdl/pi` must continue to depend on no capability package. The recorded "capability never depends on `@sdl/pi`" boundary refines accordingly in the vocabulary slice.
- The upfront decision inventory covering every workspace package, reviewed and approved by the user in one pass before autonomous conversion begins. Full detail (decision, proposed subpackage split, rationale) lives in `references/inventory.md`; approved containerize decisions become thin per-package conversion rows in `roadmap.md` that point back at their inventory entry.
- The containerize threshold (user-confirmed): a package containerizes only when its proposed **end-state** split yields **four or more** subpackages (counting any core-style unit that claims loose root files, not counting the transitional remainder). Three or fewer means the package stays standalone for now — recorded as keep-flat with the threshold as rationale, revisitable later. Borderline counts are resolved at inventory review, not by the runner. The threshold judges the final state, not the mid-conversion declaration: the pilot `@sdl/core` declaring only `time` today is simply the first step of its incremental conversion via the remainder — its end-state split is expected to hold several subpackages and clear the threshold.
- Autonomous per-package conversion slices executing approved inventory rows.
- Recording, per conversion row, one of two honest dispositions in `roadmap.md` as work lands: **converted** (approved split implemented, properly formed or declared remainder exactly as approved, validation evidence recorded) or **re-decided** (code reality contradicted the approved split; the runner steered, a human recorded a new decision back into the inventory, and the row proceeds under the new decision). Keep-flat decisions are closed at inventory approval with their rationale recorded; they never become conversion rows.

## Non-Goals

- Creating new published packages, or splitting container packages back into many published packages — with one exception: a **consolidation container** may be created when it absorbs two or more existing packages and strictly reduces the top-level package count (net-negative). Each such container and its name is approved as part of the inventory.
- Changing Package Tier semantics; subpackages inherit their container's tier for now.
- Redesigning the topology report beyond consuming `sdl.subpackages`.
- Registries, frontmatter, or hidden state; the manifest field plus guard plus report are the whole mechanism.
- Landing or merging PRs; landing stays human.

## Completion Criteria

- Vocabulary documented: `CONTEXT.md` headwords for Subpackage and Container package exist, the Topology circle entry is reconciled, and the end-state ADR is recorded.
- `sdl.subpackages` is the single config both the topology report and the style guard read; convention-based auto-discovery of directory circles is gone.
- The decision inventory in `references/inventory.md` is complete and approved: every workspace package has an explicit recorded containerize, keep-standalone, or fold decision.
- The end-state top-level package count is strictly lower than the count at inventory time (44), achieved through approved folds; no fold introduces a package-level dependency cycle. Folds are tier-homogeneous by default; the gateway-backends-into-capability-kit fold is the user-ruled tier-crossing exception (gateways live definitively above the kernel/sdk layer).
- Every top-level package carries one of the three user-confirmed categories: core infra, standalone tool, or first-party extension/capability.
- Every conversion row carries a resolved disposition: **converted** (properly formed or declared remainder exactly as approved, enforced by the style guard), or **re-decided** and then resolved under the human-confirmed new decision.
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

This Objective is execution-friendly for `objective-next`, including autonomous branch creation and PR submission per slice — but never landing. Decision-making is front-loaded by design: the approved decision inventory is the execution permission for conversion slices.

The supported autonomous runner is `/objective:autopilot <slug> [--submit]`: each iteration spawns a fresh child Pi that runs `objective-next` for *this* Objective, implements one coherent slice, and leaves it **uncommitted**; the parent session then re-checks live repo state and owns commit and submit (`--submit` opens the PR via `sdl flow submit --no-restack`, never restacking and never landing). A human working the loop by hand follows the same steps below.

Sequencing is a hard gate: the enabling slices (pilot rename → vocabulary → rules-of-the-road guard → decision inventory) come before any conversion row, and no conversion row is actionable until the inventory is approved. The vocabulary slice and the inventory-approval step are steer-first by construction; an autopilot iteration that reaches a steer-first row stops and asks rather than skipping ahead to unapproved work.

- Direct execution is allowed when: the selected roadmap row's per-package decision is recorded and approved in `references/inventory.md`, and the runner has re-verified the approved split against current code at pickup — including moving files under subpackage directories, updating imports/exports, editing `package.json` `sdl` config, and updating guard/report code and tests to match. The pilot-rename and guard rows are also direct execution under their row-level policy.
- Steer or ask first when: a package has no recorded decision; code reality contradicts the approved split (disposition **re-decided** — a human re-confirms before conversion proceeds); a slice would change vocabulary (`CONTEXT.md`, ADRs) beyond the documentation slice; a whole-package rename, deletion, or fold is implied **that is not an approved inventory fold decision** (approved folds — including deleting the folded package and creating an approved consolidation container — are direct execution); or validation fails for a reason outside the conversion itself.
- How work may change files and be left: feature branches only (never `main`/`master`), created via the repo's **branch-context Graphite creation** path per the autoobjective branch policy (`skills/branch-context/references/lifecycle.md`), not bare `gt create`. One package (or one coherent enabling slice) per branch and PR; do not batch unrelated packages. The runner may commit and submit PRs via Graphite for human review; under `/objective:autopilot` the parent owns commit and submit while the child leaves the slice uncommitted.
- Validation before keeping or submitting work: `just` passes; the style guard is green for the affected package; and the topology shape check holds — run `skills/architecture-topology-report/scripts/extract-graph.mjs` before and after the slice and confirm the package count is unchanged (or reduced by exactly the approved fold, with the folded package reappearing as a subpackage circle of its target), new circles appear only for the subpackages this slice declared, the remainder circle only shrinks or disappears, and no auto-discovered or orphan nodes appear. Record the before/after node counts as row evidence.
- What will not happen unless explicitly requested: landing/merging PRs, publishing, external writes beyond Graphite/GitHub PR submission, edits to other Objectives, or archive/lifecycle changes to this Objective.

Default runner loop for a conversion slice:

1. Pick one open, approved conversion row from `roadmap.md` (sequencing gate already satisfied).
2. Re-verify the row's inventory entry against current code: files still where the split expects, no new unclaimed areas the split doesn't cover.
3. If reality contradicts the split, stop and steer (**re-decided**); otherwise convert: move code under subpackage directories, update imports/exports, declare `sdl.subpackages` / adjust `sdl.remainder`.
4. Run the validation gates above, including the topology shape check.
5. Record the disposition and evidence on the roadmap row.
6. Record a Semantic Update only for kept progress, reusable learnings (for example a stale inventory entry), or policy refinements — not a per-slice changelog.
7. Leave the slice for the parent (or human) to commit and submit as one PR; do not land it.

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
- The tier-crossing gateway fold (git, github, graphite, cmux into `@sdl/capability-kit`) retires the `capability-gateway-backend` tier for that code — subpackages inherit the `capability-kit` tier, which matches the gateways' position above the kernel/sdk layer (user rationale). Any style-guard or layering rules keyed to the retired tier must be reconciled in the guard slice, and the tier lane disappears from the topology report.

## Open Questions

- Do subpackages ever need their own tier (for example a capability container whose `api` subpackage should sit differently)?
- Does the remainder unit carry any import-boundary rules of its own during the transition, or is it exempt until converted?
- Should the guard eventually require every subpath export of a properly formed container to resolve into a declared subpackage?
- What is the recorded name for a keep-flat package in the end-state vocabulary — "standalone package" (the user's phrasing when setting the containerize threshold, the current front-runner), "flat package," or simply a package with no container aspiration? Canonize in the vocabulary slice.
- What is `@sdl/core`'s end-state subpackage set beyond `time` (primitives, terminal, …)? The user has confirmed core containerizes — several subpackages are expected — but the concrete split is proposed and approved at inventory review.
- Name for the one proposed consolidation container (local Pi tools) — a placeholder is proposed in the inventory; the user picks the final name at inventory approval.
- Should `sdl-sdk` and `@sdl/kernel` consolidate in a later pass? Left standalone in this inventory (distinct ADR 0012 layers); `@sdl/capability-kit` now containerizes as the gateway home.
- Should the remaining standalone capability packages (`address`, `aretro`, `handoff`, `objective`, `roaster`, `ccc`) consolidate into a capability container in a later pass if the user wants the top-level count lower still?
