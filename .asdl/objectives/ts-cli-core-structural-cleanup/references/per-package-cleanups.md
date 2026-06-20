# Per-package cleanups: roaster, sdl, vibechk, packagechk, pr-address

Cross-cutting verdict for this group:

- **pr-address** is the model citizen (consumes `@asdl/core/{github-pr-feedback,
  git,exec,result,submit}`, reimplements nothing; cli.ts is pure wiring).
- **roaster** reimplements GitHub-JSON leaf helpers asdl-core owns (the one reuse
  regression — detailed in `cross-package-dedup.md` #4).
- **sdl/extension-discovery.ts** and **packagechk/claim-command.ts** carry the two
  biggest structural simplifications.
- git/exec/result reuse is clean across all five (verified, no reinvention of
  process-spawning).

## roaster

See `cross-package-dedup.md` #4 for the HIGH leaf-helper duplication +
divergent-id-policy finding and the MED `parseJson` reuse finding.

[LOW] cli.ts (135) is pure wiring; business logic correctly in
`operations/cli-operations.ts`. The `list`/`ls` alias duplicates four command
fields (`:52-67`) — could share a spec object. No action required.

## sdl

### [HIGH] extension-discovery.ts (531): duplicated dir-index block + over-built manifest layer

1. **Duplicated dir-index block.** `:152-175` — the `index.ts` and `index.js`
   handling are two near-identical 9-line blocks differing only in filename and
   the `existsSync` target. Loop over `["index.ts","index.js"]`, take the first
   that exists, single `commandForDirectEntry` call. Same push-or-diagnostic
   pattern repeats at `:131-139,155-163,166-174` — extract one
   `pushCommandResult(command, commands, diagnostics)` helper.
2. **`MANIFEST_COMMAND_FIELDS` table + `parseManifestCommandEntry` (`:37-76,
   443-486`) is a generic field-spec engine for a 4-field object.** The
   `ParsedManifestCommandEntryFields`/`ManifestCommandFieldSpec` types plus the
   `for (const field of MANIFEST_COMMAND_FIELDS)` reflective loop hide what is four
   `readNonEmptyString` reads with four diagnostics. A Zod schema at this boundary
   (the repo's stated preference) replaces the entire table + loop + the
   `commandForManifestEntry` field-by-field `undefined` reassembly (`:299-348`)
   with one `safeParse` + a mapping from issues to diagnostics. Keep
   `validateManifestEntryPath` (real filesystem/security logic) as-is. Deletes ~80
   lines + two interfaces.

[MED] `commandForManifestEntry` (`:327-348`) re-checks `name === undefined || ...`
after already collecting diagnostics, then rebuilds the object literal — the
after-effect of not using a schema; folds away with the Zod remedy.

[LOW] sdl/cli.ts:116-148 `runCli` runs catalog loading, diagnostic
classification, and command selection inline (delegates to
`extension-registry.ts` helpers, so logic isn't *implemented* here). Acceptable
given the dynamic-command-registration constraint; flagging only that this is the
one cli.ts in scope doing more than wiring.

## vibechk

### [HIGH] workflow.ts:executeRun (`:43-199`): mutable-`let` soup + duplicated error handling

Six mutable `let`s (`runnerResult`, `runnerError`, `diffPatch`, `resultBranch`,
`isBranchCreated`, `postRunError`) threaded through two try/catch blocks, with the
`if (error instanceof VibechkError) … else throw` block duplicated (`:104-112,
140-145`). The error-path diff write (`:147-152`) re-writes `diffPatch` which is
still `""` (the throw happened at `git.diffPatch()` on `:127`), so it writes an
empty file for no benefit. Remedy: extract `runRunner(...)→{result,error}` and
`capturePostRun(...)→{diffPatch,resultBranch,branchCreated,error}`; top-level body
becomes capture→run→capture→assemble→write→derive-exit. Removes the `let` soup,
the duplicated `instanceof` block, and the dead empty-diff write.

### [MED] cli.ts:normalizeRunsFormatArgs (`:248-265`) hand-rewrites argv

Brittle (only `runs`, only first token, re-implements `=`-splitting), exists
solely because the schema field is `outputFormat` not `format`. Rename the
field/flag to `format` (or declare a clinkr flag alias) and delete the function.

### [MED] boundary/type debris

- `models.ts:137` `remotes: parsed.git.remotes as Record<string, string>` —
  redundant cast; `z.record(z.string(), z.string())` already infers that type.
  Delete.
- `git.ts:19-24` defines a `GitProvenance` interface duplicate of `models.ts:13-18`,
  never imported. Delete.
- `runners.ts:18` `RunnerResult.artifacts: Record<string, unknown>` and `:73`
  `transcript: ""` are both structurally dead (artifacts always `{}` and read
  nowhere; transcript always empty, papered over by the `:114-119` fallback in
  workflow). Remove both fields and the fallback.

PASS (do not "fix"): `store.ts:writeBundle` temp-file+rename is atomic;
`check.ts` parallelizes registry checks via `Promise.all`; `git.ts` delegates to
`@asdl/core/git` and shells only for ops core lacks.

## packagechk

### [HIGH] claim-command.ts (341): ClaimPolicy/ClaimPlan is over-generalized for N=2

`:46-78,146-234` build a four-layer abstraction (`ClaimPolicy` interface →
`buildPypi/NpmClaimPolicy` factories → `prepare*ClaimPlan` returning a `ClaimPlan`
with an embedded `execute` closure → `execute*ClaimPlan`) to unify exactly two
registries that will be enumerated forever. The `noun: "project" | "package"`
field (`:59`) is a one-bit pypi/npm difference smuggled through the abstraction.
Remedy: collapse to two linear functions `runPypiClaim`/`runNpmClaim` sharing
small helpers (`confirmRealPublish`, precheck, dry-run renderer, temp-dir
write/cleanup envelope). Deletes ~5 interfaces + 2 factories, makes the publish
flow readable top-to-bottom. Biggest structural win in packagechk. (The
`REGISTRY_CHECKS` table in `registry-gateways.ts` is the *opposite* call and
correct at N=3 — keep it.)

[LOW] cli.ts (163) is wiring + small arg parsing
(`parseRegistryOptions`/`isRegistry`). `FakePackageRegistryGateway` ships in
`registry-gateways.ts` src (`:118-145`) — confirm it's reached only via a
test-support entry, not the runtime surface.

## pr-address — clean (no findings)

cli.ts (66) is pure wiring; `download-feedback.ts`, `primitive-commands.ts`,
`exec-operation.ts` consume asdl-core gateways and Result helpers correctly. The
`defineExecOperation`/`withRepoContextPrecondition` indirection
(`exec-operation.ts:103-139`) is justified — a real cross-cutting precondition
over 8 operations, not a pass-through. `json-input.ts` (193 lines of
source-resolution + Zod parsing) is cohesive and well-factored. No duplication of
roaster (different GitHub surface: GraphQL threads vs REST flat comments). Use as
the template for the other CLIs.
