# SDL command adapter consolidation

## Summary

The current worktree consolidates the landed `sdl address exec ...` command face without changing the public Address operation names or machine payload shapes.

Evidence considered:

- `.sdl/extensions/address/package.json` now routes every `exec-*` command entry to one shared `.sdl/extensions/address/src/commands/exec.ts` extension module, replacing the earlier per-operation extension stubs.
- The shared extension module registers every retained Address operation through `prAddressSdlCommand(...)`, keeping the SDL extension layer as a thin command-face mount over package-owned Address command definitions.
- `ts/packages/address/src/exec-operation.ts` now delegates SDL command construction to `@sdl/capability-kit`'s `createSdlDomainCommand`, so the command adapter pattern is shared with the broader Capability architecture instead of being hand-rolled inside Address.
- The branch-to-PR mapping and PR checks core result unions now use domain-specific success payload keys (`mapping`, `checks`) rather than generic `value`, with package tests updated to the new internal result shape.

## Objective Impact

This refreshes the completed command-face row: the durable command disposition remains `sdl address exec ...`, active consumers remain cut over, and the standalone `pr-address` command remains removed, but the extension implementation is now a shared mount plus package-owned command adapter rather than one extension stub per operation.

The open Domain Core row is still not complete. The work tightens existing core seams and adapter boundaries, but remaining feedback collection/snapshot behavior, review-thread mutation seams, and any reusable Pi watch/fingerprint primitives still need separate evaluation.

## Follow-Ups

- Before treating this consolidation as final evidence, run targeted Address checks/tests for the changed package and SDL command adapter path.
- Continue the Domain Core seam review with the next unextracted PR Address behavior rather than adding more command-face scaffolding.
- The final refresh slice should update docs/context with the shared `@sdl/capability-kit` command-adapter boundary if it remains the landed implementation.
