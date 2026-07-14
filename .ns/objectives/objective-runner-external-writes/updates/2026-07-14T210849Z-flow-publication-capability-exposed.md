# Flow publication capability exposed

## Summary

Flow now owns a curated branch-publication Capability API for the Objective Runner steel thread. It resolves and binds the current non-trunk branch to its existing PR, rechecks branch, local HEAD, PR identity, head ref, and remote head before mutation, performs a normal non-force push of the exact expected commit, and then best-effort replaces one Objective-scoped managed PR-body region while preserving all human-authored prose.

The API reports push failure distinctly from push-success-plus-PR-update-failure and advances the bound remote-head facts after a successful push without attempting rollback. Real adapters use the host execution channel for `git` and `gh`; the implementation child receives neither the client nor credentials.

## Objective Impact

The third roadmap slice is complete. `@nseng-ai/flow/api` is now the curated boundary that the trusted Objectives parent orchestration can compose next, so the package-boundary leakage risk is de-risked for this seam. The change does not wire an autorun publisher and performs no external write by itself.

Fake-driven tests cover operation ordering, target drift, push refusal and failure, partial PR-update failure, later managed-region replacement, foreign or malformed regions, and preservation of non-managed prose. A disposable bare-remote integration test covers the guarded non-force push path. The Flow package test suite and native TypeScript check passed on the implementing branch.

## Follow-Ups

Wire this Flow client into the trusted post-checkpoint parent entrypoint using the Objective-owned authorization and summary contracts. Keep the implementation child credential-blind, record material Objective judgment before publication, and preserve push success as a partial success when the best-effort PR edit fails.
