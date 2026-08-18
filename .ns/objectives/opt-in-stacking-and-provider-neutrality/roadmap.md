# Roadmap

## Work

- [x] Write the direction ADR: opt-in stacking default, capability-split provider neutrality, adapter-collapse pluggability (external-command as a future adapter, not a point kind), and the eight jj "do not preclude" guardrails with jj named as the extensibility stress case.
      Evidence: accepted `docs/adr/0049-opt-in-provider-neutral-stacking.md`; its eight guardrails are the review criteria for later seam work.
- [x] Produce the capability/semantic matrix — Graphite vs `gh stack` (v0.0.8 observed semantics: `view --json`, `submit`, `sync`, `link`, `rebase`) vs jj-as-constraint — and record neutral stacking vocabulary in the relevant `CONTEXT.md` files.
      Evidence: `docs/conventions/stack-provider-capability-matrix.md`; Flow, Graphite, and Branch Context contexts distinguish neutral targets/capabilities from provider-private facts.
- [x] Remove the Herdr startup coupling: no Graphite trunk resolution at extension registration; stack-provider lookup becomes lazy and scoped to the implementation workflows that need it.
      Evidence: `@nseng-ai/herdr` registration constructs no Graphite gateway and performs no `gt` call; the three implementation commands derive trunk from the repo's cached `refs/remotes/origin/HEAD` git fact (no `gt trunk` anywhere in Herdr) only after the Local-trunk basis is selected, with failures command-local and actionable. The now-unconsumed `GraphiteBranchGateway.trunkBranch` was deleted from extension-kit. Focused herdr/extension-kit suites plus repo `just` validation pass; tests prove registration and an unrelated command work with `gt` unusable. Local branch `remove-herdr-startup-graphite-coupling`.
- [ ] Replace the Objective Runner Graphite-tracking gate with the default invariant (non-trunk branch carrying the verified commit), with stack-membership checks only under explicit stack intent; de-Graphite the runner child prompt accordingly.
- [ ] Move generic trunk discovery in Flow (trunk-pull, checkpoint/cp paths) off Graphite onto git/config facts where no stack metadata is required.
- [x] Make Branch Context provider construction policy-selected and lazy: plain-git path constructs no Graphite gateway; creation methods resolve at the composition root.
      Evidence: Branch Context core now accepts an injected branch-creation provider, plain Git and Graphite adapters share the Extension Kit contract, and the Pi surface separates plain Git (`/ns:git:*`) from Graphite (`/ns:gt:*`) without provider flags or an ambient Graphite default. Focused package tests cover provider selection and plain-Git operation without constructing Graphite.
- [ ] Audit behavior with no stack provider configured: inventory every user-facing workflow that remains fully available, degrades with explicit limitations, or is unavailable; use the result to define supported no-stacking behavior and implementation sequencing.
- [ ] Introduce discriminated branch-vs-stack targets for submit, land, and branch creation, with explicit provider selection (flag or repo config; absence means none) and no autodetection selecting mutating behavior; define this repo's Graphite-selected configuration and any documented compatibility phase for current `ns flow submit` stack behavior.
- [ ] Extract the neutral stack model (ordered parent edges, trunk, optional current branch, typed cycle/fork/missing diagnostics) with the Graphite topology adapter behind it; migrate Flow land/submit planning behavior-preservingly.
      Evidence: existing Flow land/submit suites pass unchanged; topology conformance suite runs against the Graphite adapter.
- [ ] Split mutation capabilities behind separate seams — stacked-branch preparation, reconciliation (outcomes include `not-needed`/`automatic`), publication (input: ordered branch list) — keeping Flow policy above the seams and Graphite command mechanics inside the adapter.
- [x] Cut the `BranchCreationProvider` seam with `plain-git` (default) and `graphite` adapters plus its conformance suite; keep additive `branch-context.create.pre`/`.post` ceremony as ordinary hook points if demanded in this window.
      Evidence: `@nseng-ai/extension-kit/branch-creation` exposes the provider contract and shared conformance suite; built-in Git and Graphite adapters verify branch postconditions through Git facts. The Branch Context API separates plan preparation, provider creation, and attachment so provider consumers do not require private state.
- [ ] Reconcile standing guidance with the landed direction: `docs/conventions/graphite-dependency-boundary.md`, affected skills, and this objective's `orientation.md`; shrink or retire temporary orientation lines as couplings land.
      Evidence: no repo rule instructs agents to assume ambient Graphite; `ns objective exec load-orientations` output consistent with the code.

## Parked

- gh-stack reconciliation and publication adapters (`sync`, `submit --auto`, or `link` per future Flow policy) — named follow-up Objective. By user-approved course change, this branch delivered the narrower GitHub Stacks local topology-inspection and branch-creation Pi consumer needed for explicit GS Branch Context workflows; it does not claim reconciliation or publication parity.
- `externalCommandProvider` for branch creation (BYO-ceremony scripts, JSON contract, agentic CLIs) — build when a concrete consumer exists; the seam and conformance suite here are its prerequisites.
- Provider-neutral alternatives to Graphite-branded surfaces (`[gt]` footer, `/gt:squash-stack`, stack-view, smart-restack) — new opt-in surfaces if ever wanted; never silent meaning changes.
- Repo cutover / provider-selection flip for this repository — after the follow-up Objective reaches parity.
- jj adapter — permanently out of scope; jj remains a contract-shape constraint only.
