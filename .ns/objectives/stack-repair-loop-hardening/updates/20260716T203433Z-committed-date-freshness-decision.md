# Semantic Update: committed-date freshness decision

## Summary

GitHub's GraphQL `Commit` type does not expose an authoritative timestamp for transport of an individual commit to GitHub. Repository `pushedAt` can move for unrelated pushes, while `authoredDate` describes authorship rather than the selected commit object.

The enriched `branch-pr-checks` contract therefore uses the selected PR head commit's `committedDate`, verifies that commit's OID equals `headRefOid`, and exposes the source fact as `head_commit_committed_at`. It does not retain the misleading `head_commit_pushed_at` name.

## Objective Impact

Freshness is relative to creation of the current commit object. Re-pushing the same SHA is not observable, which is an accepted limitation and must remain explicit in the contract and package documentation. Missing committed time remains `null` and yields `unknown` freshness; mismatched head/commit OIDs are gateway failures.

## Follow-Ups

Implement the enrichment and complete-pagination behavior against this revised contract. Keep the later failed-check log, final skill rewrite, and push-down audit roadmap rows open.
