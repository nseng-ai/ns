# Rebaselined after the TypeScript port closed

## Summary

This Objective was fully rebaselined against the live codebase. The prior record assumed a pre-port world and a blocking dependency; both have changed.

The decisive change: the predecessor `pr-address-typescript-port` **closed as completed on 2026-06-13** (`closed.md` present; `packages/asdl-pr-address` deleted in commit `9560b339b`; closure in `5f95bfed2`). The dependency gate installed by the 2026-06-12 update — "do not start until the port closes" — is therefore **lifted**, and that earlier update is now superseded as historical context. This Objective is unblocked and ready to start.

The thesis is unchanged and still valid: the composed-payload glue this work targets survives the TypeScript port intact. `validate-feedback-classification`/`plan-feedback` still take `{manifest, classification}`, `build-resolve-thread-batch-payload` still takes `{plan, batch_id, commit_sha, decisions}`, `record-batch-checkpoint` still takes an eight-field composed payload, and `finalize-run` still takes `{feedback, checkpoints}` — all in `ts/packages/pr-address/src/`.

Facts corrected during the rebaseline (verified against the TS source):

- **Store already exists; the gap is the read side.** `src/payload-store.ts` provides the session store, the exact filename contract (timestamp · sequence · descriptor · role), and exclusive-create allocation. Helpers already default to `payload_mode: "payload"` and write artifacts. What is missing is implicit latest-of-kind resolution, the reserved descriptor taxonomy, the `resolved_inputs` block (absent from code and skill), and explicit `--from-build` mutation references.
- **No auto-mint today.** `resolvePayloadSessionId` errors `payload_session_required` when neither an explicit id nor `ASDL_PAYLOAD_SESSION_ID` is set; the `prepare-run` auto-mint row is net-new.
- **`--stdout-mode` is partial.** It exists only on three stack helpers, defaults to `full`, and shapes result data rather than emitting the count/error/`resolved_inputs` digest. Process exit codes already mirror the envelope `exit_code` via clinkr, so that part is preserved rather than introduced.
- **Helper surface grew to ~20 operations.** The migration list was expanded; `stack-feedback-preflight` and `stack-feedback-diff-current` are new and folded into the contract.
- **Skill target confirmed accurate.** `skills/pr-address/SKILL.md` and `references/cli-*.md` exist and are currently hybrid (env-var session id alongside `--payload-file` composition, no `resolved_inputs`).
- **Evidence re-grounded.** The original "~ten Python heredocs on the 2026-06-11 PR #1274 run" no longer describes the tool (Python is deleted). A new roadmap row captures a fresh TS run to re-quantify the glue.

## Objective Impact

`objective.md` and `roadmap.md` were rewritten end-to-end: thesis annotated with current status and a "what already exists" section, scope restated against the TS surface with the full helper inventory, non-goals updated to treat the port as done, assumptions/risks reflecting the lifted gate and grown surface, and a new leading roadmap row to re-ground evidence. No facts from the prior record were trusted without source verification.

## Follow-Ups

- Start with the descriptor-taxonomy / resolution-contract row; precede or pair it with the fresh-TS-run evidence row.
- Keep the staleness guard and classification round-trip tightening parked unless a real post-rebaseline run proves they are needed.
- Treat the 2026-06-12 dependency-gate update as historical; it is no longer the operative sequencing guidance.
