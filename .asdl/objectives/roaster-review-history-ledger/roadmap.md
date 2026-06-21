# Roadmap

## Work

- [ ] Define the roaster review-run ledger contract.
  - Decide the JSON record shape, schema/version field, append-only key format grouped by review key, required success fields, required failure fields, and record-size boundaries.
  - Evidence: unit coverage for record construction and key generation; schema examples for successful and failed attempts.

- [ ] Add a Branch Memory ledger gateway for roaster.
  - Introduce a small injectable boundary that writes and lists text entries in the roaster namespace, with explicit branch handling suitable for normal checkouts and CI/detached contexts.
  - Evidence: fake-driven tests for writes, listing, branch selection, and write-failure reporting.

- [ ] Make `roaster review run` record by default.
  - Wrap the existing review execution path so successes and structured failures both create append-only records, while an explicit opt-out flag skips durable recording.
  - Ensure command output reports the Branch Memory namespace, entry key, and locator or a clear recording failure.
  - Evidence: scenario coverage for default recording, opt-out behavior, successful run records, and failed attempt records.

- [ ] Add the compact history view.
  - Provide a human-readable chronological listing of recorded attempts with review key, status, model, base/head or diff metadata, finding count, cost/duration when available, and record key; include a machine-readable path where practical.
  - Evidence: scenario coverage for all-review and review-key-scoped history output.

- [ ] Align harness invocation with default recording.
  - Inspect skill and Pi extension review call paths and update only the paths that bypass normal `roaster review run` behavior or would accidentally disable recording.
  - Evidence: documented call-path outcome and targeted tests or command examples for any changed harness surface.

- [ ] Document the review-incorporation pattern.
  - Explain that roaster review definitions are the canonical review unit, and describe how an existing review-oriented skill or prompt should be translated or wrapped into a `reviews/*.md` definition for harness-friendly invocation and durable history.
  - Evidence: documentation or an example review definition demonstrating the pattern.

- [ ] Record deferred follow-ups explicitly.
  - Leave clear notes or issues for CI reuse/cache semantics, councils/model bakeoffs, review-pack distribution, richer action tracking, raw debug-log capture, and any skill that cannot be cleanly expressed as a roaster review definition yet.

## Parked

- [ ] CI inference skip/reuse based on compatible historical records.
- [ ] Review councils, synthesis, and model bakeoff reporting.
- [ ] Review-pack or marketplace-style catalog distribution.
- [ ] First-class per-finding action tracking and remediation state.
- [ ] Raw harness/model log capture for debugging failed attempts.
