## Completion instructions
After you finish the implementation:
1. Create or update the branch commit using the repo's normal workflow.
2. Then run `!ns flow submit`.

## Launch context
This branch was created from the existing local Graphite trunk and is intentionally unrelated to the caller's current stack.

Implement a TypeScript standards update covering **scoped resource ownership**.

## Goal

Add a generalized guideline that catches code which models a lexically scoped resource as mutable optional state solely to make cleanup possible:

```ts
let file: FileHandle | undefined;
try {
  file = await open(path);
  await use(file);
} finally {
  await file?.close();
}
```

The standard should prefer acquiring the resource as a `const` inside the scope that owns its cleanup:

```ts
async function useOpenedFile(): Promise<void> {
  const file = await open(path);
  try {
    await use(file);
  } finally {
    await file.close();
  }
}
```

Call this principle **scoped resource ownership**, not RAII. It is RAII-adjacent, but ordinary TypeScript `try/finally` cleanup is explicit rather than destructor-driven.

## Repository and branch context

- Source branch: `publish-saved-plans-through-hidden-cli`
- Relevant completed commit: `3f1bd6ea4` — `[cp] Nest saved plan directory metadata`
- That commit also contains the motivating resource-lifecycle cleanup:
  - `ts/packages/incubating/extensions/plans/src/plan-store-gateway.ts`
  - `RealPlanStoreGateway.writeFileExclusive()`
  - It uses an inner `writeAndClose()` function so the successfully acquired file handle is a `const` and is closed in an immediate `finally`.
- Treat the destination Slot’s cwd and branch state as authoritative. Verify whether `3f1bd6ea4` is present before using it as an example.
- Do not modify the plans implementation as part of this task unless needed to correct a factual documentation example.

## Required repository orientation

This task edits a first-party skill/standard. Before editing:

1. Read root `AGENTS.md`.
2. Run `ns objective exec load-orientations --format md`.
3. Read:
   - `docs/conventions/skill-conventions.md`
   - `skills/README.md`
   - `.agents/skills/typescript-style/SKILL.md`
   - the complete relevant TypeScript-style source documents, especially `core-rules.md` and `checklist.md`
4. Resolve the canonical nested source for the `typescript-style` skill using `skills/README.md`. Do not assume the flat `.agents/skills/typescript-style/` overlay is the authoritative edit location.
5. If generated overlays or metadata must be refreshed, use the repository-owned workflow documented by the skill conventions rather than editing generated artifacts independently.

## Guideline semantics

Add a concise normative rule along these lines:

> **Scope resource ownership after acquisition.** Bind an acquired resource as `const` inside the lexical scope that owns its cleanup. Prefer immediate `try/finally` cleanup around resource-dependent work over declaring a mutable optional resource before acquisition solely so an outer `finally` can conditionally release it. Use mutable optional lifecycle state only when the resource genuinely spans branches, retries, callbacks, or multiple lifecycle methods.

The final wording should preserve these distinctions:

- The smell is the combination of:
  - `let resource: T | undefined`
  - assignment from an acquisition operation inside `try`
  - optional cleanup such as `resource?.close()` in `finally`
- The problem is not `let` by itself. The avoidable structure invents a “not acquired yet” state and spreads ownership across a larger scope.
- Acquisition errors may need translation outside the owner scope.
- Once acquisition succeeds, use and cleanup should remain together.
- Cleanup must remain guaranteed if resource-dependent work throws.
- Mutable optional resource state is legitimate when the resource truly outlives one lexical operation.
- Do not claim TypeScript `try/finally` is strict RAII.
- `using`/`await using` may be mentioned only if the existing standards support it and repository runtime/compiler constraints have been verified. Do not make it the default based on assumption.

## Suggested examples

Include a small avoid/prefer pair if that matches the document’s established style.

Avoid:

```ts
let file: FileHandle | undefined;
try {
  file = await open(path);
  await write(file);
} finally {
  await file?.close();
}
```

Prefer:

```ts
await writeAndClose();

async function writeAndClose(): Promise<void> {
  const file = await open(path);
  try {
    await write(file);
  } finally {
    await file.close();
  }
}
```

The example does not need to use `FileHandle` if another generic resource type better matches existing standards.

## Placement and scope

Likely placement is the TypeScript-style section concerning functions, classes, state, or lifecycle coherence. Determine the best exact location from the canonical documents.

Also inspect the TypeScript-style checklist. Add a compact review question there if the checklist normally mirrors core rules, for example:

> Are acquired resources bound as `const` in the scope that guarantees their cleanup, rather than represented as mutable optional state solely for an outer `finally`?

Keep this a focused standards change. Do not introduce a new skill, broad resource-management abstraction, lint rule, or codemod unless repository conventions clearly require one.

## Verified facts

- The motivating implementation exists in `RealPlanStoreGateway.writeFileExclusive()`.
- The accepted terminology from the source discussion is “scoped resource ownership.”
- Explicit `try/finally` resource cleanup is not strict RAII.
- The desired rule must retain an exception for genuine long-lived lifecycle state.

## Assumptions to verify

- The canonical edit location for `typescript-style` is not necessarily the flat Harness Overlay.
- `core-rules.md` and `checklist.md` are likely the only documents requiring edits, but inspect cross-references and generated surfaces before deciding.
- No automated style guard currently enforces this pattern.
- No glossary or `CONTEXT.md` update should be necessary for a coding-standard-only change.

## Validation

Run the validation required by the skill conventions and the files touched. At minimum:

- Verify generated/overlay consistency using the documented skill workflow, if applicable.
- `just dprint-check`
- Any focused skill validation documented by `docs/conventions/skill-conventions.md` or `skills/README.md`
- `git diff --check`

If a formatter reports Markdown formatting problems, use the repository-prescribed formatter rather than manually fighting generated formatting. Report exactly what was changed, which source is authoritative, and which validations passed. Do not commit unless explicitly requested.