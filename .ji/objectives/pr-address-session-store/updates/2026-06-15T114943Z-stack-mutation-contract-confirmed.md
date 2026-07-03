# Stack mutation contract confirmed

## Summary

Current source and CLI-reference evidence show the stack mutation path has adopted the same session-store and explicit-artifact boundary as the single-PR mutation path.

`build-stack-resolve-thread-payloads` now resolves the latest stack plan from the payload session, reads only an agent-authored decisions file, emits `resolved_inputs.plan`, and writes managed per-PR `thread_resolution_build` artifacts for ready entries. Those ready entries feed the existing mutation gate through `resolve-thread-batch --from-build <payload_path>`, which never reads stdin, never accepts arbitrary composed payload JSON, and refuses omitted build artifacts with `explicit_artifact_required`.

Evidence considered:

- Source inspection of `ts/packages/pr-address/src/stack-resolve-thread-payloads.ts` and `ts/packages/pr-address/src/session-inputs.ts`.
- Reference inspection of `skills/pr-address/references/cli-mutation.md`.
- Verification: `pnpm --dir ts/packages/pr-address run test -- build-stack-resolve-thread-payloads resolve-thread-batch` passed.

## Objective Impact

The roadmap row "Migrate the mutation flow to explicit artifact references" is now complete. The remaining mutation concern is not artifact-boundary design; it is real-run evidence through the final rewritten skill.

This narrows the remaining open Objective work to removing stale composed/pipeline-produced input compatibility surfaces, rewriting the `pr-address` skill and references so they teach only the session-store flow, and proving the result with end-to-end single-PR and stack runs.

## Follow-Ups

- Keep `resolve-thread-batch` explicit-reference only; do not add latest-artifact mutation resolution.
- In the final skill rewrite, describe stack batch mutation as: build per-PR artifacts from the session-resolved stack plan, then apply each ready artifact through `resolve-thread-batch --from-build`.
- Continue with the input-style removal row before treating the skill rewrite as final.
