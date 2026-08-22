# Plan: Add lazy memoized Zod declarations at the current stack tip

## Goal and outcome

Create one focused PR as a new Graphite child above the current stack tip, `gh-stack-local-docs`, that introduces a reusable lazy, memoized Zod declaration primitive and proves it by migrating all production schema declarations in the new `@nseng-ai/gs` extension.

The resulting API should support this ergonomic shape:

```ts
export const gsInventoryDecl = zDecl(() =>
	z.strictObject({
		stacks: z.array(gsStackDecl.schema),
	}),
);

export type GsInventory = z.output<typeof gsInventoryDecl.schema>;

const parsed = gsInventoryDecl.parse(input);
const schema = gsInventoryDecl.schema;
```

Required behavior:

- Importing a module that declares a schema with `zDecl(...)` must not execute that declaration's schema initializer.
- The first access through `.schema`, `.parse(...)`, or `.safeParse(...)` must construct the schema.
- Later accesses must reuse the exact same schema instance.
- Declaration methods must be shared prototype methods rather than per-declaration closures.
- The helper module must use type-only Zod imports so importing the helper does not itself load Zod at runtime.
- Concrete Zod schemas must still be supplied at existing SDK/Clinkr boundaries through `.schema`.
- This PR must document the convention but must not add a style guard or baseline for the repository's existing eager schemas.

## Context and discovered facts

### Stack and delivery context

- Planning source and current stack tip: `gh-stack-local-docs`.
- Existing stack branches must remain unchanged. The implementation session should create a new Graphite child above `gh-stack-local-docs`; do not amend or rename the three existing `gh-stack-local-*` branches.
- The current stack introduces `@nseng-ai/gs`; this follow-up PR can use it as a real proving consumer without expanding into an unrelated package migration.
- The repository is private and unreleased, so the `gs` schema exports can make a clean breaking cutover from `*Schema` to `*Decl` without compatibility aliases.

### Ownership

- The agreed owner is the existing `@nseng-ai/foundation/primitives` API-kind subpackage.
- `zDecl` is ns-independent and meets Foundation's Neutral Infra boundary: an external Zod consumer can use the same lazy declaration contract without ns vocabulary.
- `@nseng-ai/foundation` already has a runtime Zod dependency and Zod-adjacent helpers in `ts/packages/public/infra/foundation/src/primitives/primitives.ts`.
- Using Foundation rather than `@nseng-ai/sdk` keeps the primitive available to SDK-independent packages and preserves dependency direction.
- Do not create a new Foundation subpackage. The existing `primitives` door is sufficient and avoids inventing an unproven importer edge class.

### Runtime scope and limits

- `zDecl` defers project-owned schema construction and nested schema composition. It does not defer evaluation of a schema module or loading Zod when that schema module has a static runtime `z` import.
- Type expressions such as `z.output<typeof gsInventoryDecl.schema>` are erased and do not access the runtime getter.
- Nested declarations remain lazy: constructing an outer declaration may access and initialize inner declarations through `.schema`, but none initialize before the outer declaration is first used.
- Full deferral of Zod itself would require an async dynamic-import or lazy module boundary and is not part of this PR.
- The repository has roughly 520–580 existing production module-scope direct Zod declarations plus derived schemas. A repository-wide migration is explicitly out of scope.
- A proposed forward-only style guard was rejected for this PR. Do not add package opt-ins, changed-file checks, or a checked-in debt baseline.

### Existing command boundary

- `NsCommandSchema` is currently a concrete `z.ZodObject`, and `DefineCommandSpec` accepts concrete request and result schemas.
- SDK command registration reads request `.shape`, and Clinkr uses concrete schemas for argument parsing, result decoding, and `--json-schema` generation.
- Therefore `ZodDeclaration` must remain an explicit wrapper. Do not use a `Proxy`, and do not make it pretend to be a `ZodType`.
- `@nseng-ai/gs` must pass `gsListRequestDecl.schema` and `gsListResultDecl.schema` to `defineCommand`.

## Public API design

Add a concise Foundation primitive with these semantics:

```ts
export interface ZodDeclaration<TSchema extends z.ZodType> {
	readonly schema: TSchema;
	parse(input: unknown): z.output<TSchema>;
	safeParse(input: unknown): z.ZodSafeParseResult<z.output<TSchema>>;
}

export function zDecl<TSchema extends z.ZodType>(
	initialize: () => TSchema,
): ZodDeclaration<TSchema>;
```

Implementation guidance:

- Implement the declaration with a small class so `.parse` and `.safeParse` live on the prototype and are shared by all instances.
- The class itself may remain private if callers need only the exported `ZodDeclaration` interface and `zDecl` factory. Exporting implementation machinery is not required.
- Store the initializer and cached schema on the instance. The getter should initialize exactly once and return a stable identity.
- Do not use `Proxy`, decorators, bound methods, per-instance arrow methods, global maps, `WeakMap`, reflection, or argument-based memoization.
- Do not call `initialize` during `zDecl(...)`.
- The initializer is zero-argument and deterministic. Contextual or parameterized schema construction remains an ordinary explicit factory and is not globally memoized.
- Keep the direct method surface to `.parse` and `.safeParse`. Async and specialist operations remain available through `.schema`.
- Before coding, inspect Zod 4.4.3's installed types and use its exact `safeParse` result type rather than guessing. Preserve input/output typing if Zod's generic signatures require more precision than the sketch above.
- Prefer a type-only Zod import in the Foundation primitive. Confirm generated JavaScript/import erasure through the project's normal TypeScript setup.

Naming convention:

- Declaration bindings use `<noun>Decl`, not `<noun>Schema`, because the value is a lazy declaration wrapper rather than a concrete Zod schema.
- Concrete schema access is explicit as `<noun>Decl.schema`.
- Associated types are inferred from the declaration's schema property with `z.input`, `z.output`, or `z.infer` as appropriate.
- Do not add compatibility aliases that eagerly access `.schema`; they would defeat the import-time objective.

## Files and symbols

### Foundation primitive

- `ts/packages/public/infra/foundation/src/primitives/primitives.ts`
  - Add the type-only Zod import.
  - Add exported `ZodDeclaration<TSchema>`.
  - Add the private prototype-based implementation class.
  - Add exported `zDecl(...)`.
  - Keep the API ns-independent and document the lazy/memoized contract.
- `ts/packages/public/infra/foundation/test/primitives.test.ts`
  - Add focused runtime tests for lazy initialization, exact-once initialization, stable schema identity, `.parse`, and `.safeParse`.
  - Add type-level assertions with the repository's existing Vitest/TypeScript facilities if needed to prove output inference, transformed-schema output, and concrete schema preservation.

No `package.json` export change is expected because `@nseng-ai/foundation/primitives` already maps to `primitives.ts`, and Foundation already depends on Zod. Recheck the package manifest and lockfile after implementation and avoid incidental changes if dependency metadata remains unchanged.

### `@nseng-ai/gs` proving migration

- `ts/packages/incubating/extensions/gs/src/core/list-command.ts`
  - Import `zDecl` from `@nseng-ai/foundation/primitives`.
  - Convert every production module-scope schema in this file into a lazy declaration, including nested pull-request, branch, stack, request, and result declarations.
  - Compose declarations with `.schema` inside outer initializers.
  - Rename exported `gsListRequestSchema` to `gsListRequestDecl`.
  - Rename exported `gsListResultSchema` to `gsListResultDecl`.
  - Infer `GsListResult` from `typeof gsListResultDecl.schema`.
  - Update `NsCommand` generic arguments and `defineCommand` to pass concrete `.schema` values.
- `ts/packages/incubating/extensions/gs/src/core/local-state.ts`
  - Convert all module-scope provider-state schemas to `*Decl` declarations, including the nonempty string, pull request, branch, stack, and complete local-state declarations.
  - Preserve tolerant `.passthrough()` behavior, validation semantics, normalization, and error messages.
  - Parse through `localStateDecl.safeParse(input)`.
- `ts/packages/incubating/extensions/gs/src/core/index.ts`
  - Export `gsListRequestDecl` and `gsListResultDecl`.
  - Remove old `*Schema` exports with no aliases.
- Search the complete `@nseng-ai/gs` package for consumers of the old names and update tests or source references.
- `ts/packages/incubating/extensions/gs/test/unit/list-command.test.ts`
  - Preserve command behavior coverage.
  - Add or adjust assertions that concrete SDK command schemas equal the declarations' memoized `.schema` values where this directly proves integration.
- `ts/packages/incubating/extensions/gs/test/unit/local-state.test.ts`
  - Preserve all provider-state compatibility, rejection, sorting, and normalization cases while exercising the new declaration path.
- `ts/packages/incubating/extensions/gs/test/integration/ns-cli.test.ts`
  - Preserve `ns gs list`, JSON output, and `--json-schema` integration coverage. These tests prove that unwrapping `.schema` still satisfies SDK/Clinkr's concrete Zod requirements.

### Documentation and vocabulary

- Add a focused convention document under `docs/conventions/` (use a direct name such as `lazy-zod-declarations.md`) that records:
  - the import-time activity problem;
  - what `zDecl` does and does not defer;
  - canonical declaration, composition, parsing, and type-inference examples;
  - `<noun>Decl` naming;
  - deterministic zero-argument initializer requirement;
  - `.schema` at APIs that require concrete Zod values;
  - no proxy/full-method-forwarding policy;
  - no current global enforcement or repository-wide migration claim.
- Link the convention from `ts/AGENTS.md` in the TypeScript or package-authoring guidance so future agents discover it before adding module-scope production schemas.
- Update `ts/packages/public/infra/foundation/CONTEXT.md` in the same implementation change to define the public concept (for example, **Zod Declaration**) once the primitive is real. State that it is a lazy, memoized owner of one deterministic schema and distinguish it from a concrete schema and contextual schema factory.
- If `@nseng-ai/gs/README.md` names concrete exported schemas, update it; otherwise avoid unrelated documentation churn.
- Do not edit immutable ADRs. No new ADR is required for this small reversible primitive and convention.
- Do not modify the portable `typescript-style` skill in this PR; project-specific convention lives in repository docs and `ts/AGENTS.md`.

## Implementation steps

1. Revalidate that the implementation starts from `gh-stack-local-docs`, the current tip, with a clean worktree. Create a new Graphite child branch above it using the repository's normal `gt create` workflow; do not rename or amend existing stack branches.
2. Inspect Zod 4.4.3 declarations for `ZodType`, `z.output`, and safe-parse result types. Finalize the generic signatures without casts or `any` leakage.
3. Add `ZodDeclaration` and `zDecl` to Foundation primitives using a private class with prototype methods and a lazy schema getter.
4. Add Foundation unit tests before broad consumer edits. Prove:
   - the initializer count is zero after `zDecl(...)`;
   - first `.schema` access increments it once;
   - repeated `.schema`, `.parse`, and `.safeParse` calls never increment it again;
   - repeated `.schema` access uses strict object identity;
   - successful and failed parsing preserve Zod behavior;
   - transformed-schema output typing is retained if supported by the chosen signature.
5. Migrate `@nseng-ai/gs/src/core/list-command.ts` completely to `*Decl` declarations. Use `.schema` only inside declaration composition or at the SDK command boundary.
6. Migrate `@nseng-ai/gs/src/core/local-state.ts` completely. Preserve every external-provider tolerance and normalization detail.
7. Update `core/index.ts` and all old `gsList*Schema` references. Run a bounded repository search for stale exported names.
8. Add/update focused `gs` tests, including concrete command-schema integration and existing `--json-schema` behavior.
9. Add the convention document, link it from `ts/AGENTS.md`, and synchronize Foundation `CONTEXT.md` with the implemented term.
10. Run formatters where required, inspect the final diff for accidental eager `.schema` compatibility exports, then run validation.

## Validation guidance

Run focused tests while iterating, followed by repository-required gates:

```bash
pnpm --dir ts vitest run --config vitest.config.ts \
  packages/public/infra/foundation/test/primitives.test.ts \
  packages/incubating/extensions/gs/test

just ts-deps-check
just ts-format-check
just ts-lint
just ts-check
just ts-test
just ts-test-integration
just ts-test-sanity
just ts-test-typescript-style-guard
just
```

Use the exact package scripts/configuration accepted by the current checkout if the focused Vitest invocation syntax differs. Do not add raw timers, module mocks, process mutation, or other shared-cache hazards to tests.

Required static checks:

```bash
rg -n 'gsList(Request|Result)Schema' ts/packages/incubating/extensions/gs
rg -n 'const .*Schema\s*=\s*z\.' ts/packages/incubating/extensions/gs/src
```

Interpret the second search as a review aid, not a complete parser or a new enforcement mechanism. Also inspect the built/typechecked behavior to confirm Foundation's type-only Zod import is erased and importing the `zDecl` helper does not add a runtime Zod edge beyond existing consumer schema modules.

## Risks and assumptions

- **Static Zod loading remains:** schema modules still import runtime `z`; this PR improves import-time activity by deferring project-owned schema allocation, not by promising that Zod itself is unloaded.
- **Accidental eager access:** a module-level compatibility export such as `export const fooSchema = fooDecl.schema` would defeat laziness. Do not add one.
- **Nested initialization:** an outer declaration initializes referenced inner declarations when the outer initializer first accesses `.schema`. This is intended and still avoids import-time construction.
- **Memoized shared identity:** declarations are module-scoped state after first use. Initializers must be deterministic and independent of cwd, env, configuration, clocks, filesystem, or caller data so test order cannot affect behavior.
- **Detached methods:** prototype methods rely on normal method invocation (`decl.parse(input)`). Do not add binding/per-instance closures merely to support `const parse = decl.parse`; detached-method support is not part of the contract.
- **Zod typing details:** the public sketch may need adjustment to preserve exact Zod 4 input/output generics. Resolve this from installed declarations without weakening to `any`, broad casts, or `as unknown as`.
- **No global enforcement:** documentation and the proving migration establish the pattern. Existing eager schemas remain valid debt, and this PR must not claim the repository is fully migrated.
- **Performance claim:** test laziness and exact-once semantics deterministically. Do not claim measurable startup improvement without a benchmark; the architectural outcome is reduced import-time schema construction.

## Review and remediation checklist

Before submission, review the PR specifically for:

- `zDecl(...)` itself performs no schema initialization.
- `.schema`, `.parse`, and `.safeParse` converge on one cached schema instance.
- Methods are prototype-shared; no object-literal function allocation per declaration and no proxy machinery were introduced.
- The Foundation implementation uses only type-level Zod imports.
- The public API remains ns-independent and does not leak SDK or Clinkr types.
- Every production module-scope Zod schema in `@nseng-ai/gs` is migrated, not only the two exported command schemas.
- `defineCommand` and Clinkr receive concrete `.schema` values.
- Old `gsListRequestSchema` and `gsListResultSchema` names are gone rather than preserved as eager aliases.
- Provider parsing remains tolerant of additive fields and unchanged in failure semantics.
- Documentation states the limits honestly and does not imply a global guard exists.
- Foundation `CONTEXT.md` describes implemented ground truth, not future enforcement.
- The change remains one coherent PR above the existing stack tip; no existing branch is renamed or rewritten.

If review finds awkward generic signatures, prefer a smaller truthful interface over adding overloads or casts. If a concrete Zod consumer cannot accept `.schema`, repair that explicit call site rather than making `ZodDeclaration` masquerade as a Zod schema.