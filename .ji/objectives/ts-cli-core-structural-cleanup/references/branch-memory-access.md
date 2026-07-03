# Branch-Memory access unification (B3 + B4)

The headline cross-package finding: two packages talk to the *same* Branch Memory
store (`refs/brmem/...` snapshot refs) through two completely different
integration stacks.

## The two paths [VERIFIED]

**handoff** depends on the in-process gateway:

- `handoff/src/context.ts:1` — `import { RealGitBrmemGateway, type BrmemGateway }
  from "@asdl/brmem"`.
- `handoff/src/context.ts:26` — `brmem: new RealGitBrmemGateway(cwd, execApi)`.
- `handoff/src/artifact-storage.ts:44-46,93-97,112-116` — typed calls:
  `deps.brmem.listEntries({ namespace, branch })`, `.checkEntry(...)`,
  `.deleteEntry(...)`. Structured `BrmemResult<T>`, no JSON.

**branch-context** shells out to the `brmem` CLI binary and re-parses the JSON
machine envelope:

- `branch-context/src/context.ts:21` — `brmem: new
  RealBranchContextBrmemGateway(commands)`.
- `branch-context/src/brmem-gateway.ts:8,13` — imports `runAvailableBrmemCommand`
  from `@asdl/core/brmem-cli`.
- `branch-context/src/brmem-gateway.ts:99-131,133-168,170-186` — builds
  `["list","--namespace",NS,"--branch",branch,"--format","json"]`, runs `brmem`
  via `runAvailableBrmemCommand` (`:192`), then hand-parses with
  `parseBrmemListEntries` / `parseBrmemGetContent` (`:203-274`), including a whole
  bespoke envelope/field-validation layer plus a re-implemented `expectedMismatches`
  (`:276-289`) and `malformedBrmemEnvelope` (`:295-299`).

## Why this matters

The `BrmemGateway` interface (`brmem/src/gateway.ts:39-95`) already exposes
exactly the operations branch-context needs: `listEntries`, `checkEntry`,
`putEntry`, `getEntry`, `deleteEntry` — all keyed by `{namespace,key,branch}`.
handoff consumes it directly. branch-context reinvents the same five operations
over a subprocess + JSON parsing + envelope validation. ~300 lines of
`brmem-gateway.ts` plus the consumption of `@asdl/core/brmem-cli`'s entire
shell-out/parse machinery (549 lines) exist only because branch-context chose
CLI-over-binary instead of the in-process gateway its sibling already uses.

The accidental-divergence signal: `from-plan`'s partial-failure handling
(`branch-context/src/branch-context-creation.ts:474-482`) special-cases
`brmem_unavailable` — a failure mode that *only exists because of the shell-out*.

## Remedy

Make branch-context depend on `@asdl/brmem`'s `BrmemGateway` (as handoff does).
Replace `RealBranchContextBrmemGateway` with a thin adapter over
`RealGitBrmemGateway`, or have branch-context consume `BrmemGateway` directly
(`BRANCH_CONTEXT_NAMESPACE` is just a namespace arg). This deletes
`brmem-gateway.ts`'s parsing half (`parseBrmemListEntries`,
`parseBrmemGetContent`, `parseListEntry`, the duplicated
`expectedMismatches`/`malformedBrmemEnvelope`) and removes branch-context's
dependency on `@asdl/core/brmem-cli`.

Combine with the brmem-cli candidate-framework collapse (see `asdl-core.md` #3):
once branch-context stops shelling out and the `ccc/worktree-status.ts:255`
duplicated loop is fixed, most of `@asdl/core/brmem-cli` becomes removable —
collapse `resolveBrmemCommandCandidates` + the candidate-iteration types to a
single `runBrmem(args, opts)` returning `completed | unavailable`.

## OPEN QUESTION — resolve before deleting the parse layer

Is the subprocess boundary deliberate? A plausible reason: branch-context must
invoke the *user-installed* `brmem` shim rather than link the library. This is
currently undocumented and reads as accidental. If a real reason exists, the
remedy flips to *documenting* it (a comment at `context.ts:21` /
`brmem-gateway.ts`) rather than collapsing. Decide this first.
