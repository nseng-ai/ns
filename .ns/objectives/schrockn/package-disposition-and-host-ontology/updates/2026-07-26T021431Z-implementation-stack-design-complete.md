# Implementation Stack Designed; All Open Questions Closed

## Summary

Roadmap row 2 is complete. The atomic implementation stack is designed and persisted in-repo at
`references/implementation-stack.md`, the durable counterpart to the approved destination map.
It supersedes the raw 29-branch synthesis it was derived from; that synthesis is not
authoritative.

Four decisions are settled:

1. **Fold `@nseng-ai/harness-artifacts` into `@nseng-ai/ns`**, which gains an `./api` export;
   `skill-exposure` repoints to `@nseng-ai/ns/api`. This deliberately widens the public
   product's published surface and amends destination-map row 9, taking the approved target
   from 34 packages to 33.
2. **Allow Pi slash-command *name* constants on `@nseng-ai/branch-context/api`**, amending the
   Presentation Boundary at `branch-context/CONTEXT.md:30`, so `skill-exposure` is unblocked
   without an injection seam.
3. **Write a superseding ADR for the `pi-ns-pr-feedback` CLI seam.** ADR 0045 §6 mandates a
   `@nseng-ai/pr-feedback/api` edge the code does not need; ADRs are immutable, so a map
   amendment is the wrong instrument.
4. **Bless adapter-to-adapter dependencies on declared curated subpaths** (`pi-ns-herdr` →
   `pi-ns-handoffs`), recorded as an ADR 0045 clarification.

Decisions 3 and 4 land as a superseding ADR written during the cutover, not as edits to ADR 0045.

The corrected stack shape is two-phase. Pre-boundary work lands on trunk as ordinary PRs and
never touches a package path or npm identity: the CI trunk-branch filter fix, depth-agnostic
workspace discovery as the keystone, the `ns-init` and Harness Artifacts folds, and dead-code
sweeps. The boundary is one Graphite stack on a single base cut from `master`, submitted as
roughly 19 PRs, then landed by retargeting the **top** branch's PR base to `master` and
squash-merging, so exactly one commit reaches trunk. `ns flow land` is prohibited for this
boundary because it squash-merges bottom-up and would park mixed-tree intermediate commits on
trunk, which ADR 0045 §8 forbids. Eight corrections to the raw synthesis are recorded, including
that all three pre-boundary API branches were red as synthesized and that hidden `.ns/`
consumers were repeatedly missed because ripgrep skips them by default.

The host-level README answer is: **none are necessary** beyond the authoritative
`ts/packages/README.md` and the already-approved `@internal/pi-tools` inventory README.

## Objective Impact

Roadmap row 2 is `[x]`, and all three Open Questions in `objective.md` are closed:

- The public `@nseng-ai/ns` boundary repair is three edges and three fixes, each verified
  against source. `ns-init` folds in; Harness Artifacts folds in behind a new `./api`; and
  Branch Context turns out not to be a runtime edge at all — its sole consumer is the
  `build-bundle.mjs` prompt-asset copy, which nothing reads at runtime, so deleting the dead
  pipeline removes the dependency.
- No focused host-level READMEs are warranted yet; the one candidate host-level rule is routed
  to `ts/packages/README.md` instead. Revisitable when the Pi extraction creates the
  `hosts/pi/extensions/` population a Pi-host README would describe.
- The Graphite shape is settled as above, with a trunk freeze for the review window.

An execution-scope decision made after the design was drafted now binds rows 3–5: the cutover
runs as the **complete filesystem reorganization with the `pi-ns-*` Pi extraction deferred**.
Stack orders 0–1, 10a–10d, 11–16, and 26–29 execute; orders 3–9 and 17–25 are deferred, because
every open design item blocks one of them and none blocks an executing order. The honest
consequence is recorded in the roadmap: ns extensions keep their `src/pi/` subpackages, the
ns-extension/Pi structural boundary Completion Criterion is not met by this cutover, and the
disposition **topology** guard lands without the ADR 0045 §5 `pi-ns-*` rule and the
no-Pi-in-extensions structural rule. This is disposition-legal — an incubating extension
depending on incubating `@nseng-ai/pi-runtime` satisfies closure — so the boundary work is
deferred, not violated, and nothing lands in a rule-violating state.

The design row authorized no package move, identity change, publication, or registry write.

## Follow-Ups

- Execute the reorganization scope (orders 0–1, 10a–10d, 11–16, 26–29) as the coordinated
  cutover, and record its outcome separately.
- Confirm order 2's disposition during execution: the parity `sourcePackage` union work is only
  needed by the deferred orders, except for the `@nseng-ai/pi` → `@nseng-ai/pi-runtime` member
  rename that order 16 must carry.
- Write the superseding ADR carrying settled decisions 3 and 4 during the cutover.
- Close out the deferred Pi extraction (orders 3–9, 17–25) with its blocking design items:
  Flow and Handoffs curated API shapes, the `pi-runtime` export map, the parity identity model,
  the typed package-topology model, and the `@nseng-ai/extension-kit/pi-types` question.
