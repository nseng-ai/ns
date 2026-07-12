# Design Decisions Frontloaded: Presence, Seam, Severing, Land, Naming

## Summary

A grilling session walked every design decision in this Objective and resolved all of
them before implementation, grounded in code evidence gathered along the way. The
decisions:

- **D1 — Presence semantics: one notion.** "Slots is installed" means the slots
  extension is present in the kernel's effective declared-extension registry (any
  source level: preinstalled, project-declared). Both flow consumers key off this
  single fact.
- **D2 — Absent UX: hidden.** When slots is absent, `autoslot` is not registered.
  Implemented as a declarative entry-level gate filtered in
  `descriptorCommandCandidates` (`kernel/src/extensions/registry.ts`), where the
  declared-extension set is already in scope at candidate-build time — no
  registration-model change, no conflict with the lexical-import bundling rule.
- **D3 — Identity: package name.** The gate matches
  `DeclaredExtensionDescriptor.packageName` (`"@nseng-ai/slots"`), already resolved
  and manifest-validated on every source level
  (`kernel/src/extensions/declared-descriptors.ts`). No new metadata.
- **D4 — Severing: shell out.** Autoslot's in-process `createSlotClient` path
  (`flow/src/autoslot/slot-checkout.ts`) is rewritten to exec
  `ns slot checkout --format json` (already covers `--current` and branch modes),
  mirroring land's `ns slot free` pattern, with a gateway seam for tests.
  `@nseng-ai/slots` leaves flow's `package.json` entirely. Forced by a discovered
  constraint: npm-declared extensions install into isolated sibling trees under
  `.ns/managed-extensions/npm/<pkg>/` (`kernel/src/project-config/managed-extension-paths.ts`),
  so cross-extension imports can never resolve in consumer repos — the
  optional-peer-dependency family was dead on arrival. Shell-out also eliminates the
  version-skew hazard of two slots implementations mutating one pool.
- **D5 — Land: LBYL with a two-faced seam.** The common no-slots repo needs nothing:
  managed slots are detected purely by worktree path pattern
  (`flow/src/land/worktree-paths.ts`), so zero matches means the slots path never
  runs. For the uninstalled-after-use edge case: pre-merge blocks with the existing
  manual-detach guidance extended to name the missing capability; post-landing reuses
  the existing skipped-outcome shape (`post-landing-cleanup.ts`) and never blocks.
  LBYL (the repo's stated preference) requires the presence fact at invocation time,
  so the seam has both a declarative face (D2's filter) and an imperative face on
  `NsExtensionApi` — both reading the same registry fact.
- **D6 — Naming: `requiresExtension` + `hasExtension(packageName): boolean`.**
  Kernel-CONTEXT extension vocabulary rather than the Capability layering term; a
  predicate rather than an installed-extensions list, to fence off ad-hoc dependency
  logic in capabilities.
- **D7 — Scope: parked items stay parked.** cmux adoption stays parked — its slots
  coupling is far deeper (~7 core files, `SlotClient` re-exported from its public
  API) and may be a genuinely hard dependency rather than an optional one. The
  convention doc waits for a second consumer. The two new SDK surfaces must be
  documented in `ts/packages/kernel/docs/sdk-reference.md` (the authoritative export
  inventory) as part of this Objective's docs slice.

## Objective Impact

- All three Open Questions are resolved; `objective.md` now records the answers.
- The lead assumption (deterministic presence detection) is validated with code
  evidence; the second assumption (autoslot is the only compile-time coupling) is
  confirmed — one value import, remainder type-only.
- The "two presence notions diverge" risk is de-risked twice over: one notion by
  decision, and shell-out makes both consumers use the same runtime surface in
  practice.
- The roadmap's decision-bearing first row is complete; the remaining rows are
  reshaped into concrete, near-mechanical slices (kernel seam, autoslot shell-out,
  land edge-case handling, contract docs).
- New durable constraint recorded: isolated managed-extension install trees preclude
  cross-extension imports in consumer repos — relevant to any future inter-capability
  dependency work (including parked cmux adoption).

## Follow-Ups

- Implement the reshaped roadmap slices (kernel seam first; it gates the flow-side
  slices).
- One deferred verification: confirm during the kernel-seam slice that hidden-entry
  filtering interacts correctly with the preinstalled descriptor catalog's injected
  metadata (dev-repo workspace discovery always has slots present, so the absent
  state needs a scenario-test consumer repo without slots).
