# Roadmap

## Work

Dependency gate lifted (2026-06-13): the predecessor `pr-address-typescript-port` is closed, so these rows are now ready to start. The CLI is TypeScript-only at `ts/packages/pr-address/`; the rows below operate on that surface. Start with the descriptor-taxonomy / resolution-contract row.

- [x] Re-ground the evidence on a fresh TypeScript run.
  - Captured a non-mutating TS CLI pass against PR #1427 on 2026-06-13 and recorded the results in `updates/2026-06-13T143520Z-fresh-typescript-reground-run.md`. The PR had zero feedback, so collection/template/validate/plan/finalize and one-PR stack prep/plan/diff were exercised live; actionable batch helpers were inventoried by help/source inspection rather than by a real batch.
  - Policy: completed under preview-confirmed bounded local evidence gathering. No review threads were resolved or replied to, no PR was pushed/submitted, and no write-capable external action was performed.
  - Evidence: the update enumerates the currently observed wrapper/reference state: `plan-feedback` still needs `{manifest, classification}`, batch-build still needs `{plan, batch_id, commit_sha, decisions}`, checkpoint still needs the eight-field composed payload, `finalize-run` still needs `{feedback, checkpoints}`, while `validate-feedback-classification` already supports split manifest/classification inputs.
- [x] Define the session artifact-kind and resolution contract.
  - Reserved PR-scoped descriptors use scope-first names (`pr-address-pr-<n>-<kind>`, `pr-address-pr-<n>-batch-<batch-id>-<kind>`, `pr-address-stack-<kind>`). Latest-of-kind resolves exact descriptor + role + `.json` by highest payload sequence; no index file. The contract is recorded in `updates/2026-06-13T150400Z-artifact-taxonomy-and-planning-resolution.md` and reinforced by store-owned lookup work in `updates/2026-06-14T195448Z-payload-store-lookup-boundary.md`.
  - Evidence: descriptor builders, `PayloadArtifactStore.findLatestJsonArtifact`, node and in-memory lookup tests, and PR/stack planning scenario tests. Full TS test and check passed for the payload-store lookup boundary branch.
- [x] Gate artifacts into the store through validation and bootstrap the session.
  - `validate-feedback-classification` persists the validated classification as a session artifact on success when a harness session is configured. Bootstrap is now the harness-owned `HARNESS_SESSION_ID` / `--harness-session-id` contract, not `ASDL_PAYLOAD_SESSION_ID` or caller-side auto-minting.
- [~] Migrate planning and read helpers to implicit session resolution.
  - `plan-feedback --pr-number` and empty-stdin `stack-feedback-plan` resolve manifest/classification inputs from the session and echo `resolved_inputs`. Composed payload compatibility intentionally remains until the later input-style removal row, and non-planning read/lifecycle helpers still need migration.
- [ ] Migrate the mutation flow to explicit artifact references.
  - `build-resolve-thread-batch-payload` (and `build-stack-resolve-thread-payloads`) take batch id, commit SHA, and decisions file, resolve the plan implicitly, and write the validated build payload as a session artifact. `resolve-thread-batch` requires `--from-build` and fails with `explicit_artifact_required` otherwise; no implicit mode for mutations.
- [ ] Shrink lifecycle helpers to agent-owned inputs.
  - `record-batch-checkpoint` takes batch id, commit SHA, and validation results; derives `changed_files` from the commit; pulls plan, build payload, and resolution result from the session (today it takes an eight-field composed payload). `finalize-run` discovers checkpoints and final feedback from the session.
- [ ] Make compact stdout the default across all exec helpers.
  - Digest on stdout (counts, errors, warnings, `resolved_inputs`, produced artifact reference); full envelope in the session artifact; `--stdout-mode full` escape hatch; process exit code already mirrors envelope `exit_code`. Today `--stdout-mode` exists only on three stack helpers, defaults to `full`, and shapes result data rather than emitting the digest — extend it everywhere and flip the default to compact.
- [ ] Remove composed-payload input styles for pipeline-produced artifacts.
  - `--payload-file`/`--payload-json`/stdin composition deleted wherever the input is something the pipeline produced; file input remains only for agent-authored content (decisions, classification answers, validation results).
- [ ] Rewrite the pr-address skill and CLI references for the session-store flow.
  - `skills/pr-address/SKILL.md` and `references/cli-*.md` describe only the new flow for single-PR and stack runs; payload-composition guidance removed; the hybrid state (env-var session id alongside `--payload-file` composition) is resolved.
  - Evidence: a real single-PR run and a real stack run driven by the rewritten skill complete with zero ad hoc glue between helpers.

## Parked

- Staleness guard: mutation helpers refusing a build payload when a newer plan artifact exists in the session (forces rebuild after replan). Explicitly excluded during the design interview; revisit if a real run applies a stale payload.
- Classification round-trip tightening: an `apply-classification` merge helper, or having the classify subagent emit schema-valid classification JSON directly.
- `read-feedback-details` ergonomics: repeated `--pointer` flags instead of a composed selection payload. Revisit if it recurs in retros.
