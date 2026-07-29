# Roadmap

## Work

- [x] Write the direction ADR: opt-in stacking default, capability-split provider neutrality, adapter-collapse pluggability (external-command as a future adapter, not a point kind), and the eight jj "do not preclude" guardrails with jj named as the extensibility stress case.
      Evidence: accepted `docs/adr/0049-opt-in-provider-neutral-stacking.md`; its eight guardrails are the review criteria for later seam work.
- [x] Produce the capability/semantic matrix — Graphite versus `gh stack` v0.0.8 observed semantics versus jj-as-constraint — and record neutral stacking vocabulary in the relevant `CONTEXT.md` files.
      Evidence: `docs/conventions/stack-provider-capability-matrix.md`; Flow, Graphite, and Branch Context contexts distinguish neutral targets/capabilities from provider-private facts.
- [x] Remove the Herdr startup coupling: registration performs no Graphite or trunk work, and local-trunk discovery uses the cached git `origin/HEAD` fact only after an implementation workflow selects that basis.
      Evidence: `@nseng-ai/herdr` registration and an unrelated command are tested with `gt` unusable; Herdr has no `gt trunk` path; `GraphiteBranchGateway.trunkBranch` was removed. Herdr's selected implementation workflows still perform Graphite branch tracking, which belongs to the later branch-creation-provider work.
- [x] Move generic trunk discovery in Flow (`pull-trunk`, `cp`, and submit checkpointing) off Graphite onto cached git `origin/HEAD` and configured-upstream facts where stack metadata is not required.
      Evidence: `src/trunk-pull/trunk-pull.ts` depends on `GitGateway.cachedOriginHeadBranch` and `branchUpstream`; `src/checkpoint/checkpoint.ts` depends on `cachedOriginHeadBranch`; the scoped source paths contain no Graphite gateway or `gt` invocation. Exact-transcript scenarios cover success and fail-closed trunk lookup behavior. Refresh verification ran all 93 Flow test files (863 tests) successfully. Flow land still uses `gt trunk` as part of its explicitly stack-shaped Graphite preflight and is addressed by the later target/topology slices, not this generic-discovery row.
- [ ] Make Branch Context provider construction policy-selected and lazy: the plain-git path constructs no Graphite gateway, and creation methods resolve at the composition root.
      Current evidence: plain-git is already the default and execution makes no Graphite calls, but `createBranchContextContext` still constructs `RealGraphiteBranchGateway` eagerly; existing fake-driven tests prove call avoidance, not construction avoidance.
- [ ] Audit behavior with no stack provider configured: inventory every user-facing workflow that remains fully available, degrades with explicit limitations, or is unavailable; use the result to define supported no-stacking behavior and implementation sequencing.
- [ ] Introduce discriminated branch-vs-stack targets for submit, land, and branch creation, with explicit provider selection (flag or repository config; absence means none) and no autodetection selecting mutating behavior; define this repo's Graphite-selected configuration and any documented compatibility phase for current `ns flow submit` stack behavior.
      Current evidence: land exports a nominal single-branch target but its canonical executor does not implement it and command composition always selects a stack; submit still constructs and consumes Graphite stack gateways; `ns.toml` has no stack-provider setting.
- [ ] Extract the neutral stack model (ordered parent edges, trunk, optional current branch, typed cycle/fork/missing diagnostics) with the Graphite topology adapter behind it; migrate Flow land/submit planning behavior-preservingly.
      Completion evidence: existing Flow land/submit suites pass and a topology conformance suite runs against the Graphite adapter. Current Graphite stack types remain provider-specific and require a current branch.
- [ ] Split mutation capabilities behind separate seams — stacked-branch preparation, reconciliation (outcomes include `not-needed`/`automatic`), and publication (input: ordered branch list) — keeping Flow policy above the seams and Graphite command mechanics inside the adapter.
- [ ] Cut the `BranchCreationProvider` seam with `plain-git` (default) and `graphite` adapters plus its conformance suite; keep additive `branch-context.create.pre`/`.post` ceremony as ordinary hook points if demanded in this window.
- [ ] Reconcile standing guidance with the landed direction: `docs/conventions/graphite-dependency-boundary.md`, affected skills and contributor guidance, and this Objective's `orientation.md`; shrink or retire temporary orientation lines as couplings land.
      Completion evidence: no repo rule instructs agents to assume ambient Graphite in generic runtime workflows, and `ns objective exec load-orientations` output is consistent with the code.

## Parked

- Objective Runner/autorunner Graphite-gate removal and prompt de-Graphiting — the mechanism is expected to be reconsidered as a whole; do not add an interim runner target/provider contract here. Revisit only from the future runner redesign.
- gh-stack adapter (topology first, then preparation/reconciliation, then publication via `submit --auto`/`link` per Flow policy) — named follow-up Objective; do not start here.
- `externalCommandProvider` for branch creation (BYO-ceremony scripts, JSON contract, agentic CLIs) — build when a concrete consumer exists; the seam and conformance suite here are its prerequisites.
- Provider-neutral alternatives to Graphite-branded surfaces (`[gt]` footer, `/gt:squash-stack`, stack-view, smart-restack) — new opt-in surfaces if ever wanted; never silent meaning changes.
- Repo cutover to a provider other than Graphite — after the follow-up Objective reaches parity.
- jj adapter — permanently out of scope; jj remains a contract-shape constraint only.
