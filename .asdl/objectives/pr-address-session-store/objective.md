# PR Address Session State Store

## Thesis

The payload session becomes the run's state store for `pr-address`. Every exec helper writes its result artifact into the session; helpers resolve predecessor artifacts from the session instead of receiving agent-composed JSON. The agent supplies only what it genuinely authors — classification answers, batch decisions, commit SHAs, validation results, and the code edits themselves — and the pipeline carries everything it produced.

The durable rule this Objective installs: **files carry what the agent authored; the session carries what the pipeline produced.**

### Status (rebaselined 2026-06-13)

This Objective is **unblocked and ready to start**. Its predecessor `pr-address-typescript-port` closed as completed on 2026-06-13 (the TS cutover, clinkr shell migration, bundle/distribution, plugin retirement, and Python deletion all landed; `packages/asdl-pr-address` is gone). The dependency gate that previously blocked this work — recorded in the 2026-06-12 update — is therefore lifted. The first action is the descriptor-taxonomy / resolution-contract row.

The codebase this Objective targets is now **TypeScript-only**, at `ts/packages/pr-address/` (package `@asdl/pr-address`). All Python framing in the original record has been removed; the problem and the remaining work are restated below against the live TS surface.

### Why the thesis still holds

The composed-payload glue this Objective set out to eliminate survives the TypeScript port, with one post-reground correction: `validate-feedback-classification` already supports split manifest/classification inputs. Other helpers still receive agent-composed wrapper JSON, and validation still keeps legacy wrapper compatibility:

- `plan-feedback` still takes a `{manifest, classification}` wrapper; `validate-feedback-classification` can take split manifest/classification files but still accepts the same wrapper for compatibility (`src/classification-operations.ts`).
- `build-resolve-thread-batch-payload` takes `{plan, batch_id, commit_sha, decisions}` (`src/resolve-thread-batch-payload.ts`).
- `record-batch-checkpoint` takes an eight-field composed payload — `plan`, `batch_id`, `commit_sha`, `changed_files`, `validation_commands`, `thread_payload_build`, `thread_resolution_result`, `non_thread_outcomes` (`src/batch-checkpoint.ts`).
- `resolve-thread-batch` takes `{commit_sha, continue_on_error, items}` and `finalize-run` takes `{feedback, checkpoints}` (`src/mutation-operations.ts`, `src/finalization.ts`).

Building each of these wrappers is deterministic plumbing the agent has to do by hand between helpers — exactly the glue the session store should absorb.

### What already exists (the gap is narrower than originally framed)

The payload session store itself is already built and is the dominant coordination mechanism today. The remaining work is the **read/resolution** layer, not the store:

- The store exists at `src/payload-store.ts`: sessions live under `{ASDL_PAYLOAD_ROOT|/tmp/asdl}/sessions/{session-id}/payloads/`, with the exact filename contract this Objective assumes — `{date}t{time}z-{sequence:04d}-{descriptor}.{role}.{ext}` — and exclusive-create sequence allocation that already provides write coordination.
- Helpers already default to `payload_mode: "payload"` and write their raw envelope into the session (`prepare-run`, `get-feedback`); `record-batch-checkpoint` already returns a `checkpoint_reference`; `read-feedback-details` writes a summary artifact; stack helpers already consume references (`--prep-reference`, `--stack-reference`, `--stack-plan-reference`). So **"every helper writes its artifact to the session" is largely already true.**
- What does **not** exist: implicit latest-of-kind resolution of predecessors, a reserved PR-scoped descriptor taxonomy, the `resolved_inputs` audit block (absent from both code and the skill), and explicit `--from-build`-style mutation references. These are the substance of this Objective.

## Scope

Target surface: the `@asdl/pr-address` exec helpers in `ts/packages/pr-address/src/` and the `pr-address` skill at `skills/pr-address/` (`SKILL.md` plus the `references/cli-*.md` files). The exec surface is now ~20 operations; the migration spans more helpers than the original list (see "Full helper inventory" below).

Resolution contract:

- Reserved, PR-scoped descriptors per artifact kind (classification, plan, resolve-build per batch, checkpoint per batch, final feedback). Latest-of-kind resolves as max sequence among matching descriptors using the existing payload filename contract. No session index or journal file — the store's exclusive-create sequence allocation already provides write coordination.
- Planning and read helpers resolve predecessors implicitly (latest of kind) and echo a `resolved_inputs` block naming the exact artifacts used, so implicit resolution stays auditable. (`resolved_inputs` does not exist yet — it is new.)
- Mutation helpers (`resolve-thread-batch` and the stack equivalents) require an explicit artifact reference (e.g. `--from-build <sequence>`) and fail with `explicit_artifact_required` when it is omitted. No "latest" mode exists for mutations: the agent must name the validated payload it is applying.
- Validation is the gate into the store: `validate-feedback-classification` persists the classification as a session artifact only on success, which is what entitles `plan-feedback` to trust "latest classification."

Helper migrations:

- `prepare-run` auto-mints a session id when none is supplied and prints it; `ASDL_PAYLOAD_SESSION_ID` remains respected. (Today `resolvePayloadSessionId` errors `payload_session_required` when neither an explicit id nor the env var is present — there is no auto-mint yet.)
- `plan-feedback` resolves manifest and classification from the session; the hand-composed `{manifest, classification}` wrapper input is removed.
- `build-resolve-thread-batch-payload` takes `--batch-id`, `--commit-sha`, and `--decisions-file`, resolves the plan from the session, and writes the validated build payload as a session artifact whose reference it prints.
- `record-batch-checkpoint` shrinks to agent-owned inputs (batch id, commit SHA, validation results); it derives `changed_files` from the commit and pulls plan, build payload, and resolution result from the session.
- `finalize-run` discovers checkpoints and the final feedback artifact from the session.
- Single-PR and stack flows migrate together, with no phasing — the descriptor contract is designed against the stack flow's per-PR artifacts before any helper ships.

Full helper inventory (the no-phasing scope, all in `ts/packages/pr-address/src/`):

- Run/collection: `prepare-run`, `get-feedback`, `summarize-feedback`, `read-feedback-detail`, `read-feedback-details`, `map-branch-prs`.
- Classification/planning: `classification-template`, `validate-feedback-classification`, `plan-feedback`.
- Mutation/lifecycle: `build-resolve-thread-batch-payload`, `resolve-thread-batch`, `resolve-thread-with-reply`, `reply-to-review`, `reply-to-discussion`, `record-batch-checkpoint`, `finalize-run`.
- Stack: `stack-feedback-preflight`, `stack-feedback-prep`, `stack-feedback-plan`, `stack-feedback-diff-current`, `build-stack-resolve-thread-payloads`.

  Each helper that consumes a pipeline-produced wrapper or a `--*-reference` is in scope. `stack-feedback-preflight` and `stack-feedback-diff-current` did not exist when this Objective was first written and must be folded into the contract; the per-PR scoping risk applies directly to their references.

Output and input contract:

- Compact stdout becomes the default for every exec helper: digest of counts, errors, warnings, `resolved_inputs`, and the produced artifact reference. The full envelope always lands in the session artifact. `--stdout-mode full` remains as the debugging escape hatch. Process exit codes already mirror the envelope `exit_code` (clinkr derives the process code from the exit type), so shell chaining is trustworthy without wrappers; this contract is preserved, not introduced.
- Today only three stack helpers (`stack-feedback-preflight`, `stack-feedback-prep`, `stack-feedback-plan`) accept `--stdout-mode`, their default is `full`, and the flag shapes result data rather than emitting the count/error/`resolved_inputs` digest. Making compact the default everywhere — with the digest shape — is net-new work, building on that primitive.
- Clean input-style cutover: `--payload-file`/`--payload-json`/stdin composition is removed for pipeline-produced artifacts (manifests, plans, build payloads, checkpoints, feedback). File input survives only for agent-authored content: decisions files, classification answers, validation results.
- The `pr-address` skill (`SKILL.md` and the `references/cli-*.md` files) is rewritten in lockstep to describe only the session-store flow, for both single-PR and stack runs. The skill is currently hybrid: it already references `ASDL_PAYLOAD_SESSION_ID` but still teaches `--payload-file`/`--payload-json` composition and contains no `resolved_inputs`.

## Non-Goals

- TypeScript cutover, clinkr shell migration, schema-route ownership, bundle distribution, plugin retirement, and Python deletion — all owned and completed by the now-closed `pr-address-typescript-port` Objective. This Objective operates on the TS-only CLI and does not revisit those rows.
- Staleness guard (mutation helpers refusing a build payload when a newer plan artifact exists) — deliberately excluded during the design interview; parked as future hardening.
- Classification round-trip tightening (an `apply-classification` merge helper or subagent-direct schema emission) — out of scope.
- Envelope auto-unwrapping on file inputs — moot once session resolution replaces file chaining.
- Any change to validation semantics, batch ordering, approval-required gating, or the no-push guarantee. The validate-before-mutate shape is preserved; only the plumbing between stages changes.

## Completion Criteria

- A real single-PR run and a real stack run, driven by the rewritten skill, complete end-to-end with zero ad hoc glue between helpers (no hand-built composed payloads, no `jq`/script wrappers): every pipeline step is one CLI invocation plus at most one agent-authored file.
- Every exec helper defaults to compact stdout, writes its full envelope as a session artifact, and exits with a process code mirroring the envelope `exit_code`.
- Mutation helpers demonstrably refuse implicit resolution (scenario-tested `explicit_artifact_required` behavior), and applied build payloads are named by explicit reference in transcripts and checkpoints.
- Composed-payload input paths for pipeline-produced artifacts no longer exist in the CLI surface or the skill docs.
- The skill references (`SKILL.md` and `references/cli-*.md`) describe only the session-store flow for both single-PR and stack runs.

## Definition of Progress

Progress means replacing agent-composed pipeline wrappers with session-resolved artifacts while preserving the `pr-address` safety contract: validate before mutate, no implicit mutation inputs, and no push/submission side effects. Evidence-gathering progress may consist of a real or dry-run TypeScript `pr-address` transcript that identifies every hand-built wrapper the current helper surface still requires; implementation progress must include code, tests, and skill-reference updates appropriate to the slice.

## Runner Policy

`objective-next` may offer and, after explicit preview confirmation, execute bounded local work for this Objective when the selected roadmap row is one of:

- evidence gathering against the TypeScript `pr-address` CLI and skill docs;
- read-only contract/design investigation for the session artifact taxonomy and resolution rules;
- local code, test, or skill-documentation edits implementing one roadmap slice.

Allowed actions are local repository inspection, local command execution, local artifact/transcript capture, local file edits, and Objective tracking updates under `.asdl/objectives/pr-address-session-store/`. Network reads through `gh` are allowed for PR evidence. Write-capable external actions are out of scope unless separately and explicitly confirmed: resolving/replying to GitHub review threads, pushing branches, submitting PRs, publishing packages, or deployment. Mutation-helper dry runs or payload builds are allowed only when they do not write to GitHub; actual review-thread replies or resolutions require a separate explicit confirmation naming that external write.

Each execution preview must name the selected roadmap row, intended files or commands, validation plan, stop/ask conditions, and whether Objective tracking will be updated. Stop and ask if the run would require real GitHub mutations, a stack-wide migration beyond the selected row, descriptor taxonomy choices not already resolved in the Objective, or evidence that contradicts the thesis.

## Assumptions and Risks

Assumptions:

- The `pr-address-typescript-port` endgame has landed and the Objective is closed (confirmed 2026-06-13: `closed.md` present, `packages/asdl-pr-address` deleted, commits `9560b339b` and `5f95bfed2`). This was the load-bearing sequencing assumption; it is now satisfied, not pending. This work intentionally breaks the byte-parity and composed-input contracts the port relied on, which is now safe because the port's parity fixtures are no longer the active contract.
- The `pr-address` skill is the only consumer of the exec helpers; no external consumer depends on full-stdout defaults or composed-payload inputs. AGENTS.md's unreleased-private-software posture covers the contract breaks.
- The existing payload filename contract (timestamp, monotonic sequence, descriptor, role) is sufficient for latest-of-kind resolution without an index file, including under concurrent writers. Confirmed present in `src/payload-store.ts` with exclusive-create sequence allocation.

Risks:

- Descriptor taxonomy ambiguity in stack runs: per-PR artifacts mean latest-of-kind must be PR-scoped, and a collision would silently resolve the wrong input. Mitigated by designing the contract against the stack flow first, echoing `resolved_inputs` everywhere, and scenario tests per artifact kind. The risk now spans more helpers than originally enumerated (`stack-feedback-preflight`, `stack-feedback-diff-current` carry their own references).
- The no-phasing decision (single-PR and stack migrate together) makes the first landable slice large, and the helper surface has grown to ~20 operations since this Objective was first written — the slice is larger than originally scoped. Accepted deliberately to avoid the CLI ever shipping two invocation styles.
- Removing composed input styles deletes a debugging affordance. `--stdout-mode full` and direct reads of session artifacts remain the debug path.
- Compact-by-default stdout could hide evidence in edge cases. Mitigated by including errors and warnings verbatim in the digest along with the artifact path to the full envelope.
- The original evidence (a 2026-06-11 Python run on PR #1274 with "roughly ten ad hoc Python heredocs") no longer describes the live tool — Python is deleted. A fresh non-mutating TS pass was captured on 2026-06-13 against PR #1427 and recorded in `updates/2026-06-13T143520Z-fresh-typescript-reground-run.md`; it confirmed the composed-JSON glue persists, with one correction: `validate-feedback-classification` already supports split manifest/classification inputs. Because PR #1427 had zero feedback, actionable batch helpers were inventoried from help/source rather than exercised with a real batch.

## Open Questions

- Exact reserved descriptor taxonomy, including the PR-scoping format (e.g. `plan-pr-1274` vs `pr-1274-plan`) and per-batch naming for build payloads and checkpoints.
- Whether explicit mutation references accept sequence numbers only, or also full artifact paths.
- Input shape for `record-batch-checkpoint` validation results: a small agent-authored file vs repeated structured flags.
