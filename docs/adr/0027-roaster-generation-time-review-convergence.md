# ADR 0027: Generation-time Review Convergence

## Status

Proposed

This record is a proposal, not accepted architectural authority. Current implementation may resemble it, but that does not change this status.

## Context

Repeated PR reviews can rephrase or relocate already-surfaced findings after an author updates a branch. Exact publication deduplication only catches byte-identical findings and does not make model generation converge. A compute cache likewise misses the motivating case when the diff changes.

## Proposed Decision

Review convergence would happen primarily at generation time. A Reviews run could receive bounded prior findings for the same review key and PR, plus the last-reviewed PR head and base merge-base. The prompt would avoid re-raising prior findings unless code materially worsened, while an anchoring guard would preserve detection of genuinely new issues.

The GitHub Findings comment would be the durable store. Publication would stamp the reviewed head, base ref, base merge-base, and a capped cumulative set of surfaced findings so quiet rounds do not erase prior context. Changed-region guidance would compare prior and current PR deltas by merge-base, tolerating restacks better than raw head-to-head comparison.

Gathering would remain separate from the review core. Failure to gather or compare state would degrade safely to a context-free whole-diff review. Exact-match publication deduplication would remain as a deterministic backstop.

## Proposed Consequences

- Semantic repetition could be suppressed before publication rather than only deduplicated afterward.
- GitHub would remain the PR-scoped durable state instead of adding a distributed Branch Memory protocol.
- Review core execution would remain usable without GitHub context.
- Capping, pruning, restack behavior, and anchoring would require empirical validation.

## Alternatives

- **Compute cache:** deferred as a cost optimization, not a convergence mechanism.
- **Fingerprint ledger:** rejected because wording and line-anchor drift defeat it.
- **Branch Memory distribution:** rejected because GitHub already owns durable PR-scoped review state.
- **Hard delta-only review input:** rejected because whole-diff context remains important.
