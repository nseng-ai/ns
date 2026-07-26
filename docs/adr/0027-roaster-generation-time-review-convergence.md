# ADR 0027: Generation-time Review Convergence

## Status

Proposed

This record is proposal, not accepted architectural authority. Current implementation may resemble it; that does not change this status.

## Context

Repeated PR reviews can rephrase or relocate already-surfaced findings after author updates branch. Exact publication deduplication only catches byte-identical findings, does not make model generation converge. Compute cache likewise misses motivating case when diff changes.

## Proposed Decision

Review convergence would happen primarily at generation time. A Reviews run could take bounded prior findings for same review key and PR, plus last-reviewed PR head and base merge-base. Prompt would avoid re-raising prior findings unless code materially worsened; anchoring guard would keep detection of genuinely new issues.

GitHub Findings comment would be durable store. Publication would stamp reviewed head, base ref, base merge-base, and capped cumulative set of surfaced findings, so quiet rounds do not erase prior context. Changed-region guidance would compare prior and current PR deltas by merge-base, tolerating restacks better than raw head-to-head comparison.

Gathering would stay separate from review core. Failure to gather or compare state would degrade safely to context-free whole-diff review. Exact-match publication deduplication would stay deterministic backstop.

## Proposed Consequences

- Semantic repetition could be suppressed before publication, not only deduplicated afterward.
- GitHub would stay PR-scoped durable state instead of adding distributed Branch Memory protocol.
- Review core execution would stay usable without GitHub context.
- Capping, pruning, restack behavior, anchoring would need empirical validation.

## Alternatives

- **Compute cache:** deferred as cost optimization, not convergence mechanism.
- **Fingerprint ledger:** rejected: wording and line-anchor drift defeat it.
- **Branch Memory distribution:** rejected: GitHub already owns durable PR-scoped review state.
- **Hard delta-only review input:** rejected: whole-diff context stays important.
