# Preflight PR facts batched for large stacks

## Summary

Local branch `flow-land-large-stack-performance/post-merge-pr-cache` batches large-stack preflight PR fact loading. For stacks over two branches, Flow land now uses one `gh repo view` plus one `gh api graphql` batch query instead of per-branch `gh pr view`; small stacks keep the existing per-branch behavior. `gh pr merge`, strict merge-time PR/head checks, and post-merge verification remain unchanged.

Measured against the optimized current fake-backed large-stack scenarios:

- linear-11 improved from 163 to 154 total external calls, with github-cli calls dropping 54 to 45.
- linear-25 improved from 359 to 336 total external calls, with github-cli calls dropping 124 to 101.

The static GraphQL rate-limit estimate is intentionally conservative for the batch path and rises by one because it accounts for one PR connection per branch plus the repo lookup, even as GraphQL request and CLI call volume drops. Validation: the runner checkpoint for commit `b551482177fa3abf08a9c8c60654239729761d21` reports targeted scenario tests, `just ts-check`, formatter fixes, and final full `just` passing.

## Objective Impact

Advances the GitHub/`gh`/API call-volume row with measured read-path dedup evidence while preserving the merge primitive and safety checks that Runner Policy marks steer-first. The remaining GitHub call-volume work is narrower: duplicate facts around the merge loop may still be possible, but only if strict freshness is preserved.

## Follow-Ups

- Evaluate whether merge-loop duplicate PR facts can be reduced without weakening strict freshness or replacing `gh pr merge`.
- Continue treating direct GraphQL merge replacement as steer-first, not an autorun slice.
- Graphite maintenance cost remains a separate actionable optimization row.
