# Roadmap

## Work

- [x] Inventory current Branch Memory callers and classify duplicated mechanics versus namespace-specific policy. Evidence: `inventory.md` identifies TypeScript `check` / `put` duplication and records Python callers as inventory-only for this slice.
- [x] Decide whether a generic storage abstraction is smaller and clearer than the duplication it would replace. Decision: a small TypeScript CLI-mechanics helper is justified; a namespace-neutral Branch Memory product model is not.
- [x] If justified, design the minimal neutral storage contract and conformance tests. Evidence: `@asdl/core/brmem-cli` exposes `checkBrmemEntry` and `putBrmemEntryFromFile` with focused helper tests for success, absence, command failures, unavailable commands, malformed output, and expected-field mismatches.
- [x] Migrate at least two representative callers while preserving their domain-specific validation and user-facing semantics. Evidence: branch-context attachment storage and CCC dispatch prompt storage now delegate shared `check` / `put` mechanics while package tests continue to cover exact command protocols and workflow behavior.

## Parked

- [ ] Consider whether Python Branch Memory callers need a parallel abstraction after the TypeScript boundary is understood.
