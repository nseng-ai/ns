---
edges:
  - objective: prod-submit-roast-and-fix
    annotation: This record owns the submit/ship-independent local review-to-fix foundation; that record may consume the resulting capabilities while retaining Flow orchestration and shipping policy.
---

# Local Feedback Resolution

Steelthread Objective: deliver the thinnest production-quality local, pre-PR journey
from multiple engineer-controlled adversarial reviews through confirmed manual
remediation planning. The requirements Frontier has crystallized; representative use
of the real implementation is completion evidence rather than a throwaway prototype
gate.

## Thesis

Give engineers a coherent local, pre-PR path from multiple adversarial reviews to an
engineer-confirmed manual remediation plan. Engineers control the revision range and
applicable review roster; completed findings are combined without erasing source
evidence; reviewer failures and coverage gaps remain visible; and proposed clustering,
categorization, and planned PRs remain correctable before becoming durable decisions.

This steelthread proves the production seams and interaction grammar needed for the
manual loop. It deliberately stops before automated fixes, candidate branches, and
validation. Those are follow-on breadth after this thread lands, not reasons to build
and discard a parallel prototype.

## Scope

- Prompt for an explicit pre-PR revision range and an applicable roster drawn from
  checked-in `.ns/reviews/` definitions.
- Run multiple reviews in the foreground, continue past individual reviewer failures,
  and preserve source-attributed findings plus honest roster and coverage gaps.
- Produce the minimal structured run, finding, cluster, disposition, and planned-PR
  records established by the requirements decisions.
- Propose duplicate clusters, conflicts, and actionability without replacing original
  findings or presenting model judgment as engineer confirmation.
- Let the engineer correct and bulk-confirm triage, then steer accepted work into an
  ordered, traceable planned-PR list for manual remediation.
- Exercise the production journey on representative real changes and use the observed
  result to verify or correct the steelthread contract.

## Non-Goals

- Designing or implementing `ns flow submit`, `ns flow ship`, landing, merge,
  deployment, progressive rollout, monitoring, or rollback policy.
- Delivering a TUI or web UI in the initial loop.
- Building the broader conversational change-review, collaboration, preview, or
  session-handoff product described in stakeholder discussions.
- Proving human GitHub-feedback or third-party-reviewer ingestion in the first loop.
- Automatically attempting fixes, creating candidate branches, running candidate
  validation, or adopting changes; these resume as follow-on breadth after this
  manual-first steelthread.
- Mutating the engineer's active checkout, or automatically committing, pushing,
  publishing, merging, or deploying fixes.
- Designing a speculative canonical cross-source model or requirements for consumers
  that do not yet exist.
- Treating stakeholder proposals supplied as context as endorsed product decisions.

## Completion Criteria

- An engineer can explicitly choose a pre-PR revision range and applicable checked-in
  review roster, run multiple reviews, and receive one coherent source-attributed
  findings set with failures and coverage gaps visible.
- The engineer can correct proposed clusters, conflicts, and actionability, apply bulk
  dispositions, and confirm an ordered planned-PR list whose members trace back to the
  original findings.
- The journey emits the minimal structured records without requiring consumers to
  scrape human-oriented output, while original findings remain verbatim and model
  proposals remain distinguishable from engineer confirmations.
- The real production journey has been exercised on representative changes; focused
  tests and relevant repository checks corroborate the observed range, roster,
  partial-failure, correction, and full-accounting behavior.
- No autofix, candidate-branch, validation, submit, publish, or active-checkout mutation
  authority is introduced by the steelthread.

## Assumptions and Risks

### Assumptions

- Engineer-authored Review definitions are a sufficient first source for proving the
  multi-reviewer local loop before adding human and third-party feedback.
- Existing Reviews and Address capabilities contain useful behavior that can be
  composed or generalized; implementation may still show that some semantics must
  remain source-specific.
- The minimal artifact baseline is sufficient for the first real manual journey;
  representative use, not hypothetical consumers, is the test of that assumption.

### Risks

- Normalizing findings too aggressively could erase reviewer provenance,
  disagreements, or evidence and create false confidence in triage.
- Automated categorization or candidate fixes may appear authoritative despite model
  uncertainty; requirements must make uncertainty and human control visible.
- Reusing Address interaction precedent for local findings may accidentally import
  GitHub-specific thread or publication semantics; the steelthread must reuse outcomes
  and interaction grammar without pretending the sources are identical.
- Content-tuple identity and run-level provenance may prove awkward under real
  correction and resume behavior; representative use must surface that rather than
  prompting speculative identity machinery up front.
- The effort could drift into autofix, broader agentic CI/CD, or conversational Ship
  work and fail to deliver the bounded manual loop.

## Open Questions

No requirements Question Rows remain for this steelthread. Implementation and
representative use may expose corrections needed before closure. Autofix safety,
validation confidence, future source differences, and future consumer lifecycle needs
remain parked follow-on questions rather than blockers for this Objective.
