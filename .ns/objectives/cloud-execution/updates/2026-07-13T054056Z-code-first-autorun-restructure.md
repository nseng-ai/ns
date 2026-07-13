# Code-first autorun restructure adopted

## Summary

User decision (2026-07-13, objective-autorun launch preview): the autorun
loop builds the spine code-first and end-to-end, deferring every live
interlude to one batched verification pass afterward. The run's step order
is: (1) the `build:deployable` gate extension for `"use workflow"` /
`"use step"` packaging, (2) mint-core in-process exposure, (3) probe-1
code, (4) probe-2 code, (5) probe-3 code, then the steel thread's three
code sub-slices — (6) the dispatch workflow, (7) the ns-owned pi runner
package, (8) CLI-side `ns dispatch prompt` including dispatch preflight.
Every step is locally green per the Definition of Progress; deploy,
trigger/observe cycles, and the real dispatch happen only after the code
run, and nothing is asserted as live-verified until then.

This amends the recorded autorun phase 1 ordering (2026-07-13,
autorun-execution-policy Semantic Update), which interleaved a
deploy-and-observe interlude after probe-1 and gated probe-2/3 code on
probe-1's proven facts. The accepted trade-off: the first deploy verifies
the whole spine at once, so a wrong packaging assumption has a wider
repair radius. Mitigation: the gate extension lands first, so every
subsequent step's validation runs against the extended local
deployability gate; and all live-unproven behavior stays explicitly
pending verification in README/reference prose.

## Objective Impact

- The workflow-spine-probes row's phase-1 sequencing note and the steel
  thread's "gated by the spine probes" ordering are amended for this run:
  probe-2/3 and steel-thread *code* proceed ahead of live probe facts;
  live gating now applies to verification claims and fact-folding, not to
  writing the code.
- The escape-local-validation risk gains a live-verification debt: after
  the code run, one batched interlude (deploy, probe 1–3 trigger/observe,
  then the per-action-consented steel-thread e2e) must retire it before
  any completion claims.

## Follow-Ups

- After the code run: the batched live pass — deploy the package, run
  probes 1–3 through the trigger route with `getRun` observation and
  cleanup, then the real `ns dispatch prompt` e2e under the Runner
  Policy's per-action consent gate for anchor push/PR.
- Fold proven live facts into the canonical README and references only
  from that pass, written by the actor that witnessed them.
