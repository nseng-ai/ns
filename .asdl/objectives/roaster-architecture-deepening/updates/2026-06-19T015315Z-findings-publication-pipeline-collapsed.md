# Findings Publication Pipeline Collapsed Locally

## Summary

Candidate 1 now has a local implementation: roaster exposes one hidden `roaster exec publish` command backed by the in-process `publishFindings` workflow. The workflow parses the review-run envelope once, performs inline posting in memory, renders the summary with inline status, preserves the activity log, and adds or updates the summary comment through the existing GitHub gateway. The GitHub Actions workflow now prints the raw envelope and pipes it directly into `publish` with required fallback `--review-name` and `--base-ref` metadata; the old three-command/temp-file handoff has been removed.

Validation evidence: `pnpm --config.verify-deps-before-run=false --dir ts run test -- packages/roaster/test`, `pnpm --config.verify-deps-before-run=false --dir ts run fmt:check`, `pnpm --config.verify-deps-before-run=false --dir ts run lint`, `pnpm --config.verify-deps-before-run=false --dir ts run check`, `pnpm --config.verify-deps-before-run=false --dir ts run check:legacy`, `uv run pytest tests/scenario/test_roaster_workflow.py`, and targeted `dprint check` all passed. The stale old-command/temp-file grep is clean.

## Objective Impact

Candidate 1 moves from unstarted to locally implemented but not fully shipped. The implementation chooses deletion, not compatibility wrappers, for the three hidden exec commands; checked-in workflow, test, docs, and instruction references now point at `roaster exec publish`. The roadmap remains `[~]` because the Objective's candidate-1 evidence still calls for a real-PR roaster CI run to confirm publication behavior against GitHub Actions and `gh`.

## Follow-Ups

- Run roaster CI on a real PR and confirm summary/inline publication semantics before marking candidate 1 `[x]`.
- Continue with candidate 2 after candidate 1's real-PR validation evidence is recorded.
