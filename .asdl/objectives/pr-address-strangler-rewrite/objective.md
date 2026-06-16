# pr-address Strangler Rewrite — Salvage the Core, Isolate the Orchestration

## Thesis

`pr-address` has hill-climbed into ~13.7k LOC of source, 22 `exec` commands, and
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
- **app/** (NEW) — the `PrAddressRunEngine`/RunKernel façade and small verb set,
  grown bit-by-bit on `core/` only.

This Objective is the **first read-only strangler slice**: stand up the
three-zone layout with an enforced import boundary, define the new RunEngine
boundary, carve the trusted core out (using the compiler to find the seams), and
prove the new surface end-to-end with the read-only primitives (`feedback`,
`details`, `status`). The target agent interface is the six-verb shape
(`feedback`, `details`, `plan`, `batch`, `status`, `reply`), but each primitive
should get its own thin end-to-end strangler slice instead of one big cutover.
This Objective implements only the read-only slice. The dangerous mutation parity
work, full shim cutover, and deletion of `legacy/` are deliberately follow-up
Objectives.

## Scope

- Establish a `src/{core,legacy,app}` zone layout in `ts/packages/pr-address`.
- Add an enforced import-direction boundary (lint/static test rule): `core/`
  imports neither `legacy/` nor `app/`; `app/` imports only `core/`; `legacy/` is
  frozen.
- Introduce `PrAddressRunEngine`/RunKernel in `app/` as the only new
  orchestration vocabulary. Its public target verbs are `feedback`, `details`,
  `plan`, `batch`, `status`, and `reply`; this first read-only strangler slice
  implements `feedback`, `details`, and `status` first.
- Carve cleanly-salvageable leaves into `core/` (gateways, feedback collection,
  summarize/compaction, GitHub/manifest mirror schemas), letting `tsc` surface
  the exact couplings to cut.
- Split the mixed files that contain both a trusted leaf and orchestration
  residue — extract the good function into `core/`, leave the residue in
  `legacy/`: the classification cardinality check, reply formatting + the four
  resolution modes, resolve-decision validation, and body-on-demand lookup.
- `git mv` the remaining orchestration into `legacy/` untouched so the old `exec`
  surface keeps running.
- Build the read-only verbs on `app/`/RunEngine over `core/` only: `feedback`
  (compact item list), `details` (body/detail handle lookup), and `status`
  (re-fetch GitHub, report unresolved/unskipped threads). Internal durable run
  state is allowed only behind the RunEngine if it proves useful; agent-visible
  payload-store/session vocabulary is not allowed in the new contract.
- Adopt the existing golden/scenario tests as the acceptance spec for carved
  `core/` modules.

## Non-Goals

- Implementing `plan`, `batch`, or `reply` as production-ready new-surface verbs;
  mutation parity on real PRs is the dangerous part and remains deferred.
- Cutting the `pr-address` shim fully over to the new surface.
- Deleting `legacy/` or collapsing the ~2k lines of skill prose.
- Changing the classification heuristics in `feedback-classifier.md` — preserved
  verbatim.
- Any change to GitHub write behavior; the never-push, commits-stay-local
  contract is untouched.

## Completion Criteria

- `src/core`, `src/legacy`, and `src/app` exist, and every current module is
  assigned to exactly one zone.
- The import-boundary lint/static test rule is active and green: `core/` has zero
  imports from `legacy/` or `app/`, and `app/` imports only from `core/`.
- `app/` contains a `PrAddressRunEngine`/RunKernel boundary whose public contract
  names only domain verbs, handles, decisions, batches, and status — never
  payload paths, descriptors, locators, roles, compact/full modes, sessions, or
  latest-artifact references.
- The mixed files are split: each salvaged function lives in `core/` with its
  golden test passing; any still-needed residue remains in `legacy/`.
- The `feedback` verb returns a compact item list through the RunEngine from
  `core/` collection with no payload-store / session vocabulary in its output
  contract.
- The `details` verb opens one body/detail handle through the RunEngine without
  exposing filesystem payload protocol.
- The `status` verb re-fetches GitHub and reports unresolved/unskipped threads
  while requiring no agent-visible persisted artifact.
- The old `exec` surface still runs (`legacy/` untouched); nothing is pushed.
- Evidence: carved-core golden/scenario tests pass, the new
  `feedback`/`details`/`status` scenario tests pass against in-memory gateways,
  and the import-boundary lint/static test passes.

## Assumptions and Risks

Assumptions:

- The trusted leaves (collection, reply formatting, modes, cardinality check,
  classification rules) can be extracted with zero `legacy/` imports. This is
  proven, not asserted, by the compiler-driven carve — if a leaf won't free
  cleanly, the failing import *is* the seam to cut, not a dead end.
- GitHub is a sufficient source of truth for `status`, so a re-fetch can replace
  the checkpoint/finalize audit trail as the agent-facing final verification
  protocol.
- Hidden run state may be useful for performance, batching, or decision history,
  but only as implementation state behind RunEngine. The run ledger is not the
  user interface.
- De-risked: the "never drop a feedback item" thesis depended on collection
  reading every review thread and comment. The GitHub review-thread query was
  previously non-paginating (first 100 threads, first 20 comments per thread);
  paginating both thread and per-thread comment connections closes that
  under-collection gap, so the carved collection inputs are no longer silently
  truncated on large PRs.

Risks:

- A leaf assumed "core" may be entangled with `session-inputs`/`payload-store`
  more deeply than expected, expanding the split work. Mitigation: the compiler
  surfaces this early; descope a stubborn leaf to `legacy/` rather than forcing
  it.
- Mutation parity is the genuinely dangerous behavior (lying to reviewers,
  dropping threads) and is deliberately out of scope here; the read-only
  strangler slice must not accidentally couple the new read-only verbs to
  mutation code paths.
- A too-thin façade could preserve the old payload/session protocol under new
  names. Mitigation: completion requires the RunEngine and command outputs to
  exclude old artifact vocabulary entirely.
- Two orchestrations coexist for the duration of the read-only strangler slice.
  This is accepted and time-boxed by the follow-up cutover Objective.
- A read-only feedback-download capability (`download-feedback`) now exists on
  the bootstrap/legacy `exec` surface rather than behind the RunEngine. It
  consumes the carved `core/` collection leaves, so it does not reintroduce
  payload/session vocabulary into `core/`, but it is a second read-only feedback
  surface. Mitigation: the planned RunEngine `feedback`/`details` verbs must
  subsume or replace this command rather than leaving a third surface; do not
  promote its `harness_session_id`-style input shape into the new app contract.

## Open Questions

- What is the minimum hidden RunEngine state, if any, needed for the read-only
  slice? Resolve empirically during the carve; default to re-fetch and no
  required inter-call state.
- What should a stable detail handle look like if it is not a JSON pointer,
  payload path, or artifact locator?
- Where exactly to split `classification.ts` and `mutation-operations.ts` — the
  precise function boundaries are determined by the carve.
- Should the new verbs live under the existing hidden `exec` group during the
  read-only strangler slice, or a separate entry point until cutover?
