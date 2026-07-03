# ts/packages/tools -- code-smell findings

Source: automated code-smell-roaster sweep (see repo root `.sdl/reviews/code-smell-roaster.md`), adversarially verified. 12 confirmed finding(s) (3 high, 7 medium, 2 low).

Re-verify file paths and line numbers at pickup time -- the repo moves between the sweep and implementation.

## ts/packages/tools/areg

1. **Repeated Switches** (high) -- `ts/packages/tools/areg/src/operations/project-mutations.ts:205-273`
   - Roast: Every operation type gets its own bespoke switch twice over, so the gateway dispatch table has been hand-copied instead of written once.
   - Evidence: preflightOperation (lines 205-237) and applyOperation (lines 239-273) both switch on operation.type and call near-identical pairs of ctx.project methods (preflightWriteTextFile/writeTextFile, preflightDeleteFile/deleteFile, preflightRemoveEmptyDir/removeEmptyDir), each rebuilding the same field mapping from operation.plan; the success-path if/else chain at lines 151-162 then re-discriminates the same operation.type a third time.
   - Smallest fix: Replace the parallel switches with a small per-type table mapping operation.type to {preflight, apply} gateway functions (and a result-classifier), so adding/changing an operation kind touches one map entry instead of three call sites.

2. **Duplicated Code** (medium) -- `ts/packages/tools/areg/src/fake-gateways.ts:687-698`
   - Roast: Two files independently invented the exact same 'all-missing AregCheckSkillInspection' object, so the shape's invariants now live in two places that quietly drift apart.
   - Evidence: `missingCheckSkill(name)` in fake-gateways.ts builds `{ name, skillsPath: missing, agentsPath: missing, claudePath: missing, localSkillMd: missing, remoteSkillMd: missing, openaiPolicy: missing }`; `missingSkillInspection(name)` in operations/check.ts (lines 515-526) builds the identical object field-for-field.
   - Smallest fix: Export one `missingCheckSkillInspection(name)` helper (e.g. from gateways.ts or a small shared module) and have both fake-gateways.ts and operations/check.ts call it instead of redefining the literal.

3. **Duplicated Code** (medium) -- `ts/packages/tools/areg/src/gateways/project-gateway.ts:229-296`
   - Roast: Three 'resolve a managed write target' functions do the exact same resolve-root -> resolve-allowed-path -> validate dance and differ only in which validator gets bolted on at the end.
   - Evidence: `resolveWriteTextFileTarget`, `resolveDeleteFileTarget`, and `resolveRemoveEmptyDirTarget` each open with `await resolveExistingDirectory(...)` then `resolveAllowedWriteTarget({ policy, projectRoot, relativePath, description })`, only the trailing validation call (`validateWriteTarget` / `validateSkillKindDeleteTarget` / `validateSkillKindRemoveDirTarget`) changes.
   - Smallest fix: Extract the shared root-resolve + allowed-target-resolve prefix into one helper that returns `{ projectRoot, target }` or an error, and have each of the three functions call it before applying their own final validator.

4. **Divergent Change** (medium) -- `ts/packages/tools/areg/src/operations/init.ts:284-641`
   - Roast: This module is simultaneously a TOML table editor, a markdown managed-block editor, a JSON settings stamper, and a bootstrap-skill installer, so four unrelated bugs all file their tickets against the same file.
   - Evidence: renderAregSection/replaceOrAppendAregSection/appendTomlSection/aregSectionStart/tomlSectionEnd/tomlTableName (lines 284-302, 609-641) implement a hand-rolled TOML table parser, while managedBlockBounds/appendBlock/claudeBlock/planManagedBlock (lines 304-335, 435-510) implement an unrelated markdown comment-block parser, alongside planSettings' JSON stub writer (558-590) and runInit's npx bootstrap orchestration (156-273), all in one operations file.
   - Smallest fix: Split into a sdl.toml-section module, a managed-markdown-block module, and keep runInit as the thin orchestrator that calls both plus the settings/npx steps.

5. **Middle Man** (low) -- `ts/packages/tools/areg/src/gateways/project-fs.ts:128-136`
   - Roast: validateWriteTarget exists purely to forward its arguments to validateTextWriteTarget one line down -- a function whose entire job is to have a different name.
   - Evidence: `export async function validateWriteTarget(options) { return await validateTextWriteTarget(options); }` immediately precedes `async function validateTextWriteTarget(options) { ... }`, which does all the real work with the identical parameter shape and return type.
   - Smallest fix: Delete the wrapper and rename `validateTextWriteTarget` itself to `validateWriteTarget`, exporting that directly.

6. **Duplicated Code** (low) -- `ts/packages/tools/areg/src/operations/project-agents.ts:51-60`
   - Roast: The 'agents must be a non-empty string list' validation loop was written twice instead of being factored once, so the two agent sources can quietly drift out of sync.
   - Evidence: parseSdlAregAgents (lines 51-60) and parseLegacyAregJsonAgents (lines 81-90) both iterate `agents`, reject non-string/blank entries with a near-identical error code+message shape, and push into a result array — the only real difference is the error code string.
   - Smallest fix: Extract a shared `validateNonEmptyStringList(agents, errorCode, pathLabel)` helper and call it from both parsers.

## ts/packages/tools/packagechk

1. **Duplicated Code** (high) -- `ts/packages/tools/packagechk/src/claim-npm-command.ts:34-123`
   - Roast: runNpmClaimCommand and runPypiClaimCommand are the same 90-line orchestration script copy-pasted with the registry name swapped, so 'shared' claim logic that already got a shared-helpers file still has to be edited twice for every real change.
   - Evidence: Diffing claim-npm-command.ts:34-123 against claim-pypi-command.ts:38-130 shows the validate->check->prepare->dry-run->tools-check->confirm->mkdtemp->write->execute->cleanup->report sequence is structurally identical line-for-line, differing only in string literals ("npm"/"pypi"), gateway field names, and one extra lookup-name stderr line in the pypi version.
   - Smallest fix: Extract a single generic runClaimCommand(options) in claim-command-shared.ts parameterized by registry, registryLabel, prepareProject(), and executeClaimProject(), and have claim-npm-command.ts/claim-pypi-command.ts supply only the registry-specific bits (prepare/execute closures).

2. **Primitive Obsession** (medium) -- `ts/packages/tools/packagechk/src/claim-command-shared.ts:71`
   - Roast: The package URL is smuggled inside a pre-formatted human-readable string ('npm URL: https://...') and then ripped back out with a regex, turning a plain data field into a fragile text-parsing puzzle.
   - Evidence: claimDryRunResult does `url: dryRun.urlLine.replace(/^[^:]+ URL: /u, "")`, recovering the URL from `urlLine: \`npm URL: ${packageUrl}\``(claim-npm-command.ts:147) /`urlLine: \`PyPI URL: ${projectUrl}\`` (claim-pypi-command.ts:157) instead of the URL ever being passed as its own field.
   - Smallest fix: Add a `url: string` field to ClaimDryRunData alongside (or instead of) `urlLine`, set it directly from packageUrl/projectUrl, and have renderClaimDryRun format the display line from `url` rather than encoding the URL inside the display string for later regex extraction.

3. **Repeated Switches** (medium) -- `ts/packages/tools/packagechk/src/models.ts:105-108`
   - Roast: CheckStatus gets re-branched in three separate files (exit-code mapping, human rendering, claim precheck), so adding a new status means hunting down every if-cascade and hoping you found them all.
   - Evidence: models.ts:105-108 tests statuses.has("invalid"/"error"/"taken") for exit codes, output.ts:22-30 re-tests result.status === "available"/"taken"/else for rendering, and claim-command-shared.ts:24-48 re-tests result.status === "taken"/"invalid"/"error" for CLI exit construction — three independent cascades over the same four-value union.
   - Smallest fix: Replace the three ad hoc cascades with one status-keyed table (e.g. a Record<CheckStatus, {...}> covering exit code, human line, and claim-exit behavior) that all three call sites read from.

## ts/packages/tools/vibechk

1. **Duplicated Code** (high) -- `ts/packages/tools/vibechk/src/repository.ts:97-129 (runners.ts) vs 160-186 (repository.ts)`
   - Roast: Two files independently reinvented the exact same 'is the executable missing, did exec throw, did it set startupError' dance, right down to the helper function name.
   - Evidence: repository.ts's `runGitRaw`/`unwrapGitResult` and runners.ts's `executeCommand` both run: try/catch on `execApi.exec`, check `isMissingExecutableError(message)`, then separately re-check `result.startupError` with the same isMissingExecutableError branch -- and each file defines its own private, byte-for-byte identical `function isMissingExecutableError(message: string): boolean { return message.includes("ENOENT"); }`.
   - Smallest fix: Extract the exec-and-translate-errors shape (catch + startupError check + ENOENT detection) into one shared helper (e.g. in @sdl/exec or a small vibechk exec-util module) parameterized by the 'not installed' / 'failed to start' message labels, and delete both private copies of isMissingExecutableError.

2. **Duplicated Code** (medium) -- `ts/packages/tools/vibechk/src/cli.ts:187-195`
   - Roast: The 'artifact output bounds' shape is defined twice from scratch in two files, and the copies have already silently drifted.
   - Evidence: cli.ts declares `interface ArtifactOutputBounds { kind: "artifact"; artifact: ...; appliedByteLimit: number; originalBytes: number; returnedBytes: number; isComplete: boolean; continuation: string | null; }` while reports.ts (lines 7-14) independently redeclares the same fields as `readonly` and without `kind` -- two hand-maintained copies of one domain concept with no shared source of truth.
   - Smallest fix: Define ArtifactOutputBounds once (e.g. export it from cli.ts or move it to models.ts) and import it in the other file instead of re-declaring the shape.

3. **Duplicated Code** (medium) -- `ts/packages/tools/vibechk/src/reports.ts:288-323`
   - Roast: renderArtifactBounds and renderNamedArtifactBounds are the same filter-and-format-a-bullet routine wearing two different hats.
   - Evidence: renderArtifactBounds: `Object.values(loaded.outputBounds).filter((bounds) => !bounds.isComplete)` mapped to `\`- ${artifactLabel(bounds.artifact)} truncated: returned ${bounds.returnedBytes} of ${bounds.originalBytes} bytes (limit ${bounds.appliedByteLimit}). ${bounds.continuation ?? ""}\``, while renderNamedArtifactBounds does the identical filter/map with only a label prefix prepended to the same template string.
   - Smallest fix: Have renderArtifactBounds call renderNamedArtifactBounds with an empty/optional label (or factor the filter+bullet-template into one function both call), so the truncation-bullet format lives in exactly one place.
