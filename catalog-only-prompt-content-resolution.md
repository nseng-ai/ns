# Simplify Prompt Content Environment-Source Resolution

## Goal and outcome

Remediate the retained thermo-nuclear code-quality finding on the current branch by making the Point Catalog the sole authority for whether an environment prompt override is selected.

After this change:

- `resolvePromptPointContent()` acquires content for every non-missing source returned by `resolvePromptPointSource()`, including environment sources.
- Environment paths preserve the existing behavior: `resolve(repoRoot, source.path)` makes relative paths repository-relative and leaves absolute paths absolute.
- The SDK no longer exposes a second `PromptPointEnvPathPolicy` mode or an `unsupported-source` failure that contradicts catalog selection.
- Flow PR-inventory and submit-check-recovery presentation code no longer handle outcomes made impossible by their own catalog construction.
- Existing prompt precedence, provenance, content preservation, missing/unreadable/empty classification, and workflow-specific error presentation remain unchanged.

This is a focused structural remediation only. Do not reopen broader Point Catalog design, descriptor merging, gateway grouping, or source-model questions that the review’s adversarial challenge explicitly dropped.

## Context and discovered facts

The current branch centralizes prompt content acquisition in `@nseng-ai/sdk/project-config/prompt-content`. The thermo review found one surviving structural issue: environment-source legality is decided twice.

1. Catalog construction already controls environment selection through `promptEnvOverride` in `loadPointCatalog()`.
2. `resolvePromptPointContent()` then applies a second optional `envPathPolicy`, defaulting to rejection.

That second gate makes the shared result type incoherent for both current Flow consumers:

- PR inventory opts into an environment override while building its catalog and passes `envPathPolicy: "repo-relative"`; therefore its `unsupported-source` branch cannot occur.
- Submit-check recovery does not configure `promptEnvOverride`; therefore its post-success `source.type === "env"` rejection cannot occur.

The desired code-judo move is to delete the second policy mechanism rather than parameterize it further. Catalog source selection is policy; content acquisition should be the direct source → resolved path → one read → classified result pipeline described by the module header and `docs/guides/points.md`.

Relevant repository constraints:

- TypeScript is strict, strip-only, uses explicit `.ts` relative imports, and is validated with native TypeScript 7.
- Default tests must remain fake-driven; no new ambient module/process mutation is needed.
- The prompt-content API is an `internalWorkspaceExport`, not the public plugin API, and the project is private/unreleased, so the branch can simplify this new contract directly without compatibility scaffolding.
- No changed file crosses the 1,000-line review threshold.
- The focused pre-plan validation passed: 74 relevant tests, `just ts-check`, `just ts-format-check`, and `git diff --check`. `just ts-lint` passed apart from an unrelated existing warning in `pi-ns-herdr`.

## Files, symbols, tests, and documentation

### Primary implementation

- `ts/packages/public/sdk/src/project-config/prompt-content.ts`
  - `ResolvePromptPointContentResult`
  - `PromptPointEnvPathPolicy`
  - `resolvePromptPointContent()`
  - Environment-source path/provenance construction
- `ts/packages/incubating/extensions/flow/src/submit/pr-inventory.ts`
  - `resolvePrInventoryPrompt()`
  - `presentPrInventoryPromptResolution()`
- `ts/packages/incubating/extensions/flow/src/submit/submit-check-recovery.ts`
  - `FlowSubmitRecoveryPromptSource` / `FlowSubmitRecoveryPromptResult`
  - `resolveFlowSubmitRecoveryPrompt()`

### Tests

- `ts/packages/public/sdk/test/unit/project-config-prompt-content.test.ts`
  - Relative and absolute environment-source success cases
  - Removal of the default-rejection test and policy-specific test plumbing
  - Existing one-read and provenance assertions
- `ts/packages/incubating/extensions/flow/test/unit/pr-inventory.test.ts`
  - Existing absolute and cwd-relative environment override behavior
  - Existing missing selected environment prompt behavior
- `ts/packages/incubating/extensions/flow/test/unit/submit-check-recovery.test.ts`
  - Existing recovery source and failure presentation contract
- `ts/packages/public/sdk/test/integration/extension-point-descriptor-resolution.test.ts`
  - Existing real descriptor/default content-resolution coverage

### Documentation

- `docs/guides/points.md` already states that the catalog selects the active source and that `resolvePromptPointContent()` reads the selected source. It does not document `envPathPolicy` or `unsupported-source`; no prose change is expected unless implementation reveals stale wording.
- If comments in `prompt-content.ts` imply a content-layer source-legality policy, update them to state that catalog construction owns source eligibility and content acquisition handles the selected source exhaustively.

## Implementation steps

### 1. Collapse environment handling into the normal SDK acquisition path

In `project-config/prompt-content.ts`:

1. Delete the `unsupported-source` member from `ResolvePromptPointContentResult`.
2. Delete the exported `PromptPointEnvPathPolicy` type.
3. Remove `envPathPolicy` from the `resolvePromptPointContent()` request shape.
4. Replace the environment branch’s policy check with unconditional provenance construction:
   - `path: resolve(request.repoRoot, source.path)`
   - `label: \`env ${source.envVar}\``
5. Leave non-environment path resolution in `resolvePromptPointPath()` and retain all current read-result classification and factual messages.
6. Keep exact content preservation unchanged; consumers continue to own any default-only `trimEnd()` behavior.

Do not add separate environment-specific entrypoints, a generic mode parameter, casts, or a second catalog capability model. Those would move the same complexity rather than delete it.

### 2. Simplify SDK unit coverage around the single contract

In `project-config-prompt-content.test.ts`:

1. Remove the `PromptPointEnvPathPolicy` import and table/request fields.
2. Keep both environment success rows, but rename them to describe ordinary selected-source behavior rather than an “explicit repo-relative policy.”
3. Invoke `resolvePromptPointContent()` identically for default, configured, conventional, and environment sources.
4. Delete the test asserting that environment sources are rejected by default.
5. Retain assertions that:
   - a relative environment path resolves under `repoRoot`;
   - an absolute environment path remains absolute;
   - provenance records the environment source and stable `env <VAR>` label;
   - the reader is called exactly once;
   - missing-source, missing-file, unreadable, and empty outcomes remain classified as before.

This test structure should demonstrate the simpler invariant: once a catalog returns a source, acquisition attempts to read it.

### 3. Remove impossible PR-inventory result handling

In `flow/src/submit/pr-inventory.ts`:

1. Remove `envPathPolicy: "repo-relative"` from the SDK call.
2. Remove the `unsupported-source` case from `presentPrInventoryPromptResolution()`.
3. Preserve the existing Flow presentation model:
   - environment success maps to `{ type: "env", path: resolved.path }`;
   - descriptor default maps to `{ type: "builtin" }` and trims trailing whitespace;
   - ns.toml/conventional sources map to `{ type: "repo", path: resolved.path }`;
   - remaining SDK failures surface the SDK factual message and mapped source.
4. Do not alter `NS_FLOW_PR_INVENTORY_PROMPT`, its catalog override registration, CLI labeling, fallback behavior, or model execution.

Use the existing unit/scenario coverage as behavioral protection, especially cwd-relative and absolute environment paths and missing selected environment files.

### 4. Remove impossible recovery rejection without replacing it with a cast

In `flow/src/submit/submit-check-recovery.ts`:

1. Delete the post-success `source.type === "env"` rejection branch. Recovery catalog construction does not pass a prompt environment override, so it cannot select this source in supported composition.
2. Avoid forcing the generic SDK provenance back into a narrower duplicate source interface with a cast.
3. Prefer reusing the SDK’s resolved provenance type in `FlowSubmitRecoveryPromptResult` (or defining the Flow success source directly from that type) so the return statement can pass through `resolved.resolved` cleanly. This may broaden the compile-time provenance union to include `env`, but it removes the false runtime policy branch and keeps one source model; runtime eligibility remains owned by catalog construction.
4. Preserve Flow’s workflow-specific handling of `missing-source`, blocking diagnostics, default-only `trimEnd()`, and all factual SDK read errors.
5. Update focused test expectations only if the success result now reuses the SDK provenance object structurally; do not change user-visible messages or supported recovery behavior.

The important boundary is no cast and no replacement special case. If the type shape resists direct reuse, simplify the Flow-specific source wrapper rather than reintroducing source-policy logic.

### 5. Perform a stale-concept sweep and inspect the resulting diff

Run a bounded search for all deleted concepts and messages:

```bash
rg -n --glob '!*.map' --max-columns 300 --max-columns-preview \
  'envPathPolicy|PromptPointEnvPathPolicy|unsupported-source|environment prompt overrides are not supported|Environment prompt overrides are not supported' \
  docs ts/packages/public/sdk ts/packages/incubating/extensions/flow | head -n 200
```

Expected result: no references associated with the removed content-layer policy. Separately inspect all `resolvePromptPointContent(` call sites to verify they use the single request contract and that branch-context behavior is unchanged.

Review the final diff for:

- fewer result variants and branches;
- no casts or widened optionality added to compensate for the refactor;
- no duplicated environment path resolution in consumers;
- no accidental change to catalog precedence or prompt content normalization.

## Refactor execution strategy

This is a same-concept API refactor across four primary code/test files, with semantic edits rather than a broad mechanical rename. Use precise edits after reading each affected block; do not use an opaque `text.replace()` script. No repository codemod is warranted for this small surface.

The executor should update the SDK contract first, let TypeScript identify affected consumers, then make the two Flow simplifications and unit-test changes. Finish with the required stale-concept grep above. If implementation unexpectedly expands beyond these four primary files, stop and reassess rather than broadening the remediation opportunistically.

## Validation guidance

Run focused tests first:

```bash
pnpm --dir ts exec vitest run --config vitest.config.ts \
  packages/public/sdk/test/unit/project-config-prompt-content.test.ts \
  packages/public/sdk/test/integration/extension-point-descriptor-resolution.test.ts \
  packages/incubating/extensions/flow/test/unit/pr-inventory.test.ts \
  packages/incubating/extensions/flow/test/unit/submit-check-recovery.test.ts \
  packages/incubating/hosts/pi/extensions/pi-ns-flow/test/extension.test.ts \
  packages/incubating/hosts/pi/extensions/pi-ns-branch-context/test/enriched-plan-commands.test.ts
```

Then run repository-standard TypeScript checks:

```bash
just ts-format-check
just ts-lint
just ts-check
just ts-test
just ts-test-integration
just ts-test-typescript-style-guard
```

Run `just ts-test-isolated` only if required by the repository’s final validation policy; this change should not add or modify isolated tests. Run `git diff --check` and the stale-concept grep before declaring completion. If formatting fails, use `just ts-format-fix`; if lint has autofixable failures, use `just ts-lint-fix`, then rerun the checks.

Behavioral assertions to preserve:

- Relative env paths resolve from the catalog root/cwd.
- Absolute env paths remain absolute.
- Missing env files preserve Node failure detail.
- Recovery continues to reject blocking catalog diagnostics and use descriptor/conventional/ns.toml sources as before.
- Empty and unreadable selected prompts remain factual typed failures.
- Default prompt content still receives consumer-owned trailing-whitespace normalization only where it did previously.

## Risks, assumptions, and open questions

### Risks

- Narrowing Flow’s recovery source type by hand may tempt a cast after the SDK becomes exhaustive. Avoid that; reuse SDK provenance or simplify the wrapper.
- Accidentally moving `trimEnd()` into the SDK would change content semantics for repository/environment prompts. Keep normalization consumer-owned.
- Removing the content-layer gate must not implicitly add an environment override to recovery. Recovery still omits `promptEnvOverride` during catalog construction.
- The branch is locally ahead/behind its remote, but this plan concerns the merged implementation diff only; do not mix stack/process cleanup into the code remediation.

### Assumptions

- Environment source eligibility remains explicitly opt-in at catalog construction through `promptEnvOverride`.
- `node:path.resolve(repoRoot, source.path)` is the intended established behavior for environment values: repository-relative for relative values and absolute-preserving for absolute values.
- Because the prompt-content export is a newly introduced internal workspace surface in private unreleased software, removing the policy type/result variant requires no deprecation layer.

### Open questions

None are material. If a new external consumer of `PromptPointEnvPathPolicy` appears after branch synchronization, inspect whether it truly needs a distinct source policy. Do not preserve the mode automatically; prefer moving eligibility to that consumer’s catalog construction, consistent with this plan.

## Review and remediation checklist

Before completion, perform a focused thermo-quality pass:

- Confirm the change deletes a policy mechanism rather than merely renaming it.
- Confirm the catalog is the only source-selection authority.
- Confirm every source selected by a catalog is handled by one acquisition path.
- Confirm no consumer handles `unsupported-source` or performs a second environment-legality check.
- Confirm no `as` cast, `unknown`, `any`, or optional compatibility field was introduced to bridge the simplified types.
- Confirm Flow-specific presentation remains in Flow while generic source/path/read/error facts remain in the SDK.
- Confirm tests describe supported behavior rather than institutionalizing impossible modes.
- Confirm documentation remains accurate; edit it only if the implementation makes current wording stale.
- Confirm the final diff remains tightly scoped to the retained review finding.
