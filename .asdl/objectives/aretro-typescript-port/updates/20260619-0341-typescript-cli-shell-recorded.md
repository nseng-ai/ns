# TypeScript CLI Shell Recorded

## Summary

The `aretro-ts/contract-and-shell` branch provides landed-state evidence for the first implementation slice. Against Graphite parent `add-aretro-typescript-port`, commit `de86da20f` adds the `ts/packages/aretro` package with package identity `@asdl/aretro`, an `aretro` bin, strict package wiring, initial CLI/context/contract modules, operation shells for `collect-evidence` and `read-evidence-detail`, scenario-test support, and workspace lockfile wiring.

The slice codifies the command-shell contract rather than porting full evidence behavior. The current TypeScript shell exposes root help/version/runtime behavior, keeps `exec` hidden from top-level help while invocable, lists the expected operation options, and emits initial Clinkr-shaped JSON envelopes for the shell commands.

Verification evidence:

- Local committed branch diff against `add-aretro-typescript-port` shows only the TypeScript `aretro` package shell and `ts/pnpm-lock.yaml` changes for this slice.
- `pnpm --dir ts --filter @asdl/aretro run check` passed.
- `pnpm --dir ts --filter @asdl/aretro run test` passed.
- PR evidence was not required; local committed branch evidence was sufficient.

## Objective Impact

The roadmap item `Create @asdl/aretro with CLI shell and contract tests` is now complete as landed-state tracking. The Objective's autonomous stack defaults now treat `aretro-ts-contract-and-shell` as a completed prerequisite and direct the next `objective-stack-impl` invocation to continue with compact evidence parity.

The Objective remains open. Compact evidence collection, payload detail mode, real-adapter smoke evidence, branch-retro skill/docs/distribution cutover, conditional Python retirement, and umbrella Objective updates are still active work.

## Follow-Ups

- Continue with `aretro-ts-compact-evidence`: git/session-source fakes, compact DTO conversion, aggregate metrics, warnings, factual evidence items, and privacy-preserving JSON output.
- Preserve the hard evidence/diagnosis boundary: no semantic retrospective recommendations and no raw transcript, prompt, assistant prose, tool output, or command output in compact evidence.
- Defer Python retirement until TypeScript parity, skill/docs cutover, distribution evidence, and rollback/reference evidence are complete.
