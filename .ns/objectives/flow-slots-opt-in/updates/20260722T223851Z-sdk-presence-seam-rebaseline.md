# SDK Presence Seam Rebaseline

## Summary

A complete refresh against the current branch corrected this Objective's historical kernel-era contract. The generic mechanism is already delivered in `@nseng-ai/sdk`: `ExtensionCommandEntry.requiresExtension` filters command candidates against the effective extension package-name set before validation and lazy module loading, and `NsExtensionApi.hasExtension(packageName)` performs an exact, case-sensitive lookup against that same set. `createRealNsExtensionApi` in the ns host loads the effective command catalog and passes its package identities into the SDK constructor.

The mechanism is documented in `ts/packages/sdk/docs/sdk-reference.md`. SDK tests cover present and absent project providers, preinstalled and commandless providers, lazy gated modules, invalid providers, and exact-name lookup; ns-host integration tests prove package identity is distinct from descriptor subpaths. The historical `ts/packages/kernel/...` implementation and documentation paths no longer exist as tracked package source.

Flow has not consumed the mechanism. `autoslot` remains unconditional in `src/ns/extension.ts` and in the Pi mirror's static command list, `src/autoslot/` still imports and constructs `@nseng-ai/slots/api`, the package manifest still declares Slots, land still invokes `ns slot free` without an invocation-time catalog check, and the README still presents Slots as required command infrastructure.

## Objective Impact

The presence-contract and generic-mechanism roadmap row is complete. Remaining work is now organized around three Flow-owned outcomes: decouple and gate `autoslot` across ns and Pi, implement explicit absent-Slots land behavior, and align package/tests/user-facing contracts.

The durable narrative now distinguishes three facts that the stale record conflated:

- effective-catalog package identity decides extension presence;
- canonical path shape identifies a managed-Slot worktree;
- command execution performs an available Slot operation but is not itself a presence probe.

The refresh also removed parked cmux adoption from the live plan because cmux is retired. It preserved the isolated managed-extension-tree constraint, now at its current SDK path, as the reason Flow must cross the command boundary rather than retain an optional direct import.

## Follow-Ups

- Implement the autoslot command-gateway and dual-surface registration slice without changing unrelated Flow commands.
- Thread exact invocation-time Slots presence into land and prove pre-merge refusal versus post-landing skip behavior.
- Update README and package contracts, run focused and repository validation, and return completion evidence to `slots-consumer-dependency-contracts`.

Provenance: objective-refresh basis target=2e0d7a3cddb5f7d8a57ee478e9ded699a68631ec from=1fe6d94f2ad9aca8b79c9aab35a68ba3820a68d6
