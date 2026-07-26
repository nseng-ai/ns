---
# Provenance: this is the ns-specific Reviews review definition produced
# by merging the portable TypeScript style guide
# (`skills/internal/typescript/typescript-style/`, especially `core-rules.md`,
# `checklist.md`, and `references/review-taste-and-process.md`) with the project
# overlay (`skills/internal/typescript/ns-typescript/SKILL.md`), the fake-driven
# gateway guidance in
# `skills/internal/typescript/typescript-fake-driven-testing/SKILL.md`, the composition rules in
# `docs/conventions/consumer-gateways-and-command-shape.md`, and the repo
# enforcement rules in `ts/AGENTS.md` (test-lane hard gates, time seams,
# style-guard ids). It is intentionally not a generic
# TypeScript review; use `.ns/reviews/ns-typescript-style-tripwire/review.md` when reviewing this
# repo's TypeScript diffs.
#
# Regeneration instructions: when any of those source documents changes, refresh this file
# by re-reading those source documents, keep only diff-grounded/mechanically
# reviewable rules in the Active Tier A section, move higher-context design rules
# to the sibling `tier-b.md` file because the Reviews loader ships the review body
# verbatim and Tier B must never ship, preserve the frontmatter schema accepted by
# Reviews, and then run:
#
#   dprint check .ns/reviews/ns-typescript-style-tripwire/review.md
#   dprint check .ns/reviews/ns-typescript-style-tripwire/tier-b.md
#   pnpm --dir ts exec vitest run packages/incubating/extensions/reviews/test/unit/review-definition.test.ts
description: |
  NS TypeScript style Tripwire: flag concrete, mechanically detectable Tier A
  violations of the ns TypeScript style guide and ns TypeScript overlay in the
  supplied diff. Intended for cheap, per-diff detection; resolution stays with
  the engineer in a later, higher-context workflow.
model_profile: fast
applies_to:
  include:
    - "**/*.ts"
    - "**/*.tsx"
    - "**/*.mts"
    - "**/*.cts"
---

Review only the supplied diff. Ignore existing code that the diff does not
touch. Each finding must point to a specific line (or small range) in the
diff and tie to one of the active Tier A rules below. Do not invent findings
about unchanged code.

Only flag violations in TypeScript-family files (`.ts`, `.tsx`, `.mts`,
`.cts`) unless the diff makes a TypeScript rule relevant in another file. This
review combines the portable `typescript-style` guide with the repo-specific
`ns-typescript` overlay for ns. Do not flag package-manager,
formatter, linter, or test-runner choices. Do not propose broad refactors;
report the violated rule and why the changed line is suspicious, and state a
rule's prescribed direction only when that rule names one. If context is
ambiguous, skip the finding rather than inventing intent.

## Active Tier A rules

Flag these whenever they are visible in added or modified diff lines, subject
to each rule's exceptions.

1. **Non-erasable TypeScript.** Flag new uses of `enum`, `namespace`, ambient
   or internal `module` declarations used as namespace syntax, constructor
   parameter properties such as `constructor(private x: T)` or
   `constructor(public readonly x: T)`, `import = ...`, and `export = ...`.
   Severity: `error`. Do not flag the word `module` when it is only a string,
   comment, config key, or normal ES module concept.
2. **Explicit `any` in ordinary code.** Flag explicit `any` forms, including
   `: any`, `as any`, `<any>` casts, `Array<any>`, `Promise<any>`,
   `Record<string, any>`, and generic constraints/defaults such as
   `<T extends any>` when not obviously required. Severity: `error` for
   ordinary leaked `any`; `warning` if the line may be a library seam but the
   justification is missing. Do not flag if the same or immediately adjacent
   line clearly documents an isolated library-forced seam and containment is
   obvious.
3. **Banned double-cast laundering.** Flag `as unknown as SomeType` or
   equivalent double-cast patterns used to force a type, including tests.
   Severity: `error`. The ns overlay hard-bans this pattern everywhere;
   values should be complete typed fixtures, derived from a source of truth,
   runtime-validated, or cast only at a narrow justified library seam.
4. **Plain object shape written as a `type` alias.** Flag `type` aliases whose
   right-hand side is a plain object shape, such as
   `type UserOptions = { name: string }`. Severity: `warning`. Do not flag
   `type` for unions, function signatures, mapped types, tuples, conditional
   types, primitive aliases, or aliases to existing named types.
5. **Broad object-literal casts instead of `satisfies`.** Flag object literals
   cast directly with `as SomeType`, especially config tables, registries,
   maps, or tool definitions such as `const tools = { ... } as ToolSet`.
   Severity: `warning`. Do not flag non-object-literal casts where a runtime
   assertion or library API may require a narrow cast.
6. **Top-level arrow functions for module logic.** Flag top-level named arrow
   functions that define ordinary module logic, especially exported APIs, such
   as `export const buildThing = (...) => { ... }` or
   `const normalizeThing = (...) => { ... }`. Severity: `warning`. Do not flag
   inline callbacks passed to `.map`, `.filter`, `.then`, event handlers,
   object property callbacks, obvious expression-position factories where the
   arrow itself is the library-required API shape, or test data callbacks that
   are clearly local values. If unsure whether the arrow is top-level module
   logic, skip the finding.
7. **Zod schema naming.** Flag Zod schema constants not named `<noun>Schema`,
   such as `const input = z.object({ ... })` or
   `const User = z.object({ ... })`. Severity: `warning`. Do not flag names
   already ending in `Schema`, such as `inputSchema`, `userSchema`, or
   `readToolInputSchema`.
8. **TypeScript suppressions without discipline.** Flag `@ts-ignore` anywhere
   in added or modified lines. Flag `@ts-expect-error` without a same-line or
   immediately adjacent reason explaining why the suppression is safe or
   necessary. Severity: `error` for `@ts-ignore`; `warning` for unreasoned
   `@ts-expect-error`.
9. **Empty catches without explanation.** Flag `catch {}` or catch blocks that
   do nothing and have no comment explaining why ignoring the failure is safe.
   Severity: `warning`. Do not flag a catch that logs, returns a structured
   failure, rethrows, or contains a clear explanatory comment.
10. **Direct mutation of function parameters.** Flag direct in-place mutation
    of parameters visible in the changed function, including assignment to a
    parameter property or index, mutating calls such as `param.push(...)`,
    `param.splice(...)`, `param.sort(...)`, or `param.reverse(...)`, and
    `Object.assign(param, ...)`. Severity: `warning`. Only flag when the
    mutated identifier is visibly a parameter of the same function or method in
    the diff context. Do not flag mutation of fresh local objects or arrays
    created in the same function.
11. **Defaulting with `||`.** Flag obvious defaulting with `||`, such as
    `const name = input.name || "anonymous"` or
    `const timeout = options.timeoutMs || 5000`. Severity: `warning`. Frame the
    finding as a potential style violation: the guide prefers `??` when `""`,
    `0`, or `false` are valid values that must survive. Do not flag boolean
    logic conditions where `||` is just logical disjunction.
12. **Long positional parameter lists or optional positional parameters.** Flag
    function declarations with five or more positional parameters, or with
    multiple optional/defaulted positional parameters. Severity: `warning`. Up
    to four required positional parameters are acceptable when their order is
    clear; beyond that, the style guide prefers a named `*Options` object. Do
    not flag callbacks whose signature is imposed by a library or framework.
13. **Unitless measured constants.** Flag measured constants whose names omit
    units, especially names such as `TIMEOUT`, `DELAY`, `INTERVAL`,
    `DURATION`, `MAX_SIZE`, `LIMIT`, or `MAX_PAYLOAD` that imply time or size
    without a unit suffix. Severity: `warning`. The style guide prefers names
    like `TIMEOUT_MS`, `RETRY_DELAY_MS`, and `MAX_BYTES`.
14. **NS TypeScript import convention drift.** Flag relative imports in
    `ts/` TypeScript source that omit the explicit `.ts` suffix or use the
    wrong source suffix, such as `from "./thing"`, `from "../thing"`, or
    `from "./thing.js"` when importing project TypeScript. Severity:
    `warning`. Do not flag bare package imports (`node:fs`, `zod`,
    `@nseng-ai/foundation/primitives`), type-only imports that already use `.ts`, or
    non-TypeScript assets where the project has an existing pattern.
15. **Cross-package `src/` deep imports.** Flag imports that bypass curated
    workspace package exports by reaching into another package's `src/` tree,
    including `@nseng-ai/<pkg>/src/...` and relative paths that cross from one
    `ts/packages/<pkg>` package into another package's `src`. Severity:
    `warning`. Intra-package relative imports are fine when they stay inside
    the same package and use the explicit `.ts` suffix.
16. **Optional-property `undefined` drift under `exactOptionalPropertyTypes`.**
    Flag object literals that explicitly set an optional property to
    `undefined`, or replace a conditional-spread omission pattern with
    `prop: maybeUndefined`. Also flag raw optional-property `?: T | undefined`
    drift unless the diff makes a permanent explicit-undefined contract clear.
    Severity: `warning`. For domain records, command metadata, registry/catalog
    entries, results, context objects, and durable records, frame the issue as
    omission-vs-explicit-undefined drift, not as a need to widen the declared
    type. Do not recommend widening `prop?: T` to raw `prop?: T | undefined`;
    if explicit `undefined` is truly permanent, use
    `ExplicitUndefined<Reason, T>`. Do not flag the intentional ns pattern
    `...(value === undefined ? {} : { prop: value })`; under this compiler
    setting, omitting a key is different from setting it to `undefined`. Do not
    flag `ExplicitUndefined<Reason, T>` solely because it includes `undefined`;
    check whether the reason/category is specific and appropriate.
17. **Impossible optional state for a guaranteed dependency.** Flag a field,
    collaborator, or method changed to be optional only when the supplied diff
    affirmatively shows that every supported runtime guarantees it. Strong
    evidence includes a required owning/host contract weakened in a derived or
    adapter-facing type; changed composition code always supplying a dependency
    while its changed consumer type marks it optional and immediately uses `?.`
    or an empty/default fallback; optional methods whose changed contract or
    adapter shows they are always present; or changed production call sites all
    supplying a value that only changed test fakes omit. Severity: `warning`.
    Report the contract mismatch and recommend making the dependency or member
    required and removing the concealment so missing wiring fails at compile
    time. Do not merely recommend deleting optional chaining or a fallback while
    leaving the optional contract. Skip the finding when the runtime guarantee
    is outside the diff or intent is ambiguous. Do not flag legitimate optional
    inputs, lookup results, persisted paths, capabilities absent in a supported
    runtime, or other concrete absence states. `?.`, `??`, `?:`, and
    `NonNullable` are supporting evidence only; never flag them by themselves.
18. **Actionable failure erased as `undefined`.** Flag only when the supplied
    diff affirmatively shows all of the following: a named operation has a
    meaningful non-success reason or category; bare `undefined` has no complete
    meaning in the application's domain for that outcome; its direct caller
    needs the information to present or distinguish the failure, retry, recover,
    or preserve an invariant; and the changed API returns `undefined`, forcing
    the caller to reconstruct or hard-code the missing information or lose it.
    Severity: `warning`. Report this as a contract mismatch and recommend a
    coherent named result, discriminated union, or project-local `Result`
    equivalent; do not prescribe a specific library or discriminant tag.
    Exclude ordinary collection/map/index lookups and find misses; optional
    inputs or configuration; parser, type-guard, or probe no-match; caches or
    local lifecycle state; explicit contracts where complete absence or
    cancellation is the outcome; and cases where the reason exists only outside
    the supplied diff. `| undefined`, `return undefined`, optional chaining,
    and `=== undefined` are supporting syntax only, never sufficient evidence.
    If the caller's need or the operation's non-success meaning is ambiguous,
    skip the finding.
19. **Unchecked indexed-access bypass.** Flag non-null assertions or broad casts
    that bypass `noUncheckedIndexedAccess` on array/record lookups, such as
    `items[index]!`, `handlers[key]!`, or `(record[key] as Handler)` without a
    nearby guard. Severity: `warning`. Do not flag a lookup followed by an
    explicit `undefined` guard that stores the narrowed value in a local.
20. **Mega-barrels or sweeping exports.** Flag `export * from "..."`,
    especially in `index.ts` or package public roots. Severity: `warning`. Do
    not flag explicit curated exports such as `export { Foo } from "./foo.ts"`
    or `export type { FooOptions } from "./foo.ts"`.
21. **Real gateway construction below the composition edge.** Flag added
    `new Real*Gateway(...)` or `createReal*Gateway(...)` calls inside domain or
    workflow operations when the changed code is not visibly a top-level
    composition root, a named `createReal*Context` or equivalent composition
    factory, or a real adapter composing its own implementation over the same
    command channel. Severity: `warning`. A function receiving a raw command
    channel, ns extension API object, or Pi runtime `ExtensionAPI` does not
    become a valid composition edge merely because it can construct a gateway;
    domain logic should receive its narrowed Consumer Gateway through an
    injected context. Do not flag direct construction in tests, focused
    real-adapter tests, or clear entrypoint/context factories.
22. **Demonstrated gateway clumps without a named context.** Flag when the diff
    visibly makes two or more runtime collaborators travel together through
    multiple operations or layers without a capability-owned `*Context`.
    Gateways, the ns extension API object, Pi runtime `ExtensionAPI`, and
    project-owned narrowed views of those host objects all count as runtime
    collaborators for this rule. Strong evidence includes the same group being
    forwarded through several helpers, gateways or host API objects being
    mixed into operation `*Options` alongside caller-controlled inputs, or
    collaborators that must share one command/telemetry/lifetime identity being
    reconstructed independently. Severity: `warning`. Recommend a named context
    containing narrowed Consumer Gateways or narrowed host interfaces. Do not
    flag one collaborator, a group appearing together only at one composition
    site, tests constructing the adapter they exercise, or a speculative broad
    context redesign not proved by the diff.

## Severity

- `error` — hard mechanical violations of core rules that should fail review
  outright.
- `warning` — enforceable style conventions and likely violations that should
  be reviewed but may require human judgment.
- `info` — use sparingly; most findings should be `warning` or `error`.

If there are no active Tier A violations in the diff, return an empty findings
list.
