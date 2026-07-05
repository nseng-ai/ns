---
timestamp: 2026-07-05T22:52:09Z
branch: github-pr-feedback-comment-kit
---

# Semantic Update: GitHub PR Feedback Comment Mechanics Promoted

## Summary

The final second-wave Work row landed on local branch `github-pr-feedback-comment-kit`: reusable GitHub REST PR feedback/comment mechanics moved into `@nseng-ai/capability-kit/github/pr-feedback`, and both known consumers now use the kit surface.

## Objective Impact

- `@nseng-ai/capability-kit/github/pr-feedback` now owns reusable GitHub REST PR feedback/comment mechanics:
  - changed-file reads;
  - REST review-comment summary reads;
  - inline PR review creation through temporary JSON input;
  - issue/discussion comment listing, marker lookup, create, update, and marker-based upsert;
  - REST feedback fingerprint part reads for discussion comments, reviews, and review comments.
- Kit testing support now includes `FakeGithubPrFeedbackGateway` for the promoted read/write mechanics without Roaster-specific vocabulary.
- `@nseng-ai/reviews` keeps `RoasterGitHubGateway` and Roaster failure envelopes, but `RealRoasterGitHubGateway` is now a thin adapter over kit GitHub PR feedback mechanics for the promoted operations.
- `@internal/pi-tools` `pr-feedback-watch` now loads REST feedback fingerprints through kit `RealGithubPrFeedbackGateway`, using a local Pi `ExecGateway` → foundation `CommandRunner` adapter; watch fingerprint parsing and UI/session behavior remain local.

Compatibility notes:

- The kit preserves `pr-feedback-watch`'s legacy `gh api --method GET ... --jq ...` projections for REST fingerprint polling so existing scripted behavior and payload shape remain stable.
- Roaster-specific user-facing failure wording is still produced in `reviews/src/gateways/github.ts`; kit failures stay neutral `GithubPrFeedbackFailure` values.
- GitHub PR discussion comments keep a string `url` field for existing downstream consumers; REST endpoints that do not return a URL normalize it to an empty string.

Validation evidence:

- `pnpm --dir ts --filter @nseng-ai/capability-kit test`
- `pnpm --dir ts --filter @nseng-ai/reviews test`
- `pnpm --dir ts --filter @internal/pi-tools test`
- `pnpm --dir ts run check`
- `pnpm --dir ts run lint`
- `pnpm --dir ts run fmt:check`
- `just ts-test-typescript-style-guard`
- `just`

## Follow-Ups

- No follow-up is required for the final GitHub REST comment mechanics Work row.
- Objective closure can be considered separately if the owner agrees all Parked rows should remain parked and the completed Work slate satisfies the Objective's completion criteria.
