# Approved Implementation Stack for the Package Disposition Cutover

## Provenance

Produced as roadmap row 2 of this Objective — *"Design the atomic implementation stack from the
approved map"* — from the closed design gate formed by
[`ADR 0045`](../../../../docs/adr/0045-release-disposition-and-owner-nested-package-ontology.md)
and [`package-destination-map.md`](package-destination-map.md). It supersedes the raw 29-branch
synthesis it was derived from; that synthesis is not authoritative and must not be worked from
directly. This document is the durable in-repo counterpart to the destination map: row 1 produced
the map, row 2 produced this, and rows 3–6 execute from it. It stands alone — no external planning
artifact is required to execute the cutover.

Like the map, this design settles sequencing only. It does not itself authorize a package move, an
identity change, publication, or a registry write.

## Execution scope: complete reorganization, Pi extraction deferred

Decided after the design was drafted, and binding on rows 3–5:

The cutover is executed as the **complete filesystem reorganization with the `pi-ns-*` Pi extraction
deferred**.

- **Executes now:** orders 0–1 (pre-boundary), 10a–10d (pre-boundary folds and sweeps), 11–16
  (disposition roots, tier-projection retirement, identity renames), and 26–29 (release catalog,
  topology guard, pack/smoke gate, package-tree contract and prose).
- **Deferred:** orders 3–9 (curated `/api` surfaces on Branch Context, Handoffs, Objectives, Flow,
  Herdr, plus the Grill activation-contract split and the skill-exposure repoint that depends on
  them) and orders 17–25 (parity registry per-owner, internal Pi host extension extraction, every
  `pi-ns-*` extraction, and retirement of the pi-subpackage guard exemptions).
- **Reason:** every open design item in *Design work still needed* below blocks one of the deferred
  orders. None of them blocks an executing order.

**Consequence, stated plainly.** ns extensions keep their `src/pi/` subpackages after this cutover.
The ns-extension/Pi structural boundary criterion in this Objective's Completion Criteria — *"No ns
extension contains Pi imports, Pi registration, a Pi host-surface subpackage, or Pi extension
entrypoints"* — is **not met** by this cutover. The order-27 disposition **topology** guard
therefore lands without the ADR 0045 §5 `pi-ns-*` rule and without the no-Pi-in-extensions
structural rule; it enforces disposition roots, leaf/identity invariants, scope-by-disposition,
`private: true` on `@internal/*`, and disposition dependency closure only.

**This is disposition-legal.** An incubating ns extension depending on incubating
`@nseng-ai/pi-runtime` satisfies closure, and every extension is incubating for this cutover
(destination map rows 7–16, 26). Nothing lands in a rule-violating state: the pi-subpackage guard
exemptions stay in place rather than being retired against code that still needs them, and the
structural rules land with the extraction that makes them true. The boundary work is **deferred, not
violated**.

Order 2 (`pi-parity-open-source-package-identity`) sits outside both lists above. Its blocking design
item — the parity `sourcePackage` identity model — is itself deferred with orders 17–18, and the only
parity change the executing set forces is the `@nseng-ai/pi` → `@nseng-ai/pi-runtime` member rename,
which order 16 must carry. The executing orchestrator should confirm this rather than assume it.

## Problem and outcome

`ts/packages/` encodes architectural *role* in its top-level directories (`incubator/`, `hosts/`,
`infra/`, `tools/`, `internal/`) but says nothing about *release disposition*. The two facts are
conflated, so nothing prevents a would-be-public package from depending on unreleasable code.
Separately, Pi harness code lives inside ns extension packages (`<ext>/src/pi/`), so those extensions
are not harness-independent and cannot ship without dragging Pi along.

Target: three disposition roots — `public/`, `incubating/`, `internal/` — with owner-appropriate
nesting, every leaf directory matching its unscoped package name, all Pi code extracted into
`hosts/pi/` packages, and mechanical guards enforcing disposition closure and the ns-extension/Pi
boundary. Lands as **one atomic boundary**: no trunk-visible mixed tree, no compatibility aliases.
26 baseline manifests → 34 target packages, amended to **33** by settled decision 1 (see below).

## Verification of the synthesis

The design came from an eight-audit parallel workflow, a synthesis into a 29-branch stack, and an
adversarial ordering critique. **The critique returned `needs-rework`, and it was right.** Its
central finding: the audits repeatedly missed hidden `.ns/` directories, because ripgrep skips them
by default. Every load-bearing claim was re-verified against source before acceptance:

- `.ns/extensions/skill-exposure/src/replacement-registry.ts:1-8` imports all four `/pi` barrels
  (`@nseng-ai/{flow,handoffs,objectives,branch-context}/pi`).
- The same package imports `@nseng-ai/harness-artifacts/api` in three source files
  (`policy.ts:1`, `in-memory-skill-exposure-gateway.ts:1`, `node-skill-exposure-gateway.ts:6`).
- `ts/tsconfig.json:37` includes `../.ns/extensions/*/src/**/*.ts`, so `just ts-check` covers it —
  those branches really would be red.
- `@nseng-ai/ns` exports only `./cli` and `./sdk*` — no `/api`.
- `typescript-style-guard/src/config.ts:111` still names `@nseng-ai/pi`; `source-rules.ts:232`
  hard-codes the foundation timer-adapter path.

## Settled decisions

| # | Decision                                                                           | Consequence                                                                                                                                                                          |
| - | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 | **Fold `harness-artifacts` into `@nseng-ai/ns`, and add an `./api` export to ns.** | `skill-exposure` repoints to `@nseng-ai/ns/api` (incubating → public is legal). Widens the public product's published surface — accepted deliberately. Amends destination-map row 9. |
| 2 | **Allow Pi slash-command *name* constants on `@nseng-ai/branch-context/api`.**     | Amends the Presentation Boundary at `branch-context/CONTEXT.md:30`. Unblocks `skill-exposure` without an injection seam.                                                             |
| 3 | **Write a superseding ADR for the `pi-ns-pr-feedback` CLI seam.**                  | ADR 0045 §6 mandates a `@nseng-ai/pr-feedback/api` edge the code does not need. ADRs are immutable, so a map amendment is the wrong instrument.                                      |
| 4 | **Bless adapter-to-adapter dependencies on declared curated subpaths.**            | `pi-ns-herdr` → `pi-ns-handoffs`. Recorded as an ADR 0045 clarification; the order-27 guard must be written to ADR §5's actual wording.                                              |

Decisions 3 and 4 land as a **superseding ADR** written during the cutover. ADR 0045 is an immutable
time-in-place record and is not edited.

Two smaller calls, taken as recommended:

- The unmapped 27th manifest under `.ns/reviews/*/tools/*` moves to
  `internal/dev/review-reinvention-scanner` as `@internal/review-reinvention-scanner`, rather than
  carving a guard exemption.
- `private: true` is **orthogonal** to disposition. Disposition governs path and scope; `private`
  governs publish-readiness. The guard asserts `private: true` for `@internal/*` only.

## Corrections applied to the synthesis

1. **Additive → repoint → remove.** Orders 5–7 add to `/api` while *keeping* the `./pi` barrel
   re-exports intact. Order 9 repoints `skill-exposure`. All `./pi` deletions move into the boundary
   alongside orders 20–23. As synthesized, all three pre-boundary API branches were red.
2. **Every `.ns`/`.pi` gate assertion uses `rg --hidden`** or an explicit path. Several synthesized
   validations were structurally incapable of failing.
3. **Path literals are generated, not hand-listed.** Before building any move branch, run
   `rg -n --hidden 'ts/packages/(hosts|infra|incubator|tools|internal)/' ts .ns .pi skills docs justfile .github`
   and attach the per-branch subset. Known misses: `source-rules.ts:232` (order 12, blocking),
   `justfile:169` (belongs to 13, not 12), ~18 literals in flow's
   `extension-shared-flow-foundations.test.ts`, `branch-context/test/scenario/cli-surface.test.ts:118`,
   `pi-tools/test/thermo-council/thermo-council.test.ts:243`, `config.ts:111`, the handoffs row in
   `config.ts`, and the `.pi/settings.json:3` double-claim between orders 14 and 15.
4. **Order 27's `pi-ns-*` rule follows ADR §5 verbatim** — the extension's curated API *plus packages
   permitted by disposition closure*; forbid deep/private imports and `pi` subpackages. As
   synthesized it would have rejected every adapter the stack builds.
5. **Workspace globs narrow to the three disposition roots**, not `packages/**`. Destination-map
   requirement 7 says discovery must *reject* a package outside those roots.
6. **Order 10 splits into three PRs** (ns-init fold / harness-artifacts fold + ns `./api` /
   dead-asset + phantom-dep + checkout-free defect). As one branch it was ~18k lines.
7. **`ci.yml` `push.branches` was `[main]` while the default branch is `master`** — no post-merge CI
   fired on trunk. Fixed pre-boundary as order 0, not at order 28.
8. **Order 3 keeps the grill work, drops the map amendment.** The map stated a constraint plus the
   remedy, not a factual error. `grill/surfaces` already lives in `hosts/pi/src/kit/grill/` — the
   package that *becomes* `pi-runtime` — so nothing moves packages; the module just joins
   pi-runtime's contract.

## The stack

**Two phases.** Pre-boundary lands on trunk as ordinary PRs and never touches a package path or npm
identity. Boundary is built with Graphite, reviewed as ~19 PRs, and landed as **one squashed
commit**.

### Pre-boundary (trunk, ordinary PRs)

|   # | Branch                                    | Scope    | Notes                                                                                                                                                                                                                                        |
| --: | ----------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|   0 | `ci-trunk-branch-filter-fix`              | now      | `.github/workflows/ci.yml` `push.branches` → `master`. Moved up from 28.                                                                                                                                                                     |
|   1 | `depth-agnostic-workspace-discovery`      | now      | **Keystone.** `pnpm-workspace.yaml`, `ts/package.json` workspaces, `tsconfig.json` include, `vitest.shared.ts` `testGlobsFor()` → depth-agnostic; raise ns-dev's two `depth > 4` caps. Verified a strict-superset no-op on the current tree. |
|   2 | `pi-parity-open-source-package-identity`  | see note | Replace the closed 13-member `sourcePackage` union so extracted packages can emit parity records. Outside the executing set; see *Execution scope* above.                                                                                    |
|   3 | `pi-grill-narrow-activation-contract`     | deferred | Split `kit/grill/surfaces.ts` (31 lines): host-neutral activation stays for pi-runtime; four project-only Grill UI names → `@internal/pi-tools`.                                                                                             |
|   4 | `branch-context-api-additive`             | deferred | Prompt-asset accessors **and** (decision 2) the Pi command-name constants on `/api`; amend `CONTEXT.md:30`. Keep `./pi` intact.                                                                                                              |
|   5 | `handoffs-harness-independent-api`        | deferred | Additive only. Keep `./pi` barrel.                                                                                                                                                                                                           |
|   6 | `objectives-command-backed-skills-to-api` | deferred | Additive only. Keep `./pi` barrel.                                                                                                                                                                                                           |
|   7 | `flow-curated-api-for-pi-adapter`         | deferred | Additive only. Keep `./pi` barrel. Needs the Flow API-shape design first.                                                                                                                                                                    |
|   8 | `herdr-curated-api-surface`               | deferred | Herdr *core* is Pi-coupled (`impl-plan.ts:36,38`). Inject launch-command construction.                                                                                                                                                       |
|   9 | `skill-exposure-consume-extension-apis`   | deferred | Repoint all four `/pi` imports to `/api`. Gate with `rg --hidden`.                                                                                                                                                                           |
| 10a | `fold-ns-init-into-ns`                    | now      | ~9.5k lines.                                                                                                                                                                                                                                 |
| 10b | `fold-harness-artifacts-into-ns`          | now      | Decision 1. Adds `./api` to ns; repoints `skill-exposure`.                                                                                                                                                                                   |
| 10c | `ns-dead-asset-and-checkout-free-defect`  | now      | Dead prompt pipeline, phantom `@nseng-ai/foundation` root dep, `reconcile.ts:583-591` defect.                                                                                                                                                |
| 10d | `pre-boundary-dead-code-sweep`            | now      | All five dead-code deletions, including the two the synthesis left at order 17.                                                                                                                                                              |

### Boundary (Graphite stack, one squashed landing)

|  # | Branch / step                                  | Scope    | Notes                                                                                                                                |
| -: | ---------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 11 | Retire `NS_TS_TIER_DIRECTORY_PROJECTION`       | now      | Kept inside the boundary so trunk never rests without a placement policy.                                                            |
| 12 | Move `public/` root                            | now      | **+ `source-rules.ts:232`**.                                                                                                         |
| 13 | Move `incubating/extensions/`                  | now      | **+ `justfile:169`**.                                                                                                                |
| 14 | Move `internal/`                               | now      | Watch the `.pi/settings.json:3` double-claim with 15.                                                                                |
| 15 | Rename `@internal/pi-editor-mods`              | now      | Identity + `private: true`.                                                                                                          |
| 16 | Rename + move `pi-runtime`                     | now      | **+ `config.ts:111`**. Anchored specifier rewrite only (see tactics).                                                                |
| 17 | Parity registry per-owner                      | deferred | Blocked on the parity identity model.                                                                                                |
| 18 | Extract internal Pi host extensions            | deferred | worktree-status, model-shortcuts, harness-session.                                                                                   |
| 19 | Extract `pi-ns-pr-feedback`                    | deferred | **+ superseding ADR, decision 3**.                                                                                                   |
| 20 | Extract `pi-ns-branch-context`                 | deferred | **Deletes its `./pi` export here.**                                                                                                  |
| 21 | Extract `pi-ns-handoffs`                       | deferred | **Deletes its `./pi` export here**; **+ handoffs `config.ts` row**.                                                                  |
| 22 | Extract `pi-ns-objectives`                     | deferred | **Deletes its `./pi` export here.**                                                                                                  |
| 23 | Extract `pi-ns-flow`                           | deferred | **Deletes its `./pi` export here.**                                                                                                  |
| 24 | Extract `pi-ns-herdr`                          | deferred | **Deletes its `./pi` export here**; adapter-to-adapter edge per decision 4.                                                          |
| 25 | Retire pi-subpackage guard exemptions          | deferred | Only legal once 20–24 land.                                                                                                          |
| 26 | Regenerate the public release catalog          | now      | Derive from `public/` plus qualification rules.                                                                                      |
| 27 | Disposition topology guard                     | now      | **ADR §5 wording; narrow globs to three roots.** Lands without the `pi-ns-*` and no-Pi-in-extensions rules while 17–25 are deferred. |
| 28 | ns pack + checkout-free smoke gate             | now      | `pack:local` plus `scripts/smoke-checkout-free.mjs`.                                                                                 |
| 29 | Package-tree contract and prose reconciliation | now      | All prose deferred to here.                                                                                                          |

## Landing mechanics

`gt create` / `gt modify` / `gt restack` on a single base cut from `master`; `gt submit
--no-interactive` → ~19 PRs, all required green. After approvals, retarget the **top** branch's PR
base to `master` — its diff is the entire cutover, already reviewed branch-by-branch — and
squash-merge. Exactly one commit reaches trunk.

**Do not use `ns flow land`.** It squash-merges each PR bottom-up
(`flow/src/land/stack/land-context-adapter.ts:146,543`), parking every intermediate commit on trunk,
including states where both `public/` and `hosts/` exist. That is exactly the mixed old/new tree ADR
0045 §8 forbids.

Freeze trunk (or add branch protection) for the review window: nothing else may add a package under
an old role directory while the boundary is in flight.

## Mechanical tactics

- **`git mv` whole directories, one package per command.** In every move branch: commit the pure
  move first, then a second commit for manifest/path-literal/lockfile fixups. Reviewers read
  `git show <move-commit> --stat -M` as a rename list. Highest-leverage tactic in the plan.
- `git config diff.renames copies` and `diff.renameLimit 0` before starting — the default limit
  silently degrades large rename sets into the unreadable add/delete diff we are avoiding.
- **Specifier rewrite by script, not by hand.** For order 16, anchor on `@nseng-ai/pi/` and
  `@nseng-ai/pi"` only — never unanchored, or `pi-editor-mods` and `pi-tools` get corrupted. Verify
  with `rg -n '@nseng-ai/pi[/"]' ts .pi` returning zero.
- **Per-package `test` scripts encode their own depth** in all 25 manifests. Generate the rewrite;
  they are not CI-gated, so errors are silent.
- **Never hand-edit or hand-merge `pnpm-lock.yaml`.** Regenerate with
  `corepack pnpm@11.8.0 --config.strict-dep-builds=false --dir ts install`. Importer count ==
  manifest count is the best mechanical proof the globs match the new tree.
- Prose is deferred entirely to order 29; run `just dprint-fix` after, never hand-align tables.

## Design work still needed before specific branches

Every item below blocks a deferred order; none blocks an executing one.

- Flow curated API shapes (blocks 7, 23).
- Handoffs launch-integration split — which slice is genuinely harness-independent (blocks 5, 21, 24).
- The `pi-runtime` export map — 36 current subpaths, several unnamed in the map's runtime inventory
  (blocks 16's *contract*, not its rename/move).
- Parity `sourcePackage` identity model replacing the closed union (blocks 2, 17, 18).
- Typed package-topology model — `Disposition`, owner-path parse, leaf, closure-edge kind with a
  dev/test discriminator (blocks 27's structural rules; the topology rules land without it).
- Whether `@nseng-ai/extension-kit/pi-types` is sanctioned neutral host-shape vocabulary for
  extension `/api` signatures (blocks 8, 24, 27). Recommend blessing it, recorded in
  `ts/packages/README.md`, with Herdr's port inversion as a follow-up rather than a cutover blocker.

## Verification

- `just` green (repo default entrypoint) on every boundary PR, and locally on the integration commit
  before merge — that local run is the only whole-tree verification the boundary gets.
- Identity guard: disposition root, leaf == unscoped name, no duplicate leaves, scope matches
  disposition, `private: true` on `@internal/*`.
- Disposition closure enforced mechanically, no compatibility exceptions.
- Structural: no ns extension has a `pi` subpackage, `./pi*` export, Pi peer, or Pi registration;
  every `pi-ns-*` satisfies the ADR §5 rule. **Deferred with orders 17–25** — not part of this
  cutover's guard set.
- Discovery rejects any package outside the three roots.
- Builds + `pack:local` succeed; `@nseng-ai/ns` `scripts/smoke-checkout-free.mjs` passes.
- No registry publication — explicit non-goal, parked.
