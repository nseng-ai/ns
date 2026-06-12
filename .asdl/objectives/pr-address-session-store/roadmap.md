# Roadmap

## Work

Dependency gate: do not start these implementation rows until `pr-address-typescript-port` is closed. That predecessor owns the TS cutover, clinkr shell migration, bundle/distribution, plugin retirement, Python deletion, and compatibility-preserving payload/reference cleanup. This Objective begins only after the CLI is TS-only and can intentionally redesign the workflow contract.

- [ ] Define the session artifact-kind and resolution contract.
  - Reserved PR-scoped descriptors per artifact kind; latest-of-kind as max sequence among matching descriptors; no index file. Validate the contract against both single-PR and stack flows on paper before any helper migrates — this resolves the descriptor-taxonomy and reference-format open questions.
  - Evidence: contract recorded in the Objective updates plus descriptor constants and a resolution module with fake-driven tests covering PR scoping, per-batch kinds, and concurrent-writer sequences.
- [ ] Gate artifacts into the store through validation and bootstrap the session.
  - `validate-feedback-classification` persists the validated classification as a session artifact on success; `prepare-run` auto-mints and prints a session id when none is supplied.
- [ ] Migrate planning and read helpers to implicit session resolution.
  - `plan-feedback` and `stack-feedback-plan` resolve manifest/classification from the session and echo `resolved_inputs`; the composed `{manifest, classification}` wrapper input is removed in the same motion.
- [ ] Migrate the mutation flow to explicit artifact references.
  - `build-resolve-thread-batch-payload` (and the stack payload builders) take batch id, commit SHA, and decisions file, resolve the plan implicitly, and write the validated build payload as a session artifact. `resolve-thread-batch` requires `--from-build` and fails with `explicit_artifact_required` otherwise; no implicit mode for mutations.
- [ ] Shrink lifecycle helpers to agent-owned inputs.
  - `record-batch-checkpoint` takes batch id, commit SHA, and validation results; derives `changed_files` from the commit; pulls plan, build payload, and resolution result from the session. `finalize-run` discovers checkpoints and final feedback from the session.
- [ ] Make compact stdout the default across all exec helpers.
  - Digest on stdout (counts, errors, warnings, `resolved_inputs`, produced artifact reference); full envelope in the session artifact; `--stdout-mode full` escape hatch; process exit code mirrors envelope `exit_code`.
- [ ] Remove composed-payload input styles for pipeline-produced artifacts.
  - `--payload-file`/stdin composition deleted wherever the input is something the pipeline produced; file input remains only for agent-authored content (decisions, classification answers, validation results).
- [ ] Rewrite the pr-address skill and CLI references for the session-store flow.
  - `SKILL.md` and the `cli-*.md` references describe only the new flow for single-PR and stack runs; payload-composition guidance removed.
  - Evidence: a real single-PR run and a real stack run driven by the rewritten skill complete with zero ad hoc Python/jq between helpers.

## Parked

- Staleness guard: mutation helpers refusing a build payload when a newer plan artifact exists in the session (forces rebuild after replan). Explicitly excluded during the design interview; revisit if a real run applies a stale payload.
- Classification round-trip tightening: an `apply-classification` merge helper, or having the classify subagent emit schema-valid classification JSON directly.
- `read-feedback-details` ergonomics: repeated `--pointer` flags instead of a composed selection payload. Revisit if it recurs in retros.
