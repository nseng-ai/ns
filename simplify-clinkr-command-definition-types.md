# Simplify Clinkr command-definition type composition

## Goal and outcome

Refactor the renderer-enforcement types introduced by commit `b9a7e21fa` (`[cp] Require renderers for data-bearing commands`) so the modern `@nseng-ai/clinkr/app` command-definition interface keeps the same behavior without encoding the result-policy × context-mode matrix through duplicated aliases and four manually enumerated broad-storage arms.

The intended outcome is:

- one private, distributive result contract owns the bodyless versus data-bearing invariant;
- context-free and contextful execution remain two direct shapes because their callback arities genuinely differ;
- `defineCommand({...})` remains the primary author-facing interface and retains exactly two overloads, one per context mode;
- the current exported expert/composition types and generic parameter order remain compatible;
- context-free command definitions statically require omission of `requiresContext`, matching the filesystem runtime decoder;
- runtime behavior, renderer enforcement, filesystem validation, and output semantics do not change.

This is a type-composition refactor atop `b9a7e21fa`, not a rollback or redesign of its renderer policy.

## Context and discovered facts

### Current renderer contract

Commit `b9a7e21fa` established the required product behavior:

- A data-bearing command declares `resultSchema`, must declare `renderHuman`, and may declare `renderMarkdown`.
- A bodyless command omits `resultSchema` and may not declare either renderer.
- A bodyless handler returns `ok()`; `ok(data)` requires a result schema.
- Filesystem-loaded command modules receive the same coupling checks at runtime because static types cannot protect dynamically imported values.
- The modern `/app` rendering path no longer silently pretty-prints successful data when a renderer is absent.

Those semantics are complete and already validated. Do not change `/legacy`, raw commands, envelope formats, JSON Schema behavior, or rendering behavior in this follow-up.

### Current type hierarchy

The main target is `ts/packages/public/infra/clinkr/src/app/command-definition.ts`, especially the block beginning at `ResultSchema` near line 132. It currently contains:

- `SharedCommandDefinition`;
- `DataBearingCommandDefinition`;
- `BodylessCommandDefinition`;
- separate context-free and contextful axis interfaces;
- separate inference-only `ContextFreeCommandDefinitionInput` and `ContextfulCommandDefinitionInput` unions;
- public context-free and contextful definition unions;
- an explicit four-arm `ClinkrCommandDefinition` union.

The duplication is not all accidental:

- The inference-only input unions pin the bodyless branch to `undefined`, preventing handler return inference from inventing a result type when `resultSchema` is omitted.
- The callback bivariance hack allows schema-specific handlers and renderers to be stored behind the broad runtime `ClinkrCommandDefinition` type under `strictFunctionTypes`.
- The explicit four-arm broad type avoids treating `z.ZodType | undefined` as one indivisible conditional input.

The refactor must preserve these behaviors even if it removes their current representation.

### Public and downstream usage

Preserve these exported types and their existing generic order:

- `ResultOf<TResultSchema>`
- `ContextFreeCommandDefinition<TSchema, TResultSchema>`
- `ContextfulCommandDefinition<TContext, TSchema, TResultSchema>`
- `ClinkrCommandDefinition<TContext>`

Known direct users include:

- `ts/packages/public/sdk/src/sdk/command.ts`
  - indexes `ContextfulCommandDefinition<NsExtensionApi, S, TResultSchema>["handler"]`;
  - aliases it as `NsCommand<S, TResultSchema>`.
- `ts/packages/public/sdk/src/sdk/clinkr-command-adapter.ts`
  - accepts and returns an already-typed contextful definition as an identity adapter.
- `ts/packages/public/infra/clinkr/test/type/readme-examples/14-confirmation.ts`
  - directly annotates a bodyless contextful definition.
- Clinkr runtime modules (`app.ts`, `completion.ts`, `programmatic-source.ts`, and `selected-command.ts`)
  - consume broad `ClinkrCommandDefinition<TContext>` values.

`ts/packages/public/infra/clinkr/src/app/index.ts` exports the factory and the expert/composition types. Keep those exports. Do not deprecate or remove the types in this change. The factory is primary for ordinary command authors; the named definition types remain necessary for SDK and composition seams.

### Context discriminant alignment

`selected-command.ts` accepts:

- omitted `requiresContext` for context-free definitions;
- exactly `requiresContext: true` for contextful definitions.

It rejects explicit `false` and present-but-`undefined`. The current command-definition type permits `requiresContext?: false`, so static and runtime contracts differ.

Use `requiresContext?: never` for context-free command definitions. A repository search found no valid authored structured command using explicit `false`; the explicit-false structured and raw module strings in `test/integration/app-module-contract.test.ts` are malformed-module rejection fixtures and must remain. The `requiresContext: false` occurrences in `app.ts` describe app configuration/internal normalized options rather than command definitions and are out of scope.

## Proposed type design

Use a private conditional result contract as the sole owner of output policy. The exact names can be adjusted for local clarity, but the shape should be equivalent to:

```ts
type ResultSchema = z.ZodType | undefined;

export type ResultOf<TResultSchema extends ResultSchema> =
  TResultSchema extends z.ZodType ? z.output<TResultSchema> : undefined;

type BivariantCallback<
  TArguments extends readonly unknown[],
  TResult,
> = {
  invoke(...arguments_: TArguments): TResult;
}["invoke"];

type CommandRenderer<TResult> = BivariantCallback<
  [result: TResult, capabilities: RenderCapabilities],
  string
>;

type CommandResultContract<TResultSchema extends ResultSchema> =
  TResultSchema extends z.ZodType
    ? {
        readonly resultSchema: TResultSchema;
        readonly renderHuman: CommandRenderer<z.output<TResultSchema>>;
        readonly renderMarkdown?: CommandRenderer<z.output<TResultSchema>>;
      }
    : {
        readonly resultSchema?: never;
        readonly renderHuman?: never;
        readonly renderMarkdown?: never;
      };
```

Compose that contract with:

1. one shared schema-bearing base;
2. one direct context-free execution interface with `requiresContext?: never`, a one-argument handler, and a one-argument completion provider;
3. one direct contextful execution interface with `requiresContext: true`, a two-argument handler, and a two-argument completion provider.

Do not collapse context mode into conditional rest tuples or a generic mode object. Although that would remove textual duplication, it would weaken contextual callback inference, diagnostics, discriminant narrowing, and readability.

Do not nest output policy under a new runtime property. Command objects must retain their current flat fields (`schema`, `resultSchema`, `renderHuman`, `renderMarkdown`, `handler`, `completionProvider`, and optional/true `requiresContext`) so the decoder, runtime, README examples, and downstream callers remain compatible.

## Files, symbols, tests, and docs

### Primary implementation

- `ts/packages/public/infra/clinkr/src/app/command-definition.ts`
  - `ResultSchema`
  - `ResultOf`
  - callback variance helper(s)
  - result/output contract
  - context-free and contextful execution shapes
  - `ContextFreeCommandDefinition`
  - `ContextfulCommandDefinition`
  - `ClinkrCommandDefinition`
  - both `defineCommand` overloads and their implementation signature

### Compile-time acceptance coverage

- `ts/packages/public/infra/clinkr/test/type/command-definition-types.ts`
  - existing renderer/result coupling cases;
  - bodyless inference;
  - context discrimination;
  - renderer parameter narrowing;
  - broad runtime storage assignability to add explicitly.
- `ts/packages/public/infra/clinkr/test/type/readme-examples/14-confirmation.ts`
  - direct bodyless `ContextfulCommandDefinition<Context, Schema, undefined>` compatibility.
- `ts/packages/public/sdk/test/type/sdk-types.ts`
  - SDK schema, handler, and renderer inference and mismatch diagnostics.

### Downstream compatibility anchors

- `ts/packages/public/sdk/src/sdk/command.ts`
- `ts/packages/public/sdk/src/sdk/clinkr-command-adapter.ts`
- `ts/packages/public/infra/clinkr/src/app/index.ts`
- `ts/packages/public/infra/clinkr/src/app/app.ts`
- `ts/packages/public/infra/clinkr/src/app/completion.ts`
- `ts/packages/public/infra/clinkr/src/app/programmatic-source.ts`
- `ts/packages/public/infra/clinkr/src/app/selected-command.ts`

These should require no semantic changes. A downstream edit is justified only if the new composition exposes a real compatibility issue; do not paper over a broken type design with casts or widened callback types.

### Documentation

No user-visible renderer semantics change, so the README draft, SDK context, and CLI-design checklist updated by `b9a7e21fa` should remain unchanged. If implementation comments describe the old hierarchy rather than enduring inference or variance reasons, update those comments locally. Do not add public documentation for private composition helpers.

## Implementation steps

### 1. Establish a type-only baseline

Before editing the hierarchy, run the current compile/type checks relevant to Clinkr and SDK and confirm the branch is clean at `b9a7e21fa`.

Record the existing compile-only acceptance cases in `command-definition-types.ts`. Add narrowly scoped cases before the refactor if any of these behaviors are not explicit:

- a schema-specific context-free data-bearing definition is assignable to `ClinkrCommandDefinition`;
- a schema-specific contextful data-bearing definition is assignable to `ClinkrCommandDefinition<Context>`;
- bodyless context-free and contextful definitions are assignable to the broad runtime type;
- an explicit `requiresContext: false` structured definition is a compile error;
- omitted `requiresContext` remains accepted for context-free definitions;
- `requiresContext: true` remains required for a two-argument contextful handler.

Keep `@ts-expect-error` annotations on the narrowest line that expresses the violated contract, and verify they are consumed.

### 2. Spike the conditional result contract in place

In `command-definition.ts`:

- retain `ResultSchema`, `ResultOf`, and `HandlerResult` semantics;
- replace repeated inline bivariance-hack object types with one private, clearly named generic bivariant callback helper if TypeScript accepts it without reducing contextual typing;
- replace `DataBearingCommandDefinition` and `BodylessCommandDefinition` with one distributive `CommandResultContract<TResultSchema>`;
- keep a small shared schema base;
- keep two direct execution interfaces;
- change the context-free discriminant to `requiresContext?: never`.

The conditional must distribute when `TResultSchema` is `z.ZodType | undefined`. Do not tuple-wrap the check (`[T] extends [z.ZodType]`), because that would classify the broad union as bodyless rather than produce both result-policy arms.

### 3. Simplify public definitions while preserving compatibility

Express each public definition type as the intersection of:

- shared schema base;
- `CommandResultContract<TResultSchema>`;
- its direct execution interface.

Preserve exported names, defaults, and generic order exactly. Verify direct annotations in the README fixture and SDK continue to compile unchanged.

Attempt to express broad storage as the natural two context arms:

```ts
type ClinkrCommandDefinition<TContext = never> =
  | ContextFreeCommandDefinition
  | ContextfulCommandDefinition<TContext>;
```

Accept that form only if all four concrete cases remain assignable and runtime consumers can narrow/invoke definitions without casts or loss of safety. If TypeScript’s conditional/default behavior makes the two-arm form unstable, keep the broad storage union explicitly specialized by `z.ZodType` and `undefined`. The success criterion is removal of duplicated authoring hierarchy, not forcing the broad erasure seam into a falsely minimal spelling.

### 4. Prove direct overload inference before deleting input helpers

Keep exactly two `defineCommand` overloads. First try each overload directly against its corresponding public definition type with `TResultSchema = undefined` as the default.

The following must continue to work without explicit generic arguments:

```ts
defineCommand({
  schema: requestSchema,
  handler: async () => ok(),
});
```

The following must fail:

```ts
defineCommand({
  schema: requestSchema,
  handler: async () => ok("unexpected"),
});
```

Also preserve inference from `resultSchema` into both the handler success payload and renderer result parameter.

If direct overload parameters allow handler-return inference to widen or infer `TResultSchema` despite an omitted schema, do not restore separate context-free and contextful output unions. Instead introduce the smallest shared private authoring helper that pins the bodyless branch to `undefined`, and compose that helper with each execution mode. Keep result policy centralized in one place. Explain with a concise comment why the input helper exists; describe the inference constraint, not the old implementation history.

### 5. Preserve the broad runtime and variance seam honestly

Verify `ClinkrCommandDefinition<TContext>` remains usable by:

- JSON Schema generation;
- completion surface construction;
- programmatic definition loaders;
- selected-command decoding;
- app execution and rendering.

Do not use `as unknown as`, weaken renderer inputs to `unknown`, make required members optional, or add casts to downstream consumers. Preserve callback bivariance only where needed for generic erasure into broad storage, and document that reason if the generic helper’s purpose is not evident.

The SDK identity adapter should remain an identity function. Do not re-run an already-typed SDK definition through overloaded Clinkr `defineCommand`; that previously produced ambiguous inference and adds no runtime behavior.

### 6. Align and verify the context-free discriminant

Use `requiresContext?: never` only on structured context-free command definitions. Do not change app configuration types or raw-command contracts as part of this plan.

Retain integration fixtures that deliberately return `requiresContext: false`; they prove the runtime decoder rejects malformed dynamically loaded modules. Add or retain the compile-only structured-definition case proving that ordinary typed authors cannot construct the same invalid state.

### 7. Remove obsolete hierarchy and inspect emitted declarations

Delete aliases made obsolete by the conditional composition. There should be no separate per-context copies of the data-bearing/bodyless union unless a demonstrated TypeScript inference constraint requires a shared authoring seam.

Run declaration/type inspection through the normal compiler and, if useful, inspect generated or editor-visible type expansions to ensure exported types remain intelligible. Prefer named private helpers over enormous repeated conditional expansions, but do not export helpers merely to beautify declaration output.

Search for stale old helper names and direct definition uses after the refactor.

## Execution strategy

This is a semantic TypeScript type refactor concentrated in one implementation file plus focused compile-only tests. Use precise manual edits after reading the affected type block; do not use a broad text-replacement script or codemod. The downstream files are compatibility anchors, not a same-shape migration set, and should normally remain untouched.

If the implementation unexpectedly requires equivalent edits across five or more caller files, stop and reassess the proposed type interface rather than launching a bulk refactor: widespread caller churn would contradict the compatibility decision. Finish with bounded `rg` checks for obsolete helper names, direct type consumers, and explicit structured `requiresContext: false` occurrences.

## Validation guidance

Run focused checks during the spike, then repository gates after the final shape settles:

1. Native TypeScript workspace check:
   - `pnpm --dir ts exec tsc --noEmit --pretty false`
2. Focused Clinkr tests:
   - `pnpm --dir ts --filter @nseng-ai/clinkr test`
3. Focused SDK tests/type consumers as supported by workspace scripts.
4. TypeScript style guard because this changes type architecture:
   - `just ts-test-typescript-style-guard`
5. Full repository validation:
   - `just`

If formatting fails, use the repository autofixer (`just ts-format-fix`) and rerun checks. Do not hand-format generated formatter output.

Validation must specifically demonstrate:

- data-bearing definitions require `renderHuman`;
- bodyless definitions forbid both renderers;
- renderer input is `z.output<TResultSchema>`, including discriminated-union narrowing;
- handler success data matches the result schema;
- bodyless `ok()` inference works without type arguments;
- bodyless `ok(data)` is rejected;
- context-free callbacks receive one argument and omit `requiresContext`;
- contextful callbacks receive context plus request and require `requiresContext: true`;
- narrow definitions remain assignable to broad runtime storage;
- SDK definition types and the direct README fixture compile unchanged;
- malformed filesystem modules using explicit `requiresContext: false` remain rejected at runtime.

## Risks, assumptions, and open questions

### Risks

- **Conditional inference regression:** TypeScript may infer the result-schema generic through handler returns rather than the `resultSchema` property. Mitigate with acceptance tests and, only if demonstrated, one shared private authoring helper.
- **Distributivity mistake:** A non-distributive conditional would erase the data-bearing arm from broad defaults. Keep the naked type parameter in the conditional and test all four concrete combinations.
- **Variance regression:** Replacing the current bivariance hack with ordinary function properties can make narrow definitions incompatible with broad storage. Preserve a narrow, named bivariance seam.
- **Diagnostic degradation:** Conditional types can produce `never`-heavy diagnostics. Compare failing call sites while spiking. If diagnostics materially worsen, prefer a small named helper or explicit broad specialization rather than layering context-mode conditional machinery.
- **False minimalism:** A two-arm `ClinkrCommandDefinition` spelling is desirable but optional. Do not trade correctness or readable runtime consumption for fewer displayed union arms.
- **Public declaration churn:** Even source-compatible aliases can expand differently in generated declarations. Inspect the exported surface and keep stable public names/generic order.

### Assumptions

- Breaking renderer semantics are already intentionally accepted and implemented by `b9a7e21fa`; this plan does not revisit them.
- No valid structured command relies on explicit `requiresContext: false`; current matches outside malformed fixtures are app-internal configuration states.
- Existing exported definition aliases are legitimate expert/composition seams, so this change makes the factory primary without removing those aliases.
- No documentation update is needed unless implementation reveals prose that describes the old internal hierarchy.

### Open questions delegated to implementation evidence

These are not user-visible requirement decisions and should be resolved by the type spike:

- Can direct overload parameters replace both inference-only input aliases while preserving bodyless inference?
- Can broad storage safely use two context arms, or must it retain explicit result-schema specializations?
- Does a generic bivariant callback helper preserve contextual typing as well as the current inline hack?

Choose the simplest shape that passes the acceptance cases with readable diagnostics; record a concise code comment only for machinery that remains because TypeScript requires it.

## Review and remediation

Before declaring the change complete, review the final diff against these questions:

1. Is result policy defined in one place, or did data-bearing/bodyless composition get duplicated again per context mode?
2. Are context-free and contextful execution kept direct and readable rather than hidden behind conditional callback tuples?
3. Did the change preserve exactly two `defineCommand` overloads and all current exported names/generic order?
4. Is `defineCommand` still the easiest ordinary author path while SDK/composition type consumers remain supported?
5. Does the static context-free discriminant now match runtime omission-only behavior without altering raw commands or app options?
6. Are all casts, widened callbacks, newly optional fields, or downstream workarounds absent?
7. Do compile-only tests prove both authoring inference and broad runtime assignability?
8. Did runtime renderer enforcement and malformed-module diagnostics remain unchanged?

If review finds a regression:

- inference failure → add one shared, private authoring helper that pins the bodyless result to `undefined`;
- broad-storage assignability failure → retain explicit broad result specializations and the bivariant callback seam;
- poor diagnostics → introduce named private result arms beneath the single conditional contract, but do not recreate per-context unions;
- widespread SDK/caller edits → revert those edits and redesign the compatibility alias rather than accepting interface leakage;
- runtime behavior diff → restore the runtime files to `b9a7e21fa` behavior and keep this change type-only.

The final diff should be small, centered on `command-definition.ts` and compile-only acceptance tests, with no release, commit, push, or publication action unless separately requested.