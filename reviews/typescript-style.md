---
description: |
  Enforce asdl's TypeScript style guide on the supplied diff. Flag concrete,
  mechanically detectable violations: non-erasable TypeScript, ordinary `any`,
  broad casts, top-level arrow module logic, mutation of owned-boundary data,
  naming hygiene, suppression hygiene, and other Tier A rules. Intended for
  cheap, per-diff detection; resolution stays with the engineer in a later,
  higher-context workflow.
default_model: haiku
ci: true
when_changed:
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
`.cts`) unless the diff makes a TypeScript rule relevant in another file. Do
not flag package-manager, formatter, linter, test-runner, or import-suffix
choices. Do not propose fixes; report the violated rule and why the changed
line is suspicious. If context is ambiguous, skip the finding rather than
inventing intent.

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
3. **Double-cast laundering.** Flag `as unknown as SomeType` or equivalent
   double-cast patterns used to force a type. Severity: `warning`. The style
   guide expects runtime validation, guards, or narrow wrappers rather than
   laundering values through `unknown` and then a target type.
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
    function declarations with four or more positional parameters, or with
    multiple optional/defaulted positional parameters. Severity: `warning`. The
    style guide prefers a named `*Options` object for several or optional
    inputs. Do not flag callbacks whose signature is imposed by a library or
    framework.
13. **Boolean names without predicate prefix.** Flag new boolean variables,
    fields, properties, or parameters that are explicitly typed as `boolean` or
    initialized to `true`/`false` but do not start with `is`, `has`, `should`,
    or `can`. Severity: `warning`. Do not flag external or wire-contract fields
    where a non-predicate name is visibly required by the API.
14. **Unitless measured constants.** Flag measured constants whose names omit
    units, especially names such as `TIMEOUT`, `DELAY`, `INTERVAL`,
    `DURATION`, `MAX_SIZE`, `LIMIT`, or `MAX_PAYLOAD` that imply time or size
    without a unit suffix. Severity: `warning`. The style guide prefers names
    like `TIMEOUT_MS`, `RETRY_DELAY_MS`, and `MAX_BYTES`.
15. **Mega-barrels or sweeping exports.** Flag `export * from "..."`,
    especially in `index.ts` or package public roots. Severity: `warning`. Do
    not flag explicit curated exports such as `export { Foo } from "./foo"` or
    `export type { FooOptions } from "./foo"`.

## Severity

- `error` — hard mechanical violations of core rules that should fail review
  outright, such as non-erasable TypeScript constructs, ordinary explicit
  `any`, and `@ts-ignore`.
- `warning` — enforceable style conventions and likely violations that should
  be reviewed but may require human judgment.
- `info` — use sparingly; most findings should be `warning` or `error`.

If there are no active Tier A violations in the diff, return an empty findings
list.

<!--
NOT ACTIVE — future Tier B ideas only. Do not flag these yet.

- External/HTTP/model/tool input consumed without an obvious Zod schema.
- Hand-written type/interface that appears to mirror a nearby Zod schema instead of `z.infer`.
- Multiple booleans modeling one state machine where a discriminated union would be clearer.
- Internal discriminated union using a non-`type` tag without an obvious domain/external-contract reason.
- Mutation of returned/shared collections where ownership is unclear.
- Backend/runtime sniffing via name substring checks instead of capability flags.
- Hidden globals where a collaborator should be injected.
- Error-handling boundary/model findings after the deferred error-handling standard is settled.
-->
