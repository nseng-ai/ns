# PR Address Session State Store

## Thesis

The payload session becomes the run's state store for `pr-address`. Every exec helper writes its result artifact into the session; helpers resolve predecessor artifacts from the session instead of receiving agent-composed JSON. The agent supplies only what it genuinely authors — classification answers, batch decisions, commit SHAs, validation results, and the code edits themselves — and the pipeline carries everything it produced.

This is the successor to the closed `pr-address-efficiency-hardening` Objective, driven by fresh evidence: the 2026-06-11 `pr-address` run on PR #1274 (branch `agents-md-onboarding-reframe`) succeeded end-to-end with zero semantic failures, yet required roughly ten ad hoc Python heredocs between helpers — all deterministic plumbing. Specifically: unwrapping the `{exit_code, data}` envelope to feed the next command, composing wrapper payloads (`{manifest, classification}`, `{plan, batch_id, commit_sha, decisions}`, `{feedback, checkpoints}`), extracting `data.payload` from the build helper to pipe into the resolve helper, assembling the eight-field checkpoint input, and re-opening redirected stdout files to print digests. None of that glue involved judgment; all of it belongs in the CLI.

The durable rule this Objective installs: **files carry what the agent authored; the session carries what the pipeline produced.**

## Scope

Resolution contract:

- Reserved, PR-scoped descriptors per artifact kind (classification, plan, resolve-build per batch, checkpoint per batch, final feedback). Latest-of-kind resolves as max sequence among matching descriptors using the existing payload filename contract. No session index or journal file — the store's exclusive-create sequence allocation already provides write coordination.
- Planning and read helpers resolve predecessors implicitly (latest of kind) and echo a `resolved_inputs` block naming the exact artifacts used, so implicit resolution stays auditable.
- Mutation helpers (`resolve-thread-batch` and the stack equivalents) require an explicit artifact reference (e.g. `--from-build <sequence>`) and fail with `explicit_artifact_required` when it is omitted. No "latest" mode exists for mutations: the agent must name the validated payload it is applying.
- Validation is the gate into the store: `validate-feedback-classification` persists the classification as a session artifact only on success, which is what entitles `plan-feedback` to trust "latest classification."

Helper migrations:

- `prepare-run` auto-mints a session id when none is supplied and prints it; `ASDL_PAYLOAD_SESSION_ID` remains respected.
- `plan-feedback` resolves manifest and classification from the session; the hand-composed `{manifest, classification}` wrapper input is removed.
- `build-resolve-thread-batch-payload` takes `--batch-id`, `--commit-sha`, and `--decisions-file`, resolves the plan from the session, and writes the validated build payload as a session artifact whose reference it prints.
- `record-batch-checkpoint` shrinks to agent-owned inputs (batch id, commit SHA, validation results); it derives `changed_files` from the commit and pulls plan, build payload, and resolution result from the session.
- `finalize-run` discovers checkpoints and the final feedback artifact from the session.
- Single-PR and stack flows (`stack-feedback-prep`, `stack-feedback-plan`, `build-stack-resolve-thread-payloads`) migrate together, with no phasing — the descriptor contract is designed against the stack flow's per-PR artifacts before any helper ships.

Output and input contract:

- Compact stdout becomes the default for every exec helper: digest of counts, errors, warnings, `resolved_inputs`, and the produced artifact reference. The full envelope always lands in the session artifact. `--stdout-mode full` remains as the debugging escape hatch. Process exit codes mirror the envelope `exit_code` so shell chaining is trustworthy without wrappers.
- Clean input-style cutover: `--payload-file`/stdin composition is removed for pipeline-produced artifacts (manifests, plans, build payloads, checkpoints, feedback). File input survives only for agent-authored content: decisions files, classification answers, validation results.
- The `pr-address` skill (`SKILL.md` and the `cli-*.md` references) is rewritten in lockstep to describe only the session-store flow, for both single-PR and stack runs.

## Non-Goals

- Python compat package retirement, `asdl pr-address` plugin cutover, and bundle distribution — owned by the open `pr-address-typescript-port` Objective's endgame stack. This Objective assumes the post-retirement TS-only CLI and does not duplicate or migrate those rows.
- Staleness guard (mutation helpers refusing a build payload when a newer plan artifact exists) — deliberately excluded during the design interview; parked as future hardening.
- Classification round-trip tightening (an `apply-classification` merge helper or subagent-direct schema emission) — out of scope.
- Envelope auto-unwrapping on file inputs — moot once session resolution replaces file chaining.
- Any change to validation semantics, batch ordering, approval-required gating, or the no-push guarantee. The validate-before-mutate shape is preserved; only the plumbing between stages changes.

## Completion Criteria

- A real single-PR run and a real stack run, driven by the rewritten skill, complete end-to-end with zero ad hoc Python/jq between helpers: every pipeline step is one CLI invocation plus at most one agent-authored file.
- Every exec helper defaults to compact stdout, writes its full envelope as a session artifact, and exits with a process code mirroring the envelope `exit_code`.
- Mutation helpers demonstrably refuse implicit resolution (scenario-tested `explicit_artifact_required` behavior), and applied build payloads are named by explicit reference in transcripts and checkpoints.
- Composed-payload input paths for pipeline-produced artifacts no longer exist in the CLI surface or the skill docs.
- The skill references describe only the session-store flow for both single-PR and stack runs.

## Assumptions and Risks

Assumptions:

- The `pr-address-typescript-port` endgame (through its `python-deletion` branch) lands before this Objective's changes start landing. This work intentionally breaks the byte-parity contract that objective's remaining Group 1 rows depend on; starting earlier would invalidate parity fixtures. This is the load-bearing sequencing assumption.
- The `pr-address` skill is the only consumer of the exec helpers; no external consumer depends on full-stdout defaults or composed-payload inputs. AGENTS.md's unreleased-private-software posture covers the contract breaks.
- The existing payload filename contract (timestamp, monotonic sequence, descriptor, role) is sufficient for latest-of-kind resolution without an index file, including under concurrent writers.

Risks:

- Descriptor taxonomy ambiguity in stack runs: per-PR artifacts mean latest-of-kind must be PR-scoped, and a collision would silently resolve the wrong input. Mitigated by designing the contract against the stack flow first, echoing `resolved_inputs` everywhere, and scenario tests per artifact kind.
- The no-phasing decision (single-PR and stack migrate together) makes the first landable slice large. Accepted deliberately to avoid the CLI ever shipping two invocation styles.
- Removing composed input styles deletes a debugging affordance. `--stdout-mode full` and direct reads of session artifacts remain the debug path.
- Compact-by-default stdout could hide evidence in edge cases. Mitigated by including errors and warnings verbatim in the digest along with the artifact path to the full envelope.

## Open Questions

- Exact reserved descriptor taxonomy, including the PR-scoping format (e.g. `plan-pr-1274` vs `pr-1274-plan`) and per-batch naming for build payloads and checkpoints.
- Whether explicit mutation references accept sequence numbers only, or also full artifact paths.
- Input shape for `record-batch-checkpoint` validation results: a small agent-authored file vs repeated structured flags.
