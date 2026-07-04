# ADR: Generation-Time Review Convergence

## Summary

The ADR for Roaster review convergence was added as `docs/adr/0027-roaster-generation-time-review-convergence.md` on the local branch `roaster-review-convergence/adr-generation-convergence`.

It records the durable architecture decision: Roaster convergence happens by conditioning review generation on bounded Prior-findings context and Last-reviewed head state, with GitHub PR comments/threads as the durable store; the core review run remains PR-context-free unless optional context is supplied; existing sha256 inline-marker dedupe remains as a publication backstop; cache, fingerprint-ledger, Branch Memory distribution, and hard input-level delta scoping are rejected or deferred for the reasons captured in the Objective.

## Objective Impact

The first roadmap Work row is complete in the landed-state model: the ADR draft now captures generation-time convergence, GitHub-as-durable-state, compute layering, and the rejected cache/ledger design with parity and fingerprint-drift evidence.

The Objective remains open. Implementation rows for publish stamping, Prior-findings gathering, prompt wiring/instructions, CI wiring, and empirical validation remain active.

## Follow-Ups

- Implement additive summary-comment stamping for Last-reviewed head and the cumulative capped Prior-findings block.
- Build Prior-findings context gathering and optional prompt wiring without coupling the default `ns roaster review run` path to GitHub.
- Preserve empirical validation as a human-steered slice because it requires real PRs, LLM compute, and GitHub writes.
