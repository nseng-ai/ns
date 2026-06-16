# pr-address Strangler Rewrite — Salvage the Core, Isolate the Orchestration

## Thesis

`pr-address` has hill-climbed into ~13.7k LOC of source, 21 `exec` commands, and
~2k lines of skill prose the agent executes by hand. The actual capability is
small: fetch a PR's feedback, decide what to do with each item without dropping
any, make changes, reply-and-resolve threads honestly with approval gating on the
risky ones, and verify nothing was left behind — never pushing. Yet roughly half
the source is payload-store / session machinery whose only job is to keep big
feedback blobs out of the agent's context window, and that machinery has leaked
into the domain model the agent must reason about (sessions, payload paths, JSON
pointers, locators, roles, compact/full digests).

The durable strategy is **strangler-on-salvage**, not a from-scratch rewrite and
not an in-place refactor. The codebase splits into three trust zones, made
obvious and compiler-checkable by an enforced import-direction boundary:

- **core/** (GOOD) — salvaged, golden-tested domain leaves: gateways, feedback
  collection/normalization, reply formatting + resolution modes, the
  classify-exactly-once cardinality check, and the classification heuristics.
- **legacy/** (BAD) — the old orchestration + payload store, frozen and being
  strangled. Done = this directory is deletable.
- **app/** (NEW) — the small set of verbs, grown bit-by-bit on `core/` only.

This Objective is the **steel thread**: stand up the three-zone layout with an
enforced import boundary, carve the trusted core out (using the compiler to find
the seams), and prove the new surface end-to-end with the two *read-only* verbs
(`feedback`, `status`). The dangerous mutation parity work, the shim cutover, and
the deletion of `legacy/` are deliberately a follow-up Objective.

## Scope

- Establish a `src/{core,legacy,app}` zone layout in `ts/packages/pr-address`.
- Add an enforced import-direction boundary (lint rule): `core/` imports neither
  `legacy/` nor `app/`; `app/` imports only `core/`; `legacy/` is frozen.
- Carve cleanly-salvageable leaves into `core/` (gateways, feedback collection,
  summarize/compaction, GitHub/manifest mirror schemas), letting `tsc` surface
  the exact couplings to cut.
- Split the mixed files that contain both a trusted leaf and orchestration
  residue — extract the good function into `core/`, leave the residue in
  `legacy/`: the classification cardinality check, reply formatting + the four
  resolution modes, resolve-decision validation, and body-on-demand lookup.
- `git mv` the remaining orchestration into `legacy/` untouched so the old `exec`
  surface keeps running.
- Build the two read-only verbs on `core/` only: `feedback` (compact item list,
  bodies on demand) and `status` (re-fetch GitHub, report unresolved/unskipped
  threads). Treat persistence as guilty-until-proven: attempt zero inter-call
  state, with re-fetch as source of truth.
- Adopt the existing golden/scenario tests as the acceptance spec for carved
  `core/` modules.

## Non-Goals

- `resolve` / `reply` mutation verbs and mutation parity on real PRs (the
  dangerous part) — deferred follow-up.
- Cutting the `pr-address` shim over to the new surface.
- Deleting `legacy/` or collapsing the ~2k lines of skill prose.
- Changing the classification heuristics in `feedback-classifier.md` — preserved
  verbatim.
- Any change to GitHub write behavior; the never-push, commits-stay-local
  contract is untouched.

## Completion Criteria

- `src/core`, `src/legacy`, and `src/app` exist, and every current module is
  assigned to exactly one zone.
- The import-boundary lint rule is active and green: `core/` has zero imports
  from `legacy/` or `app/`, and `app/` imports only from `core/`.
- The mixed files are split: each salvaged function lives in `core/` with its
  golden test passing; any still-needed residue remains in `legacy/`.
- The `feedback` verb returns a compact item list from `core/` collection with no
  payload-store / session vocabulary in its output contract.
- The `status` verb re-fetches GitHub and reports unresolved/unskipped threads
  while depending on no persisted artifact.
- The old `exec` surface still runs (`legacy/` untouched); nothing is pushed.
- Evidence: carved-core golden/scenario tests pass, the new `feedback`/`status`
  verbs have scenario tests against in-memory gateways, and the import-boundary
  lint passes.

## Assumptions and Risks

Assumptions:

- The trusted leaves (collection, reply formatting, modes, cardinality check,
  classification rules) can be extracted with zero `legacy/` imports. This is
  proven, not asserted, by the compiler-driven carve — if a leaf won't free
  cleanly, the failing import *is* the seam to cut, not a dead end.
- GitHub is a sufficient source of truth for `status`, so a re-fetch can replace
  the checkpoint/finalize audit trail entirely.

Risks:

- A leaf assumed "core" may be entangled with `session-inputs`/`payload-store`
  more deeply than expected, expanding the split work. Mitigation: the compiler
  surfaces this early; descope a stubborn leaf to `legacy/` rather than forcing
  it.
- Mutation parity is the genuinely dangerous behavior (lying to reviewers,
  dropping threads) and is deliberately out of scope here; the steel thread must
  not accidentally couple the new read-only verbs to mutation code paths.
- Two orchestrations coexist for the duration of the steel thread. This is
  accepted and time-boxed by the follow-up cutover Objective.

## Open Questions

- Do `feedback`/`status` need any inter-call persistence at all, or does re-fetch
  suffice? Resolve empirically during the carve; default to zero persistence.
- Where exactly to split `classification.ts` and `mutation-operations.ts` —
  the precise function boundaries are determined by the carve.
- Should the new verbs live under a new command group inside the existing CLI, or
  a separate entry point until cutover?
