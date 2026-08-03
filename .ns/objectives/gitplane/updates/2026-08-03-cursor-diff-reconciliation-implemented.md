# Semantic Update: cursor-last reconciliation with durable retry baselines

## Summary

Gitplane now exposes public core cursor-diff reconciliation and the functional `gitplane reconcile <commit>` CLI. Reconciliation completely reads and validates source and store facts before writes, persists a deterministic immutable per-artifact baseline, applies artifacts in stable ID order, and advances the source cursor only after all materialization writes succeed. Equal-cursor normal runs recover post-CAS cleanup without replaying materialization.

Full mode supports initial synchronization and complete repair at descendant, equal, older, or divergent non-merge commits. Events are reconstructed only for strict forward ancestry; other repair shapes avoid synthetic history. Durable baselines retain cursor-derived prior facts across partial writes, reject competing targets or incompatible rebuilt plans, and are removed by digest-guarded compare-and-delete after cursor advancement and error resolution.

The bounded CLI contract reports mode, domain status, transition counts, event-reconstruction status, cursor advancement, and newly resolved errors. Operational write and cleanup failures are sanitized and recorded best effort without classifying planning, corpus, history, configuration, concurrency mismatch, or store-close failures as reconciliation errors.

## Objective Impact

This completes the cursor-diff reconciliation roadmap slice. Public-core fake scenarios cover generic and classified creation, move/revision combinations, deletion and restoration, one-way classification and directed schema transitions, target-wide duplicate IDs, complete planning before writes, deterministic apply/event order, every operational write boundary with retry, cursor mismatch and backend failure, cleanup-only recovery, competing-target refusal, and equal/older/divergent/unavailable-history full repair. Shared fake/SQLite conformance proves same-value cursor compare-and-set, baseline persistence and guarded deletion, and count-bearing error resolution; real Git integration proves marker-only target inventory.

Validation passed for both focused package typechecks and tests, SQLite integration, repository default/integration/isolated suites, TypeScript style guard, Objective validation, and final `just`.

## Follow-Ups

Continue with the reference consumer, then the check-only GitHub Action and final README/spec promotion. Those later rows remain open and unchanged.
