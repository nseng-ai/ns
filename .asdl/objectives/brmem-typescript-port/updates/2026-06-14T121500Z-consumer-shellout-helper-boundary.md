# Consumer Shell-Out Helper Boundary Clarified

## Summary

PR #1473 (`shared-brmem-command-wrapper-put-parsing`) centralized neutral `brmem` command execution helpers and successful `brmem put --format json` parsing in `@asdl/core/brmem-cli`. Branch-context and CCC dispatch prompt now share that shell-out wrapper path while keeping their namespace-specific validation and workflow semantics local.

This was a remediation for duplicated Branch Memory CLI wrapper mechanics in TypeScript consumers. It did not migrate those consumers onto the native `ts/packages/brmem` library and did not change the public `brmem` CLI, git-ref storage layout, JSON-envelope contract, or TypeScript brmem cutover sequence.

## Objective Impact

The `brmem-typescript-port` Objective remains focused on making native TypeScript `brmem` the default public implementation. No roadmap row is completed by PR #1473: `exec resolve-prompt`, wrapper/skill cutover, Python fallback retirement, and playbook feedback remain the active non-parked work.

The consumer-migration boundary is clearer: sharing neutral shell-out mechanics is acceptable outside this Objective when it reduces duplication without replacing the CLI-backed boundary, but migrating `@asdl/core/brmem-cli.ts`, branch-context, or CCC onto native brmem library calls remains parked until native brmem is TypeScript-default.

Evidence considered: Graphite parent `branch-memory-dispatch-prompt-delivery`; branch commit `7da0b3041` / PR #1473; PR file set touching `ts/packages/asdl-core/src/brmem-cli.ts`, `ts/packages/branch-context/src/brmem-gateway.ts`, `ts/packages/ccc/src/cmux/dispatch-prompt.ts`, and the separate follow-up Objective `.asdl/objectives/branch-memory-storage-abstraction/`. Validation evidence from the implementation branch included full TypeScript tests/checks before submit and `just ts-check` after restack conflict resolution.

## Follow-Ups

- Keep native consumer rewiring parked until the TypeScript brmem CLI is the default public surface.
- Track any broader Branch Memory storage abstraction under the separate `branch-memory-storage-abstraction` Objective rather than expanding this Objective's native brmem port scope.
- Continue the next brmem port work on `exec resolve-prompt`, public wrapper/skill cutover, Python fallback retirement, and playbook feedback.
