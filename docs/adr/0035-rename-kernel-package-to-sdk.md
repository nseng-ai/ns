# Retire the kernel brand: `@nseng-ai/kernel` becomes `@nseng-ai/sdk` with a root author entry point

Status: accepted (2026-07-12)

ADR 0033 §7 parked the `@nseng-ai/kernel` name until the `extension-descriptor-contract`
Objective closed; it closed 2026-07-11 and the trigger fired. The kernel brand carried an
OS analogy the package never earned (user skepticism recorded in the ontology-reshape
effort folder's `ideas.md`), and the package already declares `ns.tier: "sdk"` — the
machine taxonomy and the brand disagreed. Decided 2026-07-12 in the ontology-reshape
grilling session: the kernel brand retires and the concept renames to **sdk** throughout
the ontology — package identity, import subpaths, folded `@nseng-ai/ns` re-exports,
glossaries, author docs, and prose surfaces. Mechanics live in
`docs/wayfinding/ontology-reshape/kernel-sdk-rename-spec.md`; execution is owned by the
`execute-kernel-sdk-rename-spec` Objective.

## The decisions

1. **Package identity.** `@nseng-ai/kernel` → `@nseng-ai/sdk`; directory
   `ts/packages/kernel/` → `ts/packages/sdk/`. The style guard's tier→directory
   projection for the `sdk` tier changes from `dir: "kernel"` to `dir: "sdk"` — the
   brand now matches the tier instead of contradicting it.
2. **Author entry point is the package root.** The public author API moves from the
   `./sdk` subpath to the `"."` export: authors write
   `import { ... } from '@nseng-ai/sdk'`, and `ns.publicPluginApi` becomes `["."]`. The
   public API *is* the package identity. This resolves the three-way `sdk` collision
   without a stutter. Internal workspace exports (`./cli`, `./command-io`, `./context`,
   …) keep their subpaths.
3. **Folded distribution follows the package name.** `@nseng-ai/ns`'s folded re-exports
   rename `./kernel/*` → `./sdk*`: the author API folds as `@nseng-ai/ns/sdk` (mirroring
   the root export) and the internal surfaces as `@nseng-ai/ns/sdk/{cli,command-io,context}`.
4. **Prose vocabulary is "the SDK", sdk-throughout.** The hidden runtime machinery
   (module loader, descriptor discovery, command IO wiring) is described as part of the
   SDK — "implementations hidden in the SDK", "SDK-loaded commands", "SDK subpath
   folding". No separate runtime noun is minted. The existing "SDK boundary" glossary
   term stays and now names the boundary of the literal package. "Kernel" becomes
   anti-vocabulary in live prose; immutable history (`.ns/objectives/**`,
   `docs/wayfinding/**` research assets, `docs/retros/**`, ADRs ≤ 0034) keeps it.
5. **npm registry work is an operator follow-up, not rename scope.**
   `@nseng-ai/kernel@0.1.2` is published and `@nseng-ai/sdk` is unclaimed; claiming the
   new name and optionally deprecating the old one happens at the user's next publish,
   never by the executing runner.

## Considered options

- **Accept the `@nseng-ai/sdk/sdk` stutter** (mechanical scope rename only): smallest
  diff, but the stutter would be permanent public API.
- **Rename the author subpath** (`/authoring`, `/api`): avoids the stutter but mints a
  new public term the glossary must carry forever.
- **A distinct runtime noun** ("SDK runtime", unbranded "the runtime") for the hidden
  machinery: rejected for sdk-throughout simplicity; the API-vs-machinery blur is
  accepted deliberately.

## Consequences

- ~263 `@nseng-ai/kernel*` import lines across 16 workspace packages rewrite (as of
  2026-07-12; re-enumerate at execution), 182 of them author-API imports that become
  bare `@nseng-ai/sdk`.
- The module loader's jiti virtual-module key — the runtime string literal
  `"@nseng-ai/kernel/sdk"` in `runtime/module-loader.ts` — changes with the rename; ns
  is private and unreleased, so existing extension modules hard-cut with no
  compatibility alias (kernel names get no re-export shims).
- Checkout-free assembly (`kernel-export-entries.json`, bundle/prepare/smoke scripts)
  rekeys to the sdk names.
- The published `@nseng-ai/kernel` goes stale on npm until the operator's next publish.
