# Semantic Update: existing PR prose regeneration made explicit

## Summary

Ordinary `ns flow submit` now treats the pre-submit PR inventory as a prose-ownership boundary. PRs newly created by the invocation still receive temporary initial generated titles and ns-managed descriptions. PRs that existed before the invocation have their title and body left untouched, including when the body is empty or the managed fingerprint is missing, malformed, stale, or unchanged.

`ns flow submit --regenerate-descriptions` is the explicit stack-scope rewrite and forcefully regenerates coupled titles and managed body regions for every submitted PR. `ns flow regenerate-pr` remains the focused current-branch rewrite.

This supersedes the 2026-07-11 empty-existing-body backfill mitigation. That mitigation repaired bare PRs left by raw Graphite submission, but ordinary resubmission could also overwrite accountable human prose. Explicit regeneration preserves the recovery operation without retaining the implicit overwrite risk.

## Objective Impact

This is an interim safety step, not the Objective destination. Initial metadata for brand-new PRs remains temporarily in legacy submit. The settled destination is unchanged: cheap `submit` performs no PR-prose work, and future `ship` owns review-readiness prose reconciliation across the stack.

The Ship pipeline integration row remains open. No review/autofix, ship attestation, final no-prose-submit migration, or live publication claim is completed by this update.
