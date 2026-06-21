# Extension API Promotion Report

Reference document for the `sdl-extension-architecture` objective. Identifies the
recurring primitives across the project-local extension stack and ranks which to
promote into the public extension API by descending benefit/cost ratio. This is
the deliberate SDK-pressure promotion analysis the roadmap anticipates for the
`cp` / `regenerate-pr` / `submit` migration slices — it converts accumulated
duplication evidence into a concrete, ordered promotion backlog.

Status: analysis/recommendation. No SDK helper is promoted by this document.

---

## 1. Scope

The extension stack analyzed (one self-contained file per command under
`.sdl/extensions/`):

| Extension       | Lines           | How it obtains its primitives                          |
| --------------- | --------------- | ------------------------------------------------------ |
| `push`          | 112             | hand-inlined                                           |
| `cp`            | 720             | hand-inlined                                           |
| `regenerate-pr` | 1071            | hand-inlined                                           |
| `autobranch`    | 2196            | hand-inlined                                           |
| `submit`        | 3491            | **esbuild bundle** of `@sdl/core` + `@sdl/sdl` modules |
| `changes`       | (earlier slice) | hand-inlined                                           |

---

## 2. Root constraint (why the duplication exists)

`@sdl/sdl/sdk` is a **jiti virtual module** defined in
`ts/packages/sdl/src/sdk-module-loader.ts`. It binds exactly four runtime values:

```ts
const sdlSdkVirtualModule = { defineExtension, failed, ok, z };
```

A `.sdl/extensions/*.ts` file loads standalone, outside the workspace, so it
**physically cannot `import` from `@sdl/core`** — nor from any third-party
package (e.g. `@pierre/diffs`). Every extension author hits this wall and picks
one of two unsatisfying options:

- **Inline** (`cp` / `autobranch` / `regenerate-pr` / `push` / `changes`) —
  readable, but copy-paste that drifts.
- **Bundle** (`submit`) — reuses the real `@sdl/core`, but ships a 3491-line
  untyped esbuild artifact (embedded `// ts/packages/sdl-core/src/...` section
  markers, `mkdtemp3` / `join4` import renames, `/tmp/sdl-submit-extension-build/`
  header). Reusable but not understandable.

Crucially, the reusable primitives **already exist**:

- `ts/packages/sdl-core/` — `exec`, `result`, `managed-region`,
  `text-truncation`, `text-repair`, `temp-files`, `github-cli`,
  `graphite-metadata`, `git/`, `submit/*`, `primitives`, `time-format`,
  `terminal-escapes`, `text-table`.
- `ts/packages/sdl/src/` — the checkpoint subsystem: `checkpoint-flow.ts`,
  `checkpoint-message.ts`, `checkpoint.ts`, `pending-worktree.ts`,
  `text-generation.ts`.

The problem is **exposure, not existence**: extensions cannot reach these
modules, so they re-derive them.

---

## 3. Measured duplication

### 3.1 Checkpoint message subsystem (4 live copies)

~400 lines, **byte-identical** in `.sdl/extensions/cp.ts` and
`.sdl/extensions/autobranch.ts` (32 shared functions; the only difference is
`DEFAULT_CHECKPOINT_MODEL_REF` aliasing the same string literal). Verified via
direct diff of `validateCheckpointMessage` / `collectCheckpointIssues` /
`buildCheckpointDiffPromptSection`. Also present in
`ts/packages/sdl/src/checkpoint-*.ts` and bundled into `submit.ts`.

Includes: `loadPendingWorktreeSnapshot`, `prepareCheckpointMessage`,
`validateCheckpointMessage` + `collectCheckpointIssues` (the validate-and-repair
state machine), `buildCheckpointDiffPromptSection` + diff compaction
(`parseDiffFileSections`, `parseDiffHeaderPath`, `buildFileSectionCompactedDiff`,
`buildChangedPathList`, `buildHeadTailCompactedDiff`).

### 3.2 PR-description + managed-region subsystem (2 copies, huge)

**37 shared function names** between `.sdl/extensions/regenerate-pr.ts` and
`.sdl/extensions/submit.ts`. Also present in
`@sdl/core/{managed-region,text-truncation,text-repair,submit/pr-description}`.

Includes: `parseManagedRegion` / `replaceManagedRegion` /
`replaceMalformedManagedRegionFromBegin`, `formatManagedGeneratedRegion`,
`parseManagedGeneratedRegion`, `replaceOrInsertGeneratedRegion`,
`parseManagedRegionMetadata`, `extractManagedRegionBody`, `preparePrDescription`,
`buildPrDescriptionUserPrompt`, `validatePrDescription`,
`parsePrDescriptionOutput`, `filterLockfileSections`, `isLockfileDiffSection`,
`truncateDiff`, `resolvePrDescriptionPrompt`, `resolvePromptPath`,
`isReadableFile`, `hashPrDescriptionPrompt`, `formatCommitMessages`,
`selectPrDescriptionModelRef`.

### 3.3 Long tail (4-6 files each, all already in `@sdl/core`)

- **Exec evidence formatting** — `commandSucceeded`, `formatCommandDetails`,
  `formatCommandEvidence`, `formatCommand`, `formatShellArg`. All 6 files.
  (`@sdl/core/exec`.)
- **Git fact gathering** — `execGit`, `loadPendingWorktreeSnapshot`, the three
  `GIT_*_TIMEOUT_MS` constants. 4 files. (`@sdl/sdl/src/pending-worktree.ts`.)
- **Model-ref-from-env** — `selectCheckpointModelRef` /
  `selectPrDescriptionModelRef` / `firstEnvValue` / autobranch `resolveModelRef`.
  5 files.
- **Text utilities** — `truncateTextHead` / `truncateTextHeadTail`,
  `trimOuterBlankLines`, `stripOuterCodeFence`. 4 files.
  (`@sdl/core/{text-truncation,text-repair}`.)
- **Tiny helpers** — `isRecord`, `formatErrorMessage`, `sha256Digest`,
  `countOccurrences`, `Result` / `ok` / `err`, temp-file helpers
  (`withTemporaryFile` / `createCommitWithPreparedMessage`).
  (`@sdl/core/{primitives,result,temp-files}`.)

---

## 4. Architectural decision (prerequisite)

Nothing can be both reusable and readable until the reach mechanism is chosen.

- **Option A — Widen the virtual SDK.** Add curated re-exports to `sdk.ts` **and**
  the `sdlSdkVirtualModule` value-map in `sdk-module-loader.ts` (the two lists
  must stay in sync). Extensions then import primitives from `@sdl/sdl/sdk` and
  shrink to thin glue. One source of truth (`@sdl/core`), readable files, no build
  step. Cost: curate a public surface; keep the two loader lists in sync.
- **Option B — Standardize bundling** (submit's path for all). Author multi-file
  against `@sdl/core`, emit `.sdl/extensions/*.ts` as generated artifacts. Maximum
  reuse, but the checked-in files become unreadable generated blobs — directly
  failing the "easy to understand" goal; would need a `@generated` banner and a
  no-hand-edit rule.

**Recommendation: Option A.** The primitives already live in `@sdl/core`; the
missing piece is purely exposure. It is the only option where the checked-in
extension is both DRY and readable, and it matches the objective's command-first
SDK-promotion model. The remainder of this report assumes Option A.

---

## 5. Ranked promotion list (descending benefit/cost ratio)

**Scoring.** Benefit = duplication eliminated x correctness/clarity gained,
weighted by reach across the six extensions. Cost = public-surface curation +
API-stability risk + how much *policy* (prompts, model choice, GitHub coupling)
is frozen into the contract. Most candidates already exist in `@sdl/core`, so
implementation cost is near zero — cost is dominated by **surface design**.
One-time fixed cost (widening the virtual module + keeping `sdk.ts` and
`sdlSdkVirtualModule` in sync) is assigned to API #1.

| # | Proposed API                                                 | Reaches         | Benefit              | Cost     | B/C  |
| - | ------------------------------------------------------------ | --------------- | -------------------- | -------- | ---- |
| 1 | `commandSucceeded` + `formatCommandEvidence` (exec evidence) | 6/6             | High                 | Very low | high |
| 2 | `resolveModelRef(env, {names, default})`                     | 5/6             | Med                  | Trivial  | high |
| 3 | Text/util re-exports                                         | 5/6             | Med (broad, shallow) | Trivial  | high |
| 4 | `loadPendingWorktreeSnapshot` + `execGit` (git facts)        | 4/6             | High                 | Low      | high |
| 5 | `prepareCheckpointMessage` (checkpoint subsystem)            | 4/6             | Very high            | Medium   | mid  |
| 6 | `@sdl/core/managed-region` + `preparePrDescription`          | 2/6 (huge each) | High                 | Med-high | mid  |
| 7 | `@sdl/core/diff` (pierre-backed)                             | 4/6 (lossy use) | Med                  | High     | low  |

### #1 Exec evidence layer (B/C: highest)

```ts
function commandSucceeded(r: ExecResult): boolean;
function formatCommandEvidence(opts: {
  intro: string; command: string; cwd: string;
  result: ExecResult; guidance?: string;
}): string;
```

Source: `@sdl/core/exec`. Reaches all 6 files. Pure functions over the
already-public `ExecResult`, zero policy. Best breadth-to-surface ratio and the
safest first promotion, so it absorbs the one-time loader-widening cost.
`push.ts` shrinks 112 -> ~30 lines, proving the mechanism end-to-end.

### #2 `resolveModelRef(env, { names, default })` (B/C: high)

```ts
function resolveModelRef(
  env: Record<string, string | undefined>,
  opts: { names: readonly string[]; default: string },
): string;
```

Collapses `selectCheckpointModelRef` / `selectPrDescriptionModelRef` /
`firstEnvValue` / autobranch `resolveModelRef` into one env-fallback primitive
(primary env -> legacy env -> default). Trivial cost; pair with #1.

### #3 Text/util re-exports (B/C: high, but shallow)

Re-export existing `@sdl/core` symbols: `isRecord`, `sha256Digest`, `Result` /
`ok` / `err`, `truncateTextHeadTail`, `trimOuterBlankLines`,
`stripOuterCodeFence`, `withTemporaryFile`. **Watch the `ok` / `failed` name
collision** with the SDK command-result helpers — namespace under subpaths
(`@sdl/sdl/sdk/text`, `.../result`) rather than flattening, to avoid public
surface bloat.

### #4 Git facts (B/C: high)

```ts
function execGit(ctx: SdlContext, args: string[], timeoutMs: number): Promise<ExecResult>;
function loadPendingWorktreeSnapshot(
  ctx: SdlContext,
): Promise<Result<PendingWorktreeSnapshot, PendingWorktreeError>>;
```

Source: `@sdl/sdl/src/pending-worktree.ts`. Replaces the repeated "rev-parse
toplevel -> branch -> status -> diff, with typed failure" sequence. Only design
choice is exposing the `PendingWorktreeError` discriminated union as public.

### #5 Checkpoint subsystem (B/C: mid; highest absolute benefit)

```ts
function prepareCheckpointMessage(
  ctx: SdlContext,
  input: { status: string; diff: string; env: Record<string, string | undefined> },
): Promise<PreparedCheckpointMessage>;
// optionally: createCheckpointCommit(ctx, message)
```

Source: `@sdl/sdl/src/checkpoint-*.ts`. Collapses 4 live copies; `cp.ts` -> ~60
lines of glue, `autobranch.ts` loses its largest block. Mid B/C because the
surface is the most **policy-laden** (system prompt, validate-and-repair state
machine, bullet/subject rules, model selection) and carries the highest
API-stability risk. **Sequence it second** despite the mid ratio, because the
absolute payoff is the largest in the stack.

### #6 Managed-region + PR-description (B/C: mid)

Expose `@sdl/core/managed-region` (`parseManagedRegion` / `replaceManagedRegion`
/ `replaceMalformedManagedRegionFromBegin`) and the `preparePrDescription` flow
(`buildPrDescriptionUserPrompt`, `validatePrDescription`,
`filterLockfileSections`, `truncateDiff`, `resolvePrDescriptionPrompt`).
Largest pairwise duplication (37 functions) but only 2 consumers, and the
`<!-- sdl-pr-description -->` markers are a **durable external contract** in PR
bodies — heavier stability cost. Promote as a separately reviewed step.

### #7 `@sdl/core/diff` (pierre-backed) (B/C: lowest)

Lift roaster's `parseUnifiedDiff` wrapper (`ts/packages/roaster/src/diff-parsing.ts`,
backed by `@pierre/diffs`) down into a new `@sdl/core/diff` module; expose
`splitDiffByFile` / `summarizeDiff` / lockfile filtering. Real value is repo-wide
consolidation to **one** diff parser (today: pierre-in-roaster +
regex-in-extensions) and correctness on renames / copies / quoted paths that the
extensions' hand-rolled `parseDiffHeaderPath` regex mishandles. Lowest B/C: it is
net-new infrastructure plus a cross-package migration, and its largest beneficiary
(lossy prompt compaction) needs parse precision least. Do it as a refinement of
#5/#6, not standalone. See `docs/adr/0007-roaster-shared-diff-parser.md` and
`docs/roaster-pierre-diffs.md` for prior context.

---

## 6. Recommended cut line and sequencing

- **Promote #1-#5** — captures essentially all recurring, low-policy duplication
  plus the single biggest line win.
- **Treat #6 as a deliberate, separately reviewed promotion** (external marker
  contract).
- **Defer #7** until a promoted diff primitive needs it, then back that primitive
  with pierre.
- **Do not promote** autobranch's stash / Graphite-transaction recovery or
  submit's restack / preflight orchestration — command-specific control flow, not
  primitives. Promoting them would move complexity behind a worse seam.

**Sequencing (differs from pure ratio):** ship **#1 first** to pay the one-time
loader cost and prove the mechanism on `push.ts`; then jump to **#5** for the
largest absolute payoff (4 copies, ~1600 lines); then #2-#4; then #6.

---

## 7. `submit.ts` liability

`submit.ts` is a checked-in esbuild artifact: untyped, un-reviewable, and a fifth
copy of the checkpoint code. Under Option A it should be re-authored against the
widened SDK like the other extensions, retiring the bundle.

---

## 8. Proof-of-mechanism (smallest viable first step)

Promote #1 and convert `push.ts`:

1. Add `commandSucceeded` + `formatCommandEvidence` to `sdk.ts` (re-export from
   `@sdl/core/exec`).
2. Add the same symbols to `sdlSdkVirtualModule` in `sdk-module-loader.ts`.
3. Rewrite `.sdl/extensions/push.ts` to import them from `@sdl/sdl/sdk`,
   deleting its local `commandSucceeded` / `formatCommandEvidence` /
   `formatDirtyWorktreeMessage` / `formatOutput`.
4. Confirm via the existing `push-cli` scenario tests.

This exercises the entire loader-widening path (the only structurally novel part)
on the lowest-risk extension before any policy-laden primitive is promoted.
