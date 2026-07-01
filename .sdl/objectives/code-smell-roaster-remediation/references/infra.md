# ts/packages/infra -- code-smell findings

Source: automated code-smell-roaster sweep (see repo root `.sdl/reviews/code-smell-roaster.md`), adversarially verified. 29 confirmed finding(s) (4 high, 13 medium, 12 low).

Re-verify file paths and line numbers at pickup time -- the repo moves between the sweep and implementation.

## ts/packages/infra/brmem

1. **Duplicated Code** (high) -- `ts/packages/infra/brmem/src/operations/list.ts:51-63`
   - Roast: Three different commands independently re-derive 'is this a scoped namespace or all-namespaces scan' instead of asking one function, so the rule lives in three slightly-drifting copies.
   - Evidence: list.ts:51-63 has `if (request.base && request.namespace !== undefined) return failure("base-and-namespace-conflict", ...)` followed by `shouldListAllNamespaces = !request.base && request.namespace === undefined` and `scopeNamespace = request.base ? BASE_NAMESPACE : normalizeNamespaceOption(request.namespace)`; gc.ts:40-46 repeats the identical conflict check and ternary verbatim (renamed to shouldScanAllNamespaces), and copy.ts:58-68 repeats the same conflict check plus the same `request.base ? BASE_NAMESPACE : normalizeNamespaceOption(...)` ternary. Each file also separately defines its own `ALL_NAMESPACES_SCOPE = "all"` constant (list.ts:21, gc.ts:10).
   - Smallest fix: Extract a single `resolveNamespaceScope(request: { base: boolean; namespace?: string })` helper in ref-layout.ts (or shared.ts) that returns the conflict failure, the resolved scope namespace, and the all-namespaces flag/label, and call it from list.ts, gc.ts, and copy.ts.

2. **Data Clumps** (medium) -- `ts/packages/infra/brmem/src/gateway.ts:46-94`
   - Roast: The namespace/key/branch trio gets retyped as a fresh inline object literal in six different method signatures even though the file already has a named shape for exactly this trio sitting one import away.
   - Evidence: listEntries (47-51), getEntry (53-58), checkEntry (60-65), putEntry (76-81), createEntry (83-88), and deleteEntry (90-94) each spell out `{ namespace: string; key: string; branch: string; ... }` as a fresh anonymous object type instead of reusing `EntryRef` (namespace/key/branch/entryLocator) already imported from ref-layout.ts.
   - Smallest fix: Introduce a small `EntryCoordinate { namespace: string; key: string; branch: string }` type (or reuse `Omit<EntryRef, "entryLocator">`) and have each gateway method intersect it with its extra fields instead of re-declaring the triple inline.

3. **Duplicated Code** (medium) -- `ts/packages/infra/brmem/src/real-git-gateway.ts:599-643`
   - Roast: copySnapshot re-derives a value its own caller already computed, while copyWithGlob right next to it does the sane thing with the same parameter — pick one strategy and stop paying for git twice.
   - Evidence: copyEntries (574-583) already resolves destShaResult/destSha via `rev-parse --verify destRef` and passes `destSha` into copySnapshot as `options.destSha`. copySnapshot then ignores that and reruns `runGit(["rev-parse", "--verify", options.destRef])` at line 630 to recompute the exact same thing it was just handed — a pattern copyWithGlob (645-708) does not repeat, instead using `options.destSha` directly. The same 'load entries or default to empty map when no parent SHA' shape is also duplicated verbatim three times: writeEntrySnapshot (452-460), copySnapshot (615-623), copyWithGlob (661-669).
   - Smallest fix: Extract a private helper like `resolveSnapshotState(snapshotRef, branch)` that returns `{ sha, entries }` (entries defaulting to empty map when sha is unresolved) and have writeEntrySnapshot, copySnapshot, and copyWithGlob all call it instead of re-implementing the branch each time; have copySnapshot consume the destSha already passed in rather than re-querying git.

4. **Shotgun Surgery** (medium) -- `ts/packages/infra/brmem/src/validation.ts:48-49`
   - Roast: The ref-flattening separator is defined once as a named constant and then re-typed as a bare string literal in a different file — change the separator and validation quietly falls out of sync.
   - Evidence: ref-layout.ts:8 defines `export const FLAT_SEPARATOR = "---";` and uses it at ref-layout.ts:65 (`branch.replaceAll("/", FLAT_SEPARATOR)`); validation.ts:48-49 independently hardcodes the same value: `if (branch.includes("---")) return invalid("branch names containing '---' cannot be encoded into refs/brmem");`.
   - Smallest fix: Move the separator constant to a module both files can import without a cycle (or accept it as a parameter to validateBranchName) so the encoding rule and its validation can only ever change together.

5. **Duplicated Code** (low) -- `ts/packages/infra/brmem/src/contracts.ts:18-44`
   - Roast: brmemError and brmemOptionalError build the exact same BrmemErrorInfo by hand, twice, just to slap a different label on an identical-shaped wrapper.
   - Evidence: brmemError (18-26) and brmemOptionalError (36-44) both do `const error: BrmemErrorInfo = {code, message}; if (displayCommand !== undefined) error.displayCommand = displayCommand;` before returning `{type: "error", error}` — the only difference is the declared return type alias.
   - Smallest fix: Factor out a private `buildErrorInfo(code, message, displayCommand?)` and have both `brmemError` and `brmemOptionalError` call it, returning `{type: "error", error: buildErrorInfo(...)}`.

## ts/packages/infra/clinkr

1. **Repeated Switches** (high) -- `ts/packages/infra/clinkr/src/exit.ts:191-226`
   - Roast: The four-way ok/negative/failure/usageError fork gets re-litigated in a fresh switch every time someone needs to know what a ClinkrExit means, so the union's meaning lives in three unsynchronized copies instead of one.
   - Evidence: exit.ts defines exitCodeForExit() (191-202) and toMachineEnvelope() (204-226), both switching on exit.type with the same ok/negative/failure/usageError cases and the same 0/1/2/2 exit-code mapping; emit.ts's emitExit() (49-65) switches on exit.type a third time with the identical case set and exit codes (ok->0, negative->1, failure->2, usageError->2).
   - Smallest fix: Collapse the exit-code mapping into one lookup (e.g. a `EXIT_CODE_BY_TYPE` table or a single `exitCodeForExit` that emitExit and toMachineEnvelope both call) so a new ClinkrExit variant only requires editing the case list once.

2. **Duplicated Code** (medium) -- `ts/packages/infra/clinkr/src/completion.ts:299-334`
   - Roast: Three near-identical 'is this an enum, filter its values by prefix, wrap as a candidate' blocks sit a few lines apart, so a future tweak to enum-value matching (case-insensitivity, fuzzy match, whatever) has three silent landmines to step on instead of one.
   - Evidence: optionEqualsValueCandidates (299-312), optionValueCandidates (314-322), and positionalValueCandidates (324-334) each independently do: guard `kind.type !== "enum"`, then `.filter((value) => value.startsWith(prefix))`, then map to a candidate object differing only in the value/type fields.
   - Smallest fix: Extract a shared `enumValueCandidates(kind, prefix, type, toValue?)` helper that does the guard/filter/map once, and have all three call sites build their candidate shape from it.

3. **Speculative Generality** (low) -- `ts/packages/infra/clinkr/src/exit.ts:115-146`
   - Roast: buildFailureMachineEnvelopeSchema offers four independent override knobs as if every caller needs to redefine status/exitCode/errorType/message validation, but in the whole repo exactly one caller ever touches one of them.
   - Evidence: BuildFailureMachineEnvelopeSchemaOptions exposes statusSchema, exitCodeSchema, errorTypeSchema, and messageSchema (115-120); a repo-wide grep for buildFailureMachineEnvelopeSchema shows the only real caller (ts/packages/roaster/src/findings-publication.ts:47) and the package's own test only ever pass `errorTypeSchema`.
   - Smallest fix: Drop statusSchema/exitCodeSchema/messageSchema until a caller actually needs them; keep a narrower `buildFailureMachineEnvelopeSchema(errorTypeSchema?)` and reintroduce the rest only when a real use shows up.

## ts/packages/infra/git

1. **Duplicated Code** (high) -- `ts/packages/infra/git/src/index.ts:61-85, 179-203, 205-237, 286-301, 303-324, 365-388`
   - Roast: Every single RealGitGateway method hand-rolls the identical run-then-check-code-then-build-a-formatCommandFailure-error ritual, so this class is really one pattern copy-pasted nine times wearing different git verbs.
   - Evidence: repoRoot, headCommit, gitPath, hasUncommittedChangesUnder, listLocalBranchTips, and changedPathsUnder each repeat: `const run = await this.runGit(...); if (!run.ok) return run; if (run.value.result.code !== 0 || run.value.result.killed) { return error(CODE, formatCommandFailure(TITLE, run.value.displayCommand, run.value.result), run.value.displayCommand); }`
   - Smallest fix: Extract a private helper (e.g. `runGitExpectingSuccess(params, args, { code, title })`) that performs the run + ok/code/killed check + error construction once, returning `GitResult<ExecResult>`; have each public method call it and only handle its own stdout-parsing step.

2. **Primitive Obsession** (medium) -- `ts/packages/infra/git/src/contract.ts:8-12`
   - Roast: GitErrorInfo.code is just `string`, so nothing stops every call site from inventing its own naming convention -- and they did, producing a junk drawer of snake_case and kebab-case codes nobody can grep reliably.
   - Evidence: index.ts mixes `"repo_root_failed"`, `"git_path_failed"`, `"git_branch_tips_failed"` (snake_case) with `"current-branch-failed"`, `"origin-url-killed"`, `"branch-ref-invalid"`, `"branch-presence-failed"` (kebab-case) for the same conceptual field.
   - Smallest fix: Define a string-literal union (or small enum) of GitErrorCode values in contract.ts and type GitErrorInfo.code against it so the compiler enforces one consistent vocabulary.

3. **Duplicated Code** (low) -- `ts/packages/infra/git/src/index.ts:434-449`
   - Roast: isMissingRevisionResult and isMissingTreeResult are the same 'sniff stdout+stderr for a known git error phrase' function copy-pasted twice, and the copy didn't even keep the concatenation order straight.
   - Evidence: isMissingRevisionResult builds `${result.stderr}\n${result.stdout}` while isMissingTreeResult builds `${result.stdout}\n${result.stderr}` right above it, then both do an `.includes(...)` substring scan.
   - Smallest fix: Factor out one `combinedOutput(result)` helper plus a shared `matchesAnyPhrase(output, phrases)` check, and call it with each function's distinct phrase list.

## ts/packages/infra/graphite

1. **Divergent Change** (high) -- `ts/packages/infra/graphite/src/status.ts:96-371`
   - Roast: This file can't decide if it's a worker-thread pool manager or a sqlite metadata reader, so every change to either concern forces you to wade through the other.
   - Evidence: The same module owns a global mutable worker-pool cache (`cachedGraphiteMetadataWorker`, `acquireGraphiteMetadataWorker`, `releaseGraphiteMetadataWorker`, `terminateGraphiteMetadataWorker`, lines 96-204 and 293-371) alongside the unrelated, purely synchronous `loadGraphiteMetadataStatus` DB-query/parsing logic (lines 228-291) and the wire-protocol (de)serializers (`graphiteMetadataWorkerRequestFromValue`, `isGraphiteMetadataStatus`, etc.).
   - Smallest fix: Split into two modules: one for the pure `loadGraphiteMetadataStatus` query/parse logic (already independently testable), and one for the worker-thread pooling/lifecycle/protocol plumbing that calls it.

2. **Duplicated Code** (medium) -- `ts/packages/infra/graphite/src/metadata.ts:299-380`
   - Roast: Two graph walks copy-paste the same row-missing/cycle/completed termination dance with only 'parent' swapped for 'first child', so any fix to cycle handling has to be made twice and will eventually only get made once.
   - Evidence: `walkGraphiteAncestors` (lines 299-337) and `walkFirstChildGraphiteDescendants` (lines 339-380) both maintain a `visited` set and repeat the identical row-missing / cycle / completed branching structure around a 'next node' lookup.
   - Smallest fix: Extract a shared single-path graph-walk kernel parameterized by a 'next node' selector (parent vs. first child) and have both functions call it.

3. **Duplicated Code** (low) -- `ts/packages/infra/graphite/src/stack.ts:122-143`
   - Roast: parentOf and childrenOf run the exact same 'call gt, sniff stderr for the string untracked branch' ritual, so the untracked-branch detection rule lives in two copies waiting to drift.
   - Evidence: Both methods repeat: `if (!result.isOk) { const failure = failureFromCommandResult(result); if (failure.message.toLowerCase().includes("untracked branch")) return { type: "untracked_branch", message: failure.message }; return { type: "failure", failure }; }`
   - Smallest fix: Extract a shared `classifyGtFailure(result)` helper that returns either an untracked-branch result or a failure, and call it from both `parentOf` and `childrenOf`.

## ts/packages/infra/cli-runtime

1. **Divergent Change** (medium) -- `ts/packages/infra/cli-runtime/src/index.ts:151-320`
   - Roast: index.ts can't decide whether it's a CLI bootstrapper, a generic try/catch-to-ClinkrExit adapter, or a package.json parser, so three unrelated kinds of change all land in the same file.
   - Evidence: defineCli/run/runIfMain (CLI bootstrapping, lines 178-259) sit alongside runClinkrCommand/runOperationCommand (a generic operation-to-ClinkrExit wrapper consumed by unrelated packages like plans and branch-context, lines 151-176) and readCliPackageMetadata plus four helper functions for package.json parsing/display (lines 261-320), all in one 320-line file.
   - Smallest fix: Split into focused modules (e.g. cli-entry.ts for defineCli/run/runIfMain, operation.ts for runClinkrCommand/runOperationCommand, package-metadata.ts for readCliPackageMetadata and its helpers) and have index.ts just re-export.

2. **Data Clumps** (low) -- `ts/packages/infra/cli-runtime/src/index.ts:41-60`
   - Roast: CliPrepareRunInput and CliRunErrorInput are the same six fields wearing two different hats, hand-assembled twice in run() instead of being built once.
   - Evidence: CliPrepareRunInput<TDeps> (args, deps, cwd, env, stdout, stderr, io, metadata) and CliRunErrorInput<TDeps> (error, args, deps, io, stdout, stderr, metadata) overlap on args/deps/io/stdout/stderr/metadata; run() reconstructs that overlapping group as two separate object literals at lines 213-222 and 230-238.
   - Smallest fix: Extract a shared CliInvocationContext<TDeps> = { args, deps, io, stdout, stderr, metadata } type that both interfaces compose, and build it once in run() before passing to prepareRun and handleRunError.

## ts/packages/infra/cli-theme

1. **Duplicated Code** (medium) -- `ts/packages/infra/cli-theme/src/text.ts:22-30`
   - Roast: The pad-styled-text-to-width algorithm is implemented twice with the sign flipped, so 'how do I pad a cell' has two different correct answers depending on which file you happen to be standing in.
   - Evidence: text.ts has `padPlain` (right-pad: `text + " ".repeat(width - text.length)`) and `padCell` (right-pad styled text via `colored + " ".repeat(gap)`); table.ts re-derives the identical shape mirrored for left-alignment with private `padLeftPlain` (`" ".repeat(width - text.length) + text`) and `padLeftStyled` (`" ".repeat(lead) + styled`).
   - Smallest fix: Collapse the four functions into one pad helper parameterized by alignment (e.g. `padPlain(text, width, align)` / `padStyled(styled, plain, width, align)`), exported once from text.ts and reused by table.ts.

2. **Duplicated Code** (low) -- `ts/packages/infra/cli-theme/src/result-block.ts:13-34`
   - Roast: Two interfaces describe the exact same result-block shape down to the field names, with the second just amputating `cwd` -- a copy-paste type instead of a derived one.
   - Evidence: `ResultBlockInput` is `{ kind, headline, body?, guidance?, cwd? }` and `DestructiveResultBlock` is `{ kind, headline, body?, guidance? }` -- an identical field-for-field restatement minus one optional property.
   - Smallest fix: Define `DestructiveResultBlock` as `Omit<ResultBlockInput, "cwd">` so the shared shape has one source of truth.

## ts/packages/infra/core

1. **Middle Man** (medium) -- `ts/packages/infra/core/src/command.ts:135-141`
   - Roast: Naming a pass-through after the thing it passes through to just doubles the API surface for zero behavior.
   - Evidence: export function isSuccessfulExecResult(result: ExecResult): boolean { return commandSucceeded(result); }
     export function commandSucceeded(result: ExecResult): boolean { return result.code === 0 && !result.killed; }
   - Smallest fix: Delete isSuccessfulExecResult and have every caller use commandSucceeded directly (or vice versa) so the predicate has exactly one name.

2. **Duplicated Code** (low) -- `ts/packages/infra/core/src/terminal-presentation.ts:100-102`
   - Roast: This file already imports from primitives.ts and then reinvents primitives.ts's own exported isRecord byte-for-byte instead of using it.
   - Evidence: function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); } — identical to the exported isRecord in primitives.ts:22-24, and re-duplicated again as isJsonRecord in runner-usage.ts:188-190
   - Smallest fix: Import isRecord from ./primitives.ts in terminal-presentation.ts and runner-usage.ts and delete the local copies.

3. **Duplicated Code** (low) -- `ts/packages/infra/core/src/text-truncation.ts:39-43`
   - Roast: Hand-unrolling a fixed-point computation three times in a row is a loop wearing a trenchcoat.
   - Evidence: let marker = input.buildMarker(0);
     let preservedChars = Math.max(0, input.maxChars - marker.length);
     marker = input.buildMarker(value.length - preservedChars);
     preservedChars = Math.max(0, input.maxChars - marker.length);
     marker = input.buildMarker(value.length - preservedChars);
   - Smallest fix: Extract a small `recomputeMarkerAndPreservedChars` helper (or a short converging loop) and call it instead of repeating the two-line marker/preservedChars pair three times.

## ts/packages/infra/github

1. **Data Clumps** (medium) -- `ts/packages/infra/github/src/pr-feedback/types.ts:94-96`
   - Roast: The (prNumber, threadId, cursorContext) trio is re-declared from scratch in five different interfaces across three files instead of being named once, so every new piece of failure context has to be threaded through every copy by hand.
   - Evidence: GithubPrFeedbackFailureDetails.{prNumber,threadId,cursorContext} (types.ts:94-96) is duplicated verbatim by FailureFromMessageOptions (failures.ts:22-24), GithubPrFeedbackFailureContextFields (failures.ts:55-57), GithubPrFeedbackFailureContext (parsing.ts:124-126) and requireCursor's inline context param (parsing.ts:144-146), plus RunGhParsedOptions (gateway.ts:68-70).
   - Smallest fix: Define one `GithubPrFeedbackCursorContext` (or similar) type for the trio and reuse it (via extension or composition) everywhere instead of repeating the three optional fields in each interface.

2. **Duplicated Code** (medium) -- `ts/packages/infra/github/src/pr-status.ts:210-271`
   - Roast: Three functions hand-build the same 12-field GithubStatusCheckEntry literal with `null` plugged into every field that doesn't apply, so adding or renaming a field means touching three carbon-copy object literals instead of one.
   - Evidence: normalizeGithubStatusCheck's CheckRun branch (217-231), its StatusContext branch (235-249), and unknownStatusCheckEntry (256-270) each construct the full { bucket, kind, name, workflowName, status, conclusion, state, startedAt, completedAt, createdAt, detailsUrl, targetUrl, identity } shape, repeating the same null defaults across all three.
   - Smallest fix: Build a single base entry with all fields defaulted to null, then spread the kind-specific overrides on top in each branch, or use a small factory `baseStatusCheckEntry(identity)` that all three call before overriding the few fields that differ.

3. **Duplicated Code** (low) -- `ts/packages/infra/github/src/identity.ts:12-21`
   - Roast: Two functions independently reinvent 'parse this as a URL, bail unless the host is github.com, split the pathname into parts' instead of sharing one helper.
   - Evidence: githubPrIdentityFromUrl (12-24) and githubRepositoryIdentityFromNormalizedRemoteUrl (49-57) both run `try { parsed = new URL(x) } catch { return undefined }`, then `if (parsed.hostname !== "github.com") return undefined`, then `parsed.pathname.split("/").filter(...)`.
   - Smallest fix: Extract a shared `githubUrlPathParts(url): string[] | undefined` helper that does the parse/host-check/split once, and have both functions call it.

## ts/packages/infra/test-kit

1. **Duplicated Code** (medium) -- `ts/packages/infra/test-kit/src/index.ts:71,76,94-96`
   - Roast: The exact same mkdtemp-then-realpath dance is typed out three separate times instead of once.
   - Evidence: Line 71: `await realpath(await mkdtemp(join(tmpdir(), prefix)))`; line 76: `await realpath(await mkdtemp(join(homedir(), prefix)))`; lines 94-96: `await realpath(await mkdtemp(join(tmpdir(), options.prefix ?? ...)))` — same shape, three sites.
   - Smallest fix: Extract a private `createRealTempDir(baseDir: string, prefix: string): Promise<string>` that wraps mkdtemp+realpath, and call it from makeTempDir, makeHomeTempDir, and withTempRepoSkill.

## ts/packages/infra/time

1. **Duplicated Code** (medium) -- `ts/packages/infra/time/src/testing.ts:121-156`
   - Roast: setTimeout and setInterval in ManualTimerSchedulerImpl are the same fifteen-line dance performed twice with the serial numbers filed off.
   - Evidence: Both methods: clamp/validate delayMs, build a ManualScheduledTimerState object differing only by `kind` (and `intervalMs`), push it via `this.options.pushTimer(timer)`, and return an identical `{ cancel() { timer.isCancelled = true; } }` closure.
   - Smallest fix: Extract a private `scheduleTimer(kind, normalizedDelayMs, callback, intervalMs?)` helper that builds, pushes, and returns the cancel handle, and have setTimeout/setInterval just compute their normalized delay and call it.

2. **Duplicated Code** (low) -- `ts/packages/infra/time/src/testing.ts:22-26,44-46,85-90`
   - Roast: createManualTimerHarness silently re-derives its own copy of createManualClock's mutable-time bookkeeping instead of reusing the function sitting eleven lines above it.
   - Evidence: createManualClock keeps `let currentMs = validateFiniteMs(startMs, "startMs")` and exposes `clock: { nowMs: () => currentMs }`; createManualTimerHarness independently keeps its own `let currentMs = validateFiniteMs(startMs, "startMs")` and builds the same `clock: { nowMs: () => currentMs }` literal inline rather than composing createManualClock.
   - Smallest fix: Have createManualTimerHarness call createManualClock(startMs) internally and drive currentMs through its setMs/advanceMs, exposing `clock` from that instance instead of re-declaring a parallel currentMs/clock pair.

## ts/packages/infra/exec

1. **Duplicated Code** (low) -- `ts/packages/infra/exec/src/testing.ts:49-55,113-119`
   - Roast: Two unrelated fakes both reinvent the exact same 'defensively clone the call log' incantation instead of sharing it.
   - Evidence: ScriptedCommandRunner.calls getter (lines 49-55) and ScriptedCommandExecApi.calls() method (lines 113-119) both do `this.callsInternal.map((call) => ({ command: call.command, args: [...call.args], ...optionalEntry(...) }))` — same shape, copy-pasted with field names swapped.
   - Smallest fix: Extract a small `cloneCall(call, optionalKey, optionalValue)` helper (or a generic `defensiveCallCopy`) and have both classes call it.

2. **Duplicated Code** (low) -- `ts/packages/infra/exec/src/testing.ts:131-136,154-166`
   - Roast: The file invents `optionalEntry` to avoid manual conditional-spread boilerplate, then immediately hand-rolls that exact boilerplate twice more right next to it.
   - Evidence: DroppingOptionsCommandExecApi's constructor uses `...optionalEntry("shouldDropEnv", ...)` then falls back to a raw `...(x === undefined ? {} : { x })` ternary for shouldDropStdin; copyExecOptionsWithout repeats the same mix of optionalEntry calls and raw ternaries (timeoutKillGraceMs, stdin) for fields that are conceptually identical.
   - Smallest fix: Use `optionalEntry` consistently for every conditional field in both spots (or extend it to cover the boolean-flag case) so there's one idiom, not two.
