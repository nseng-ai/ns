# CCC/orchestration row resolved: CCC becomes the cmux capability

## Summary

A live grilling session resolved the "Reexamine CCC and the orchestration layer" row:
CCC ("Cmux Command and Control") is an accretion, not a domain concept. The package's
real content is one domain — driving cmux workspaces — and the command-and-control
framing existed to justify a grab-bag boundary. Nine decisions were ratified and
recorded in ADR 0034 (`docs/adr/0034-rename-ccc-to-cmux-capability.md`) with execution
mechanics in `docs/wayfinding/ontology-reshape/cmux-reshape-spec.md`: strong-form
rename to `@nseng-ai/cmux` (CCC retired as anti-vocabulary, no aliases); flow-facade
residue deleted; the standalone `ccc` bin deleted with its one command re-homed as
`ns cmux exec workspace-summary`; Pi surfaces to `/ns:cmux:*`; skills to `ns-cmux-*`;
`capability-kit/cmux` kept as the neutral substrate (its move-out promise comment
deleted — the `ideas.md` item resolves as *delete*); worktree-status vocabulary
re-homed to `hosts/pi` where the code lives; internal structure normalized to
`api, core, ns, pi`; and a uniform ripple sweep (`cmux-dispatch` Branch Memory
namespace, `NS_CMUX_SIDEBAR_MODEL`, `.pi/extensions/cmux.ts`) with no migrations.

Session evidence that shaped the decisions: the sweep-confirmed drift (phantom
subpackages, retired `/ns:objective:stack-impl` terms, false worktree-status
ownership), the discovery that all three `src/ns/` workflow subpaths are unconsumed
re-export shims over `@nseng-ai/flow/api`, the one-command bin, and the
`hosts/pi`-on-kit-typings dependency that rules out moving the kit cmux substrate
above the host tier.

## Objective Impact

- The CCC/orchestration grilling row is resolved; a new execution task row "Execute
  the cmux reshape spec" graduated per the reshaping handoff vehicle. The triage row
  now waits on two remaining reexamination rows (source-control lifecycle,
  review/feedback residue).
- Cross-initiative decision: `cross-harness-parity` closes by explicit user decision
  rather than gaining an edge — its remaining goals (dispatch CLI parity,
  command-output summaries, parity-table sweep) are released to the future e2e-docs
  effort, and this reshape deliberately builds no dispatch parity. Its closure drops
  the "Pi is additive, never canonical" orientation from the always-load set; that
  doctrine's successor home is the e2e-docs work.
- The `nscc` naming question (excluded from the batch-brands row as belonging here) is
  fully dispositioned: deleted, per the earlier update.
- Method log: the grilling ran evidence-first (drift audit + sweeps pre-loaded),
  walked one decision branch per exchange with a recommended answer each, and
  repeatedly found that live code facts (shim-only subpaths, a one-command bin,
  typings consumed by the host) collapsed what looked like open design questions into
  near-forced moves. The spec was written against the eight-point contract
  immediately after ratification, in-session.

## Follow-Ups

- Run the spec through the saved-plan pipeline: read-only verification sweep, ratified
  enriched plan, dedicated execution session (never this decision session).
- Perform the explicit `objective-close` workflow for `cross-harness-parity` with
  closure prose recording the release-to-e2e-docs decision.
- At documentation phase, recompute the fan-out figure and package counts from live
  source rather than carrying sweep-era numbers.
