# Roadmap

## Work

- [x] Pin the presence semantics: define what "slots is installed" means for the
      in-process `SlotClient` path (autoslot) versus the `ns slot` runtime command group
      (land cleanup), and record the decision.
  - Decided: one notion — the slots extension is present in the kernel's effective
    declared-extension registry, identified by
    `DeclaredExtensionDescriptor.packageName` (`"@nseng-ai/slots"`). All seven design
    decisions (presence, absent-UX, identity, severing, land behavior, naming, scope)
    are recorded in `updates/2026-07-12T182349Z-design-decisions-frontloaded.md`.
- [ ] Capability-presence seam in the kernel: a declarative `requiresExtension` field
      on extension command entries, filtered where the registry builds command
      candidates (`kernel/src/extensions/registry.ts`), plus a
      `hasExtension(packageName): boolean` predicate on `NsExtensionApi` — both
      reading the same declared-extension registry fact.
  - Document both surfaces in `ts/packages/kernel/docs/sdk-reference.md` (the
    authoritative SDK export inventory).
  - Verify hidden-entry filtering against the preinstalled descriptor catalog's
    injected metadata; the absent state needs scenario coverage in a repo without
    slots (the dev workspace always has slots present).
  - Gates both flow-side slices below.
- [ ] Autoslot decoupling: rewrite the slot step in `src/autoslot/slot-checkout.ts`
      from the in-process `createSlotClient` call to exec
      `ns slot checkout --format json` (covers both `--current` and branch modes),
      with a gateway seam for tests; gate the `autoslot` entry with
      `requiresExtension: "@nseng-ai/slots"`; delete `@nseng-ai/slots` from flow's
      `package.json`.
  - Severing mechanism was forced by the isolated managed-extension install trees
    (see `objective.md` Assumptions and Risks); optional/peer dependencies cannot
    resolve across sibling extension trees.
- [ ] Land graceful degradation: LBYL handling for the uninstalled-after-use edge case
      (slot-patterned worktrees exist but slots is absent), using `hasExtension` at
      invocation time.
  - Pre-merge: route managed-slot conflicts into the existing manual-detach guidance,
    extended to name the missing slots capability; blocks before any PR lands.
  - Post-landing: reuse the existing skipped-outcome shape
    (`src/land/execution/post-landing-cleanup.ts`); report the skip, never block.
  - The common no-slots repo needs no change: managed slots are path-detected
    (`src/land/worktree-paths.ts`), so zero matches means the slots path never runs.
  - Evidence: fake-driven tests for both presence states pass alongside the existing
    land suite.
- [ ] Contract docs: the flow README documents slots as an optional dependency, the
      hidden-`autoslot` degraded surface, and land's degraded reporting.

## Parked

- cmux adoption of the presence seam. cmux's coupling is much deeper than flow's was
  (~7 core files import `@nseng-ai/slots`, and `SlotClient` is re-exported from its
  public API), and slots may be a genuinely hard dependency of its dispatch model
  rather than an optional enhancement — evaluate before assuming the seam applies.
- A generalized optional inter-capability dependency convention doc under
  `docs/conventions/`; write it after a second consumer proves the pattern. It should
  record the isolated-install-trees constraint.
