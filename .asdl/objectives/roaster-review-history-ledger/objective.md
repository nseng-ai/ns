# Roaster Review History Ledger

## Thesis

Roaster should become the durable, harness-friendly place to invoke code reviews and remember what happened. The MVP should make every normal `roaster review run` invocation record a branch-scoped review attempt in Branch Memory by default, so humans and agents can later answer which reviews ran, which model/review variant produced them, whether they succeeded or failed, and where to inspect the result.

The first version optimizes for review history and harness ergonomics, not inference caching, review councils, marketplace/network effects, or full remediation tracking.

## Scope

- Add a roaster-owned Branch Memory ledger in a named namespace such as `roaster`, scoped to the source branch.
- Make `roaster review run` record by default, including invocations from skills and Pi extensions that call the normal roaster command path.
- Provide an explicit escape hatch such as `--no-record` for local experimentation, tests, or workflows that intentionally avoid durable history.
- Store append-only JSON records grouped by review key, with successful and failed attempts represented as structured records.
- Capture successful run metadata including review key, review path or definition identity, model, base/head or diff metadata when available, finding count, findings payload, usage/cost/duration when available, input coverage when available, timestamps, and record key.
- Capture failed attempt metadata as a structured summary: phase, error type/message, review key, model if resolved, base/head or diff metadata if available, and timestamps, without raw stdout/stderr logs by default.
- Add a compact human-facing history view that shows chronological run rows with review key, status, model, base/head metadata, finding count, cost/duration when available, and record key.
- Establish the MVP pattern for incorporating review-oriented prompts or skills into roaster: roaster review definitions remain the canonical review unit, and skill-like reviews should be translated or wrapped into `reviews/*.md` definitions rather than executed as arbitrary skills directly.
- Audit and update in-harness invocation paths only as needed to ensure skill/Pi calls use the normal roaster review path and therefore get default recording.

## Non-Goals

- Do not implement review councils, multi-review synthesis, or model bakeoff dashboards in this Objective.
- Do not implement CI inference skip/reuse semantics yet, although records should preserve enough identity metadata to support that later.
- Do not implement a review marketplace, networked review-pack distribution, or remote catalog discovery.
- Do not make arbitrary agent skills first-class executable roaster review units in the MVP.
- Do not add first-class per-finding action tracking such as open, fixed, dismissed, or accepted-risk.
- Do not store raw harness logs or raw model transcripts by default for failed attempts.
- Do not move Objective state, review history, or review records into checked-in files, PR comments, issues, or a hidden local database.

## Completion Criteria

- Running `roaster review run <key>` records a durable Branch Memory entry by default on the source branch under a roaster-owned namespace.
- A caller can opt out of recording for a run with an explicit flag.
- Successful and failed attempts both create useful structured history records without overwriting previous attempts.
- A compact history command or view lets a human or harness agent list recent recorded review attempts, optionally scoped to a review key.
- Existing skill/Pi review invocation paths are compatible with default recording, or the Objective records the exact follow-up needed if a path intentionally remains outside scope.
- The repository contains a documented or discoverable pattern for turning review-oriented prompts/skills into canonical roaster review definitions.
- Deferred follow-ups for CI reuse, councils, review packs, and action tracking are explicit rather than half-implemented.

## Assumptions and Risks

Assumptions:

- Branch Memory is the right durable backend for review history because review records should travel with the source branch without becoming working-tree files or PR comments.
- A source-branch ledger is sufficient for the MVP even when a PR number exists; PR and diff metadata can be record fields rather than the primary storage identity.
- Existing roaster review definitions are close enough to the desired canonical review unit that skill-like reviews can be migrated or wrapped into them.
- Default recording at the roaster command layer is the most reliable way to make in-harness review invocation behave consistently.

Risks:

- CI or detached-HEAD contexts may need explicit branch resolution before brmem writes are safe; the implementation must avoid silently writing to the wrong branch.
- Review records may grow large if findings payloads are verbose; the MVP should stay within brmem's text-entry expectations and avoid raw logs by default.
- Default recording could surprise local users unless the command output clearly reports the written record and provides an obvious opt-out.
- If skill/Pi review invocations bypass `roaster review run`, harness history may remain incomplete until those call sites are aligned.
- A review-definition-only incorporation pattern may be too restrictive for some existing review skills; any mismatch should be captured as follow-up rather than solved by coupling roaster directly to skills in the MVP.

## Open Questions

- What exact record schema and versioning field should roaster use so later CI reuse can safely consume historical records?
- Should the first history reader support a detail view such as `roaster review show <record-key>`, or is JSON output from the compact listing enough for the MVP?
- Which existing review-oriented skills should be the first examples translated or wrapped into roaster review definitions?
- How should roaster resolve the source branch in GitHub Actions or other detached CI environments when writing Branch Memory?
