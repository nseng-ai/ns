# Package Cutover Implemented; Landing and Pi Separation Still Outstanding

> This file retains its timestamped filename from the original local implementation record. The
> cutover has not landed on `master`; this body is authoritative over the stale filename.

## Summary

Roadmap row 3 is implemented locally and awaits landing. The work is organized as four Graphite
stack points: ontology design on PR #3879; cutover preparation; `@nseng-ai/ns` product-package
consolidation; and one atomic package-cutover boundary. The boundary retires
`NS_TS_TIER_DIRECTORY_PROJECTION`, moves the complete tree, derives the release catalog from
`public/`, reconciles package-tree prose, and records evidence. Each stack point must pass its
validation before submission. The final boundary must land as one squash-merged commit, which is
the atomic boundary ADR 0045 §8 requires; no mixed old/new package tree may reach trunk.

**25 packages are present at the local cutover tip** — 7 `public/`, 12 `incubating/`, 6 `internal/`. The arithmetic against the
approved map, stated precisely because the naive subtraction does not reconcile: the baseline was
27 workspace manifests (25 under `ts/packages/`, plus `.ns/extensions/skill-exposure` and the
27th, the review scanner under `.ns/reviews/*/tools/`, which the destination map never classified).
Two folded away. The approved 34-package target became 33 through the Harness Artifacts fold. 33
minus the 9 deferred Pi packages is 24; the 25th is `@internal/review-reinvention-scanner`, the
previously-unmapped manifest that entered `ts/packages/` and tier governance for the first time.
The nine deferred are exactly the six `pi-ns-*` adapters and the three internal Pi-native
extensions (`harness-session`, `model-shortcuts`, `worktree-status`); `@nseng-ai/pi-runtime`
already exists, as a rename rather than an extraction.

**What is done.** Three disposition roots and nothing else under `ts/packages/`. Every leaf
directory equals its unscoped identity, with no duplicate leaves. Scope follows disposition:
`@nseng-ai/*` for public and incubating, `@internal/*` with `private: true` for internal.
Dependency closure is enforced mechanically over `dependencies`, `optionalDependencies`, and
`peerDependencies`. Workspace discovery is narrowed to the three roots, so a package added outside
them is rejected rather than silently ingested — that is what makes the ontology closed rather
than advisory, and it retired the `.ns/` workspace entries. `ts/packages/README.md` is the
authoritative package-tree contract and says so. The public release set is derived from `public/`
rather than hand-maintained. Live prose in `docs/`, `skills/`, CONTEXT files, and package READMEs
is reconciled; ADRs, prior Objective updates, and dated research inventories are left alone as
time-in-place records.

**What is not done: the ns-extension/Pi separation.** Five ns extensions — `flow`, `handoffs`,
`branch-context`, `objectives`, `herdr` — still carry `src/pi/` subpackages, `./pi*` export
subpaths, and `@nseng-ai/pi-runtime` peers. The ADR 0045 §5 `pi-ns-*` rule and the
no-Pi-in-extensions structural rule are therefore not implemented; the guard module names both as
deliberately deferred. This is disposition-legal — an incubating extension depending on incubating
`@nseng-ai/pi-runtime` satisfies closure — so nothing rests in a rule-violating state, but the
Completion Criterion "No ns extension contains Pi imports, Pi registration, a Pi host-surface
subpackage, or Pi extension entrypoints" is **unmet**. Landing this reorganization will not complete Pi separation.

### Findings

- **Open Question 1 had a false premise.** It named Branch Context and Harness Artifacts as public
  `@nseng-ai/ns` runtime edges. Harness Artifacts was real and folded in behind a new `./api`
  export. Branch Context was not an edge at all: the only consumer was a build step copying
  `branch-context-impl.md` into the bundle and onward into the publish directory, which nothing
  ever read. Deleting the dead pipeline removed the dependency. Recorded because the question was
  answered by disproving half of it, not by repairing it.
- **A latent test-isolation defect surfaced.** Two clinkr tests neutralized an ambient `COLORTERM`
  but not `FORCE_COLOR`. Reordering test files exposed it, because the shared lane runs
  `isolate: false` and the tests share a process. It was latent, not introduced. The general
  lesson is the durable part: path-ordering changes are a real risk class for this suite, and a
  reorganization that renames every test path is exactly the trigger.
- **Source-dev extension discovery was silently broken by the new depth.** `ns objective`, `flow`,
  `handoff` and their siblings vanished from the CLI entirely until the SDK resolver was fixed to
  walk four hops with a named recursion backstop. Nothing in `just` caught it. It was caught only
  because the cutover resolved every depth-coupled `import.meta.url` and fixture path literal and
  checked existence, rather than grepping for suspicious-looking ones.
- **A tier debt edge was created and recorded, not designed away.** `@nseng-ai/skill-exposure →
  @nseng-ai/ns` exists because the Harness Artifacts fold placed the skill-frontmatter transform
  behind `@nseng-ai/ns/api`. The edge predates the cutover but only became guard-visible when
  skill-exposure moved out of `.ns/extensions/` into `incubating/extensions/` and came under tier
  governance. It is in the allowed-debt list with a retirement note — move the transform to a
  neutral surface below the host — rather than redesigned mid-cutover.
- **One user-visible CLI change.** `release:qualify-public` lost its `--all`/`-a` flag along with
  the dead `firstBatchPackages` staging concept; it now always qualifies the full derived set.
- **A deliberate amendment to the approved map**, already recorded at row 2 and restated here for
  the landing record: folding Harness Artifacts removed a package that destination-map row 9 had
  moving to `incubating/extensions/harness-artifacts/`.

### Evidence

`just` is green at the branch tip (default lane 555 files / 5763 tests; style guard 170). The
integration lane passes 193 tests and the isolated lane 16. `pack:local` and
`smoke:checkout-free` both pass against the moved tree. No registry publication occurred; that
remains an explicit Non-Goal.

Two verification facts are worth keeping because they are stronger than "the checks passed".
Whole-tree content was **preserved, and measured**: 4984 tracked files before and after the move,
with an identical blob multiset apart from files whose path literals changed. And the topology
guard was **mutation-tested rather than observed passing** — breaking leaf-equals-name and
breaking the internal scope each produced a precise diagnostic naming the offending manifest.
A guard that has only ever been seen green is not evidence that it fires.

## Objective Impact

Roadmap row 3 is `[~]`: implementation is complete locally, but landing is outstanding. Row 5 is
`[~]`: the package-tree contract and disposition topology guard are implemented on the cutover
tip, but neither they nor the boundary have landed, and the two ns-extension/Pi structural rules
remain deferred. Row 6 is `[~]`: prose reconciliation and local validation, build, pack, and
checkout-free evidence are recorded here, but landing and later synthesis into
`professional-repo-curation` remain. Row 4 is untouched and remains the whole of the deferred Pi extraction.

`professional-repo-curation`'s `orientation.md` was corrected in commit `3f37f4f7b` as part of
the prose reconciliation, because it is loaded into every agent's context as a standing rule and
could not distinguish the local cutover state from trunk. It now records that the cutover is
implemented locally but not landed. That is an accuracy repair to an always-loaded file, not the
parent synthesis row 6 still owes.

Risk movement, recorded in `objective.md`:

- **Large atomic conflict surface** and **Identity ripple** are de-risked for the reorganization
  scope. Both remain live for the deferred Pi extraction, which creates nine packages and moves
  Pi code out of five extensions.
- **Hidden Pi coupling** is now the live risk of this Objective, and it is carried rather than
  hypothetical: the extraction that would expose it is deferred, and the curated-API design work
  it predicts is untouched.
- **Guard blind spots** is half-addressed. Topology and dependency closure are enforced and
  mutation-tested; the focused structural checks for forbidden Pi surfaces in ns extensions are
  not written.

The two ADR 0045 clarifications settled at row 2 — the `pi-ns-pr-feedback` CLI seam and blessing
adapter-to-adapter dependencies on declared curated subpaths — are still unwritten. They land as
a superseding ADR during the deferred Pi extraction, which is when they first bind anything. ADR
0045 itself stays untouched.

## Follow-Ups

The deferred Pi extraction (row 4) and its blocking design items carry forward unchanged from the
row-2 update. New during execution, none of them fixed:

- `ts/packages/public/sdk/docs/sdk-reference.md:18` cites `flow/src/shared/`, which does not exist
  and never existed at the old path either. This one is a wrong claim, not a stale path.
- `.ns/extensions/` no longer exists. Stale references remain at `ts/TESTING.md:175,219` and
  `ts/packages/incubating/extensions/pr-feedback/README.md:36`.
- `ts/packages/incubating/extensions/objectives/README.md:20` and
  `ts/packages/public/ns/README.md:64` both document
  `ns extension install npm:@nseng-ai/objectives`, but Objectives is incubating and is not in the
  derived public set, so the install cannot work.
- `ts/packages/public/sdk/src/cli/index.ts:153` points `metaUrl` at a nonexistent `../cli.ts`
  (pre-existing, not caused by the move).
- `ts/packages/public/sdk/test/unit/extension-registry.test.ts:568` still names
  `@nseng-ai/ns-init` in a synthetic specifier, after the fold removed the package.
- `docs/conventions/consumer-gateways-and-command-shape.md:17,24` attributes `GitGateway` to
  extension-kit; it lives in `public/infra/foundation/src/git/contract.ts`.
- `docs/pi/README.md`'s inventory has three wrong paths: grill is listed under
  `pi-runtime/src/grill/` but lives in `internal/hosts/pi/tools/pi-tools/src/grill/`; terminal
  presentation is missing its `kit/` segment; and `ns-pi-subagents` is labeled an Internal Pi-tool
  package while sitting under `subagents/`.
- The clinkr suite has no general guard against ambient colour environment leaking in. Only the
  two known tests were fixed; there is no setup file neutralizing `FORCE_COLOR`/`COLORTERM` for
  the lane.
- Retire the `@nseng-ai/skill-exposure → @nseng-ai/ns` tier debt edge by moving the
  skill-frontmatter transform to a neutral surface below the host.
- Write the superseding ADR carrying the `pi-ns-pr-feedback` CLI seam and adapter-to-adapter
  clarifications during the Pi extraction.
- After landing, synthesize the reorganization into `professional-repo-curation` through that
  record's own tracking workflow (row 6's remaining element).
