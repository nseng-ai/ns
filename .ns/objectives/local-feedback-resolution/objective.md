---
edges:
  - objective: prod-submit-roast-and-fix
    annotation: This record owns the submit/ship-independent local review-to-fix foundation; that record may consume the resulting capabilities while retaining Flow orchestration and shipping policy.
---

# Local Feedback Resolution

Ideation Objective (see `skills/objective/references/objective-patterns.md`): the
Destination is settled, while the route remains a Frontier of requirements questions.
Resolve one Question Row per session, record the decision as a Semantic Update, and
crystallize implementation work only after the requirements are coherent.

## Thesis

Give engineers a coherent local, pre-PR path from adversarial review to validated
candidate fixes. Engineers control the content and applicability of adversarial
reviews; multiple automated reviewers can contribute findings; the workflow combines,
triages, and categorizes those findings; and the existing addressing experience can
apply selected fixes in a disposable ordinary slot/worktree rather than mutating the
engineer's active checkout.

The result is base infrastructure for experiences beyond the initial local loop. Its
structured findings, triage decisions, candidate changes, and validation outcomes
must be reusable by later TUI, web, PR-feedback, and landing experiences without this
Objective committing to those product surfaces or to a particular architecture.
Stakeholder proposals about conversational change review, agentic CI/CD, deployment,
and “Ships” are motivating context and hypotheses, not accepted requirements.

## Scope

- Run engineer-authored, engineer-controlled adversarial Review definitions locally
  against work that has not yet opened a PR.
- Combine findings from multiple applicable automated reviewers into one local
  resolution journey while preserving source and evidence.
- Establish requirements for deduplication, conflict handling, triage, categorization,
  and selection of candidate fixes.
- Reuse the addressing workflow for local findings rather than limiting addressing to
  downloaded GitHub messages.
- Apply candidate fixes in a disposable vanilla slot/worktree, with explicit outcomes
  for retained, rejected, failed, and unattempted fixes and with validation evidence.
- Produce stable structured artifacts that future local and remote user experiences can
  consume.
- Shape the first source contract around local Reviews findings from multiple Review
  definitions while preserving a credible extension path for human GitHub feedback and
  other automated producers.

## Non-Goals

- Designing or implementing `ns flow submit`, `ns flow ship`, landing, merge,
  deployment, progressive rollout, monitoring, or rollback policy.
- Delivering a TUI or web UI in the initial loop.
- Building the broader conversational change-review, collaboration, preview, or
  session-handoff product described in stakeholder discussions.
- Proving human GitHub-feedback or third-party-reviewer ingestion in the first loop.
- Automatically mutating the engineer's active checkout, or automatically committing,
  pushing, publishing, merging, or deploying fixes.
- Choosing package boundaries, gateway shapes, persistence technology, or a canonical
  cross-source data model before the requirements justify those decisions.
- Treating stakeholder proposals supplied as context as endorsed product decisions.

## Completion Criteria

- An engineer can run multiple applicable, engineer-controlled adversarial reviews
  locally before a PR exists and receive one coherent set of source-attributed findings.
- The local journey can triage and categorize those findings, preserve disagreements or
  uncertainty without silently discarding evidence, and select candidate fixes.
- The addressing workflow can consume the selected local findings and attempt fixes in
  a disposable ordinary slot/worktree.
- Every attempted fix has a structured, inspectable outcome and validation evidence;
  failed or rejected work does not leak into the engineer's active checkout.
- Structured findings, triage decisions, candidate changes, and validation outcomes are
  sufficient for a later TUI or web consumer without scraping human-oriented output.
- The requirements Frontier has crystallized into implementation-ready slices, and the
  resulting local review-to-fix loop has been exercised on representative real changes
  with focused tests and relevant repository checks as completion evidence.

## Assumptions and Risks

### Assumptions

- Engineer-authored Review definitions are a sufficient first source for proving the
  multi-reviewer local loop before adding human and third-party feedback.
- A disposable ordinary slot/worktree provides adequate isolation for early autofix
  operation; if that proves insufficient, the upgrade is an explicit stronger
  sandbox/authority boundary rather than implicit mutation of the active checkout.
- Existing Reviews and Address capabilities contain useful behavior that can be
  composed or generalized; the requirements process may still conclude that some
  semantics must remain source-specific.
- Reusable structured artifacts can enable later TUI and web experiences without
  requiring those interfaces to be designed now.

### Risks

- Normalizing findings too aggressively could erase reviewer provenance,
  disagreements, or evidence and create false confidence in triage.
- Automated categorization or candidate fixes may appear authoritative despite model
  uncertainty; requirements must make uncertainty and human control visible.
- Validation may be incomplete or irrelevant to a change, so “validated” could be
  mistaken for “safe”; outcomes must state what ran and avoid claiming more confidence
  than the evidence supports.
- Reusing Address for both local findings and GitHub messages may force unlike feedback
  into one workflow; requirements must preserve meaningful source semantics rather than
  unifying them for its own sake.
- The effort could drift into the much broader agentic CI/CD or conversational Ship
  vision and fail to deliver the bounded local loop.

## Open Questions

The initial precise questions are represented as Question Rows in `roadmap.md`.

Fog toward the Destination, not yet precise enough to chart:

- What confidence and provenance language future surfaces will need once real users
  react to aggregated and autofixed results.
- Which human-feedback and external-reviewer differences will require new semantics
  after the local automated-source loop is proven.
- Whether later TUI and web consumers need interaction or lifecycle concepts beyond the
  structured artifacts required by the first loop.
