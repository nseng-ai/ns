---
edges:
  - objective: generic-flow-extension
    annotation: "Follow-up decoupling slice: the repo-specificity audit's flagged slots assumption becomes dedicated work making flow's slots dependency opt-in, while that objective keeps the README contract and point mechanics."
  - objective: slots-consumer-dependency-contracts
    annotation: "Flow owns its focused optional-Slots migration while the coordination Objective owns cross-consumer accounting and synthesis."
---

# Flow Slots Opt-In

## Thesis

Flow hard-depends on the slots capability even though slot-awareness is peripheral to
its core loop: `@nseng-ai/slots` is a plain `dependencies` entry consumed only by the
`autoslot` command, and `land` shells out to `ns slot free` for post-landing managed-slot
cleanup. This Objective makes slots an opt-in enhancement: when the slots capability is
installed, flow is slot-aware (`autoslot` is available and land cleans up managed slots);
when it is not, every other flow command works unchanged and flow's package and runtime
surfaces carry no slots requirement. The capability-presence seam this requires does not
exist today — extension `entries` are static and nothing can ask "is capability X
installed?" — so the mechanism is designed platform-ready (cmux has the same hard
coupling and should be able to adopt it later), but this Objective ships it flow-scoped.

## Scope

- Sever the hard `@nseng-ai/slots` dependency in `ts/packages/capabilities/flow/package.json`;
  the compile-time import surface is only `src/autoslot/slot-checkout.ts` and
  `src/autoslot/autoslot.ts`.
- Pin the presence semantics: "slots installed" for the in-process `SlotClient` path
  (autoslot) versus the `ns slot` runtime command group (land's cleanup shell-out), and
  record the decision.
- A minimal capability-presence seam with two faces reading one kernel registry fact:
  a declarative `requiresExtension` entry field (registration-time filtering) and a
  `hasExtension(packageName)` predicate on `NsExtensionApi` (invocation-time checks);
  designed so a second capability could consume it without rework, consumed here only
  by flow.
- Gate `autoslot` on slots presence: the entry is not registered when slots is absent,
  so a repo without slots gets a coherent `ns flow` surface rather than a crash.
- Land degrades gracefully without slots: the post-landing managed-slot cleanup path
  (`src/land/execution/post-landing-cleanup.ts` over `LandWorktreeSlotFactsGateway`)
  skips or reports clearly when `ns slot` is absent, with tests covering both presence
  states.
- The flow README contract (`ts/packages/capabilities/flow/README.md`) documents slots
  as an optional dependency and what changes when it is absent.

## Non-Goals

- Migrating cmux off its hard `@nseng-ai/slots` dependency (it validates the seam's
  platform-readiness on paper only; adoption is parked).
- Changing slots capability behavior, its CLI surface, or its API.
- A general plugin/DI or inter-capability dependency-resolution system beyond the
  minimal presence seam.
- Abstracting Graphite or revisiting flow's Graphite-native identity (owned by
  `generic-flow-extension` and the graphite-dependency-boundary convention).

## Completion Criteria

- `ts/packages/capabilities/flow/package.json` carries no hard `@nseng-ai/slots`
  dependency.
- In a repo with slots installed, `ns flow` behavior is unchanged, including `autoslot`
  and land's managed-slot cleanup.
- In a repo without slots, the `ns flow` command surface is coherent (no broken
  `autoslot` crash path), and `ns flow land` completes landings with slot cleanup
  skipped and explicitly reported.
- Both presence states are covered by tests (fake-driven for domain paths, scenario
  coverage for the command surface).
- The flow README documents the optional slots dependency; the presence-semantics
  decision is recorded.

## Assumptions and Risks

- **Assumption — presence detection can be deterministic. Validated.** The kernel's
  declared-extension loading already resolves a manifest-validated `packageName` for
  every extension on every source level
  (`kernel/src/extensions/declared-descriptors.ts`), and the registry holds the
  declared set in scope where command candidates are built. The presence fact is
  `DeclaredExtensionDescriptor.packageName === "@nseng-ai/slots"`.
- **Assumption — autoslot is the only compile-time coupling. Confirmed.** Exactly one
  value import exists (`createSlotClient` in `src/autoslot/slot-checkout.ts`); all
  other `@nseng-ai/slots` imports in flow are type-only and erasable.
- **Constraint (discovered) — isolated extension install trees.** npm-declared
  extensions install into isolated per-package trees under
  `.ns/managed-extensions/npm/<pkg>/`
  (`kernel/src/project-config/managed-extension-paths.ts`), so one extension's
  imports can never resolve against a sibling extension's tree in a consumer repo.
  This rules out the optional/peer-dependency severing family outright and drove the
  shell-out decision; it binds any future inter-capability dependency work.
- **Risk — two presence notions diverge. De-risked.** One presence notion was decided
  (extension declared in the registry), and the shell-out severing makes both flow
  consumers use the same runtime surface (`ns slot ...`) in practice.
- **Risk — net-new kernel mechanism over-generalizes.** Still open until built.
  Mitigations decided: an entry-level declarative field (not a dependency system), a
  boolean predicate on `NsExtensionApi` (not an installed-extensions list), cmux
  adoption parked, convention doc parked until a second consumer.
- **Risk — degraded-mode UX reads as breakage.** Reshaped by the hidden-autoslot
  decision: hiding was chosen deliberately over fail-fast, accepting reduced
  discoverability in exchange for a clean surface and a kernel-internal registration
  gate. Land's degraded paths report explicitly (manual-detach guidance pre-merge,
  skipped-cleanup outcome post-landing); the README documents the degraded surface.

## Open Questions

All three original questions were resolved by the recorded design decisions (see
`updates/2026-07-12T182349Z-design-decisions-frontloaded.md`):

- Presence detection: a kernel registry fact keyed by extension package name —
  declaratively via a `requiresExtension` entry field, imperatively via
  `hasExtension(packageName)` on `NsExtensionApi`.
- Absent `autoslot`: hidden (not registered), via the declarative gate.
- Platform convention doc: deferred until a second consumer proves the pattern; the
  SDK surfaces are documented in `ts/packages/kernel/docs/sdk-reference.md` now.
