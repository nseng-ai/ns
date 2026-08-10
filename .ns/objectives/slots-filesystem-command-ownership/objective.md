---
edges:
  - objective: clinkr-readme-driven-development
    annotation: Consumes the filesystem-owned modern command model and supplies another production migration without becoming part of the Clinkr rebuild's closure gate.
---

# Slots Filesystem Command Ownership

## Thesis

Make each `ns slot ...` filesystem route the authoritative owner of its command assembly, then migrate Slot operations to return modern SDK command outcomes directly. The work proceeds in two behavior-preserving phases: first remove the central command registry and duplicate programmatic topology; only after production-path parity is established, remove legacy outcome translation and legacy command-outcome dependencies.

## Scope

- Phase 1 colocates each command's `defineCommand(...)` assembly in its Clinkr-owned `src/ns/cli/slot/**/command.ts`: schema and result-schema selection, positional and option mappings, handler and renderer wiring, and completion wiring.
- Migrate one command at a time, with one focused PR per command in each applicable phase. Phase 1 gives every command its own ownership PR; phase 2 gives each command still using legacy outcomes its own outcome-modernization PR. Alias-only routes are metadata, not separate commands, and shell commands need no phase-2 PR if phase 1 confirms they already return modern outcomes.
- Permit separate prerequisite and cutover PRs for shared test infrastructure, a route-neutral adapter, and deletion that cannot truthfully belong to one command PR. These PRs must not batch command migrations.
- Keep reusable Slot operations, request/result schemas, renderers, lifecycle behavior, and gateway logic in their existing domain modules during the structural phase.
- Replace name-based loading and the central `slotCommandSpecs` registry with direct filesystem command ownership. Keep aliases in route metadata rather than duplicate command definitions.
- Colocate the shell `show` and `install` command definitions with their routes.
- Use one small route-neutral adapter for `NsExtensionApi` to `SlotCliContext` construction, completion adaptation, and temporary legacy-outcome conversion. It must not know command names, paths, groups, aliases, or maintain a registry.
- Migrate scenario and completion coverage to the production filesystem command face with injected fakes, then delete the legacy programmatic `ClinkrGroup` face and its package export.
- Phase 2 begins only after the phase-1 parity gate. Convert Slot operations to return modern SDK command outcomes directly and delete the temporary legacy-to-modern outcome conversion.
- Preserve the existing `@nseng-ai/slots/api` extension package API and its checkout behavior, except for compatibility adjustments forced by shared types.

## Non-Goals

- Redesigning command names, paths, aliases, options, machine schemas, human rendering, completion behavior, shell navigation, or exit semantics.
- Moving all Slot lifecycle or reusable domain logic physically into route `command.ts` files.
- Redesigning the Slot extension package API, `createSlotClient()`, or its result contract.
- Broad Slot architecture cleanup unrelated to command ownership or modern command outcomes.
- Rebuilding a second programmatic command topology from another shared representation.
- Making this migration a prerequisite for closing `clinkr-readme-driven-development`.

## Completion Criteria

- Every Slot route directly owns its typed modern command definition in its colocated `command.ts`; filesystem metadata remains the sole owner of aliases and group discovery metadata.
- Scenario and completion tests exercise the production filesystem command face with injected fakes and preserve existing observable command behavior.
- `slot-command-specs.ts`, `slotCommandSpecs`, name-based `loadSlotNsCommand`, duplicate alias specs, `shell-commands.ts`, the legacy `command-face.ts`, and the `./command-face` package export are deleted.
- Phase 1 is complete and behavior parity is demonstrated before any phase-2 outcome migration is treated as landed; its history contains one focused ownership PR for each Slot command plus only the necessary shared-infrastructure and cutover PRs.
- Slot operations used by the command face return modern SDK command outcomes directly; temporary outcome translation is gone, and each applicable command was modernized in its own phase-2 PR.
- Slots no longer depends on legacy Clinkr command APIs for command outcomes or render-capability adaptation where the modern command path makes that dependency unnecessary.
- Command paths, aliases, options, machine results, human rendering, completion, parent-shell behavior, and exit semantics remain behaviorally compatible.
- Focused Slot scenarios and relevant TypeScript/package/repository checks pass as completion evidence.

## Assumptions and Risks

Assumptions:

- Clinkr's filesystem command tree and SDK host composition can replace the test-only programmatic `ClinkrGroup` face without losing fake-driven scenario coverage or completion coverage.
- Existing Slot operations and renderers can remain in their current modules during phase 1; direct command ownership does not require a broader domain relocation.
- The modern SDK command outcome contract can represent current Slot success, negative, failure, and usage behavior without changing observable semantics.
- No in-repo production consumer depends on the exported `@nseng-ai/slots/command-face`; any external compatibility concern is acceptable because ns is unreleased.

Risks:

- Migrating tests to the production filesystem path may expose missing context-injection or invocation-I/O seams. Address those with narrow host/test adapters rather than recreating a registry or second topology.
- The current central spec erases concrete request and result types; restoring per-command typing may reveal latent mismatches that look like behavior changes. Resolve them while preserving the existing contract.
- Phase 2 could accidentally broaden into neutral domain-result redesign or presentation cleanup. Keep it limited to direct modern outcomes and legacy command-dependency deletion.
- Shell navigation and completion have host-specific adaptation. Production-path parity tests must cover them so colocation does not silently change side effects or candidate behavior.

## Open Questions

- Is selected-only import evidence or packed-package inventory evidence needed for closure beyond the production behavior and structural deletion gates? Decide from implementation evidence rather than assuming either requirement.
- Which remaining `@nseng-ai/clinkr/legacy` rendering helpers, if any, are presentation dependencies rather than command-outcome residue and should therefore remain outside this Objective?
