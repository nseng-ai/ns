# Hard-Fail Budget Preflight Implemented

## Summary

The first oversized-roaster-review policy slice is implemented as a hard failure before Claude Code invocation. Roaster now evaluates local checkout diffs with a deterministic review budget: `max_changed_paths=300`, matching GitHub's PR diff endpoint boundary, and `max_diff_tokens=150_000`, leaving overhead below Claude Code's observed 200,000-token request limit.

When a review exceeds the budget, `roaster review run <key>` returns a structured negative Clinkr envelope with `error_type="review_budget_exceeded"`, review key, review path, model, base ref, changed-path count, full-diff token estimate, and thresholds. Publication parsing preserves that metadata so summary comments use review-key-specific markers such as `<!-- roaster:dignified-python -->` rather than collapsing matrix jobs to `roaster:unknown`. Inline posting no-ops before GitHub file/comment reads when the payload is an error or has no findings.

Verification: targeted roaster unit/scenario tests passed; full `just` passed. A `dignified-python` review subagent found one must-fix around unnecessary inline-posting GitHub reads for budget failures; that was remediated and validation was rerun.

## Objective Impact

The selected oversized-review policy is now durable: hard fail, not soft-pass and not sharding. The preflight budget and review-specific publication behavior complete the core prompt-too-long resilience slice for roaster review jobs while keeping ordinary small-review behavior unchanged.

Some broader Objective work remains open. Generic unstructured infrastructure failures can still fall back to generic failure metadata, broader GitHub file-discovery hardening outside the local-diff review path may still need investigation, and live oversized-PR workflow status semantics have not yet been rechecked in GitHub Actions.

## Follow-Ups

- Re-check an oversized synthetic or real PR workflow run to confirm GitHub Actions status/comment behavior end-to-end.
- Investigate whether any non-review-budget roaster/GitHub path still depends on `gh pr diff` or another 300-file-limited diff endpoint.
- Keep semantic sharding parked until deterministic budget and publication semantics are proven in CI.
