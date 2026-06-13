# Roadmap

## Work

Dependency gate lifted (2026-06-13): the predecessor `pr-address-typescript-port` is closed, so these rows are now ready to start. The CLI is TypeScript-only at `ts/packages/pr-address/`; the rows below operate on that surface. Start with the descriptor-taxonomy / resolution-contract row.

- [ ] Re-ground the evidence on a fresh TypeScript run.
  - Capture one real single-PR `pr-address` run on the TS CLI and record the composed-payload glue the agent builds by hand between helpers (replacing the stale 2026-06-11 Python-heredoc evidence). This quantifies the problem against the live tool and seeds the descriptor design.
  - Policy: `objective-next` may execute this row after preview confirmation as bounded local evidence gathering. It may inspect the TS CLI and skill docs, run non-mutating `pr-address` helpers, capture a transcript or notes, and write Objective tracking for the findings. It must not resolve/reply to GitHub review threads, push, submit PRs, or perform any write-capable external action without a separate explicit confirmation.
  - Evidence: a run transcript or update note enumerating each hand-built wrapper (`{manifest, classification}`, `{plan, batch_id, commit_sha, decisions}`, the eight-field checkpoint, `{feedback, checkpoints}`) and the step that composes it.
- [ ] Define the session artifact-kind and resolution contract.
  - Reserved PR-scoped descriptors per artifact kind; latest-of-kind as max sequence among matching descriptors; no index file. Validate the contract against both single-PR and stack flows on paper before any helper migrates — this resolves the descriptor-taxonomy and reference-format open questions. Cover the newer stack helpers (`stack-feedback-preflight`, `stack-feedback-diff-current`) and their references.
  - Evidence: contract recorded in the Objective updates plus descriptor constants and a resolution module with fake-driven tests covering PR scoping, per-batch kinds, and concurrent-writer sequences.
- [ ] Gate artifacts into the store through validation and bootstrap the session.
  - `validate-feedback-classification` persists the validated classification as a session artifact on success; `prepare-run` auto-mints and prints a session id when none is supplied (today `resolvePayloadSessionId` errors `payload_session_required` with no id — auto-mint is net-new).
- [ ] Migrate planning and read helpers to implicit session resolution.
  - `plan-feedback` and `stack-feedback-plan` resolve manifest/classification from the session and echo `resolved_inputs` (net-new; absent today); the composed `{manifest, classification}` wrapper input is removed in the same motion.
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
