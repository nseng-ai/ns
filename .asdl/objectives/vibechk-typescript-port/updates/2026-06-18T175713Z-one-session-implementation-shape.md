# One-Session Implementation Shape

## Summary

Expanded the `vibechk-typescript-port` Objective so a future `objective-stack-impl` session can execute it as one small Graphite stack.

The Objective now records concrete implementation decisions: use `@asdl/vibechk` under `ts/packages/vibechk`, preserve the already-implemented Python surface only, preserve schema-version-1 bundle reading with snake_case bundle keys, add an opt-in `just install-vibechk` source shim without adding it to `install-tools` unless caller inventory justifies it, and keep `publish`, `codex`, and `pi` parked in `vibechk-v1`.

It also adds execution-friendly guidance (`Definition of Progress` and `Runner Policy`), a Python contract seed, package layout and gateway/fake guidance, and a suggested three-branch stack shape: contract/read-only shell, runner/git flow, then default-invocation cutover and Python retirement.

## Objective Impact

The Objective is now suitable for a preview-and-confirm implementation flow. A runner should be able to start from the Objective record, inspect the named Python source/tests/docs, and implement the cutover without rediscovering basic product boundaries.

The roadmap now emphasizes semantic review boundaries instead of a long layer checklist. The first branch should inventory and codify the current contract while creating the TypeScript package/read-only surface; the second branch should port mutation-heavy `run` and git/runner safety; the third branch should retire Python only after parity and caller cleanup are proven.

## Follow-Ups

- Run `objective-stack-impl` for `vibechk-typescript-port` when ready.
- During implementation, stop before adding missing v1 features or changing bundle compatibility without a revised preview.
- After cutover, update `port-asdl-toolkit-to-typescript` with the `vibechk` outcome and decide how to resume the paused `vibechk-v1` feature work.
