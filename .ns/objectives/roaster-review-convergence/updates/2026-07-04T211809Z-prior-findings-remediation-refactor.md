# Prior-Findings Remediation Refactor

## Summary

Current PR evidence shows a follow-on remediation branch, `roaster-review-prior-findings-context-remediation` / PR #2890, refactoring the already-complete Prior-findings implementation without changing the Objective's convergence mechanism.

- PR #2890: Refactor prior-findings review prompt assembly and gateway plumbing — moves convergence guidance into prompt asset files, centralizes Prior-findings request normalization, simplifies gateway plumbing, standardizes summary comment lookup on `ROASTER_BOT_LOGIN`, and consolidates fake-driven test support for prior-findings GitHub behavior.

## Objective Impact

No roadmap checkbox changes: the ADR, publish stamping, Prior-findings gathering, prompt context/instructions, and CI wiring rows remain complete in the landed-state model, and the empirical validation row remains the only non-parked semantic work.

The remediation reinforces the completed implementation rows by making prompt/gateway behavior more maintainable while preserving the core boundary that `ns roaster review run` remains PR-free unless Prior-findings PR context is explicitly supplied. It adds no GitHub writes, permissions, workflow triggers, cache/ledger machinery, or hard input-level delta filtering.

## Follow-Ups

- Continue normal review/landing for PR #2890 as part of the stack.
- Human-steered empirical validation remains the next Objective slice: representative PRs must demonstrate suppression of prior findings on unchanged code, quiet unchanged/restack reruns, and full-strength review for new issues.
