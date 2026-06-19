# Aretro Runner Template Parity

## Summary

PR #1867 (`aretro-run-source-cli-template-parity`) updates the final `aretro` cutover evidence: `skills/branch-retro/scripts/aretro-run` is no longer a hand-rolled dispatcher and no longer falls back to arbitrary `aretro` on `PATH`.

The runner is rendered from the shared TypeScript source CLI shim template in `script-checkout` mode. It preserves caller-checkout-first dispatch, checks `ts/node_modules` before running source, uses plain `node`, and falls back deterministically to the checkout containing the skill script when the caller is outside an asdl checkout. A parity test now renders the skill runner from the shared template and compares exact content to the checked-in script.

Evidence: local branch diff against Graphite parent `retire-python-aretro-record-typescript-cutover`, PR #1867, and the submitted commit `f29400cf9`.

## Objective Impact

This strengthens the completed Branch retrospectives / `aretro` TypeScript cutover record. The accepted distribution model is now more precise: the skill-local runner uses the same generalized source CLI shim rendering path as installed TypeScript shims, with deterministic script-checkout fallback rather than PATH fallback.

The repeated capability-subobjective roadmap row is now complete because every active first-party user-facing capability in the persisted sequence is TS-default, retired/no-port, or explicitly parked/out of scope. The umbrella Objective remains open for final migration cleanup, end-of-migration debt review, and parked/out-of-scope confirmation.

## Follow-Ups

- Keep final migration cleanup focused on ledger/playbook consistency, remaining parked/out-of-scope Python paths, and migration-debt review.
- Do not edit historical Semantic Updates that mention the earlier PATH-shim runner behavior; they remain provenance for the initial cutover state.
