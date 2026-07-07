# Source-spec grammar and first-slice source kinds decided

## Summary

Decision (user-confirmed via objective-next recommendation-continuation, 2026-07-07):

- **Grammar: adopt pi's spec grammar shape as the durable direction.** The `ns.toml`
  declaration list (working name `artifact-packages`) uses a uniform source-spec
  string grammar modeled on pi's debugged design (`earendil-works/pi`
  `packages/coding-agent`, commit `244f1deaf1ae0fc1a242d9df5cddf457cf3d36a7`, per
  `npm-bundled-artifact-provisioning/updates/20260706T215708Z-pi-update-mechanism-comparison.md`):
  - `npm:pkg` / `npm:pkg@version` — npm registry package, optionally pinned.
  - `git:host/user/repo@ref` — git source reconciled to the declared ref (reserved;
    not in slice one).
  - Local path — reserved; its acquisition-vs-discovery-pointer semantics remain an
    open question and are not decided here.
- **First-slice source kind: npm only.** Slice one parses, fetches, and provisions
  only `npm:` specs. Git and local-path specs are deferred until the fetched-module
  storage location and the acquisition gateway seam are decided; the grammar shape
  ensures adding them later does not reshape the declaration list.
- **Pinning semantics adopted with the grammar** (implemented in the update-semantics
  slice, consistent with the roadmap's fourth decision row): a versioned `npm:pkg@ver`
  spec is pinned — stable and skipped by `ns update` reconciliation; an unversioned
  `npm:pkg` spec reconciles to the registry's current resolution on `ns update`.
  Git refs, when they ship, are reconciled to the declared ref, never advanced past it.
- **Diagnostics posture:** unknown scheme prefixes or malformed specs in
  `artifact-packages` are per-entry diagnostics (LBYL), never silent skips, and never
  block acquisition/provisioning of other valid entries.

Rationale: borrow a debugged grammar rather than invent one (the record's first
Assumption); npm-only first is the lean candidate already named in the objective and
roadmap; keeping the full grammar shape durable while shipping one kind avoids
declaration-format churn.

## Objective Impact

- Resolves the first roadmap decision row (marked `[x]`) and the "Spec grammar
  adoption" open question: pi's grammar shape verbatim as the durable grammar;
  npm-only in slice one.
- The local-path open question ("acquisition or discovery pointer?") remains open —
  deliberately not decided by adopting the grammar shape.
- Unblocks the remaining decision rows (storage location, fetch mechanics/gateway,
  `ns update` composition, trust-posture re-judgment); implementation slices stay
  gated on those.
- No non-goal moved: no marketplace, no loose-skill acquisition, no solver/graph, no
  trust gate change.

## Follow-Ups

- Next decision row: fetched-module storage location and its explicit, inspectable
  record — decide before any fetch implementation (sticky-inertia risk).
- When git/local-path kinds activate, start from pi's semantics per the comparison
  update rather than a blank page, and re-check upstream freshness.
