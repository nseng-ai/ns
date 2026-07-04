# Roaster review convergence happens at generation time

## Status

Proposed

## Context

Roaster's CI review loop currently re-runs a whole-diff, stateless review on each push. When an author resolves feedback and resubmits, the diff often changes enough that the model rephrases or relocates the same criticism, so the harness download flow presents redundant work instead of a converging review. Roaster already has deterministic exact-match suppression for inline findings via sha256 comment markers, but that only suppresses byte-identical findings at the GitHub publication boundary; it cannot recognize a semantically repeated nitpick whose wording or line anchor drifted.

The abandoned cache/ledger design addressed compute reuse and publication dedupe, not the generator behavior that creates the treadmill. Review cache hits miss on the motivating resolve-resubmit cycle because the reviewed diff changes; CI/local diff parity is unresolved because pull_request CI reviews the synthetic merge commit while local runs review the branch head, with additional unpinned git diff configuration; and a fingerprint ledger has the same drift weakness as the existing inline-marker dedupe. Branch Memory origin distribution would also add a new distributed-sync mechanism even though the PR already persists Roaster's summary comment, inline threads, and review-thread resolution state.

## Decision

Roaster review convergence is a generation-time behavior. A review run may be supplied with bounded Prior-findings context for the same review key on the same PR, plus the Last-reviewed head recorded at the previous publish, and the prompt instructs the model to avoid re-raising previously surfaced findings unless the code materially worsened. Regions changed since the Last-reviewed head receive full-strength review; unchanged already-reviewed regions are held to the prior round's standard; and the prompt must include an anchoring guard so prior findings do not suppress genuinely new issues.

GitHub is the durable convergence store. The marker-keyed Findings comment remains the anchor, and publishing stamps machine-readable state into that comment: the prior PR head commit SHA, reviewed base ref, reviewed base merge-base SHA, and a capped cumulative union of surfaced findings. The cumulative findings block is required because the summary comment body is overwritten on each publish and inline threads only exist for inline-commentable findings; a successfully suppressed finding must not disappear from durable state after one quiet round. Review-time gathering reads that stamped block and hydrates thread resolution through the existing `@ns/capability-kit/github/pr-feedback` GraphQL surface. It does not reconstruct state by parsing rendered inline comment markdown.

Changed-region guidance compares the prior reviewed PR delta with the current PR delta, using the stamped base merge-base SHA and the current base merge-base rather than a raw old-head..new-head diff. This is necessary for Graphite restacks, where force-pushes rewrite commit SHAs and a raw head-to-head diff is dominated by upstream churn. The gatherer should fetch stamped head SHAs directly from origin when needed and degrade to Prior-findings-only convergence if the comparison cannot be computed.

Compute stays layered. Prior-findings context is an optional prompt input assembled by a separate PR-aware gathering step; `ns roaster review run` remains runnable with no PR context and no GitHub dependency in its core path. Gathering failure degrades to today's context-free full review: noisy but safe.

Roaster keeps the existing sha256 inline-marker exact-match dedupe at the publication boundary as a deterministic backstop. Generation-time semantic suppression handles rephrased or line-shifted repeats; exact-match dedupe still protects against duplicate inline publication when a finding is byte-identical.

## Rejected alternatives

- **Review compute cache / LLM-skip memoization.** Deferred rather than rejected for cost: it can compose later if compute cost matters. It is not the convergence mechanism because the motivating resolve-resubmit cycle changes the diff and misses the cache, and trusted hits first require local/CI diff parity that the current checkout modes and git diff configuration do not provide.
- **Fingerprint Publication ledger.** Rejected for convergence: it duplicates the exact-match/fingerprint shape Roaster already has at the inline publication boundary and fails when the model rephrases the same issue or shifts line anchors.
- **Branch Memory origin distribution.** Rejected for this Objective: it would introduce Branch Memory Pull/Push, merge, and fan-in persistence machinery to solve a durability problem GitHub already solves for PR-scoped review state. It would also require broader write permissions that the roaster workflow does not otherwise need.
- **Hard input-level delta scoping.** Rejected because Roaster should keep whole-diff context. Delta awareness belongs in the prompt so changed regions get full-strength review without blinding the model to surrounding context.

## Consequences

The durable state format in the Findings comment must be additive and preserve the existing `<!-- roaster:<key> -->` marker and rendered body compatibility. The Prior-findings cap and pruning policy are part of the publish/gather implementation detail, not a separate cache identity. Local runs stay PR-context-free unless explicitly supplied with gathered context or a future decision changes that default. Empirical validation must cover the motivating resolve-resubmit loop, an unchanged rerun, a content-preserving Graphite restack/force-push, and the anchoring case where new code near prior findings still surfaces fresh issues.
