# Semantic Update — brmem-cli candidate framework collapsed to `runBrmem`

Date: 2026-06-22T134435Z

## What changed

The roadmap row "Collapse the `@sdl/core/brmem-cli` multi-candidate framework to
a single `runBrmem`; fix the duplicated candidate-loop at
`ccc/worktree-status.ts`; delete dead exports `graphqlErrorsFromJson`,
`readOptionalBrmemBooleanField`" is now done and flipped to `[x]`.

- `ts/packages/sdl-core/src/brmem-cli.ts` now exposes **one** public runner,
  `runBrmem(options): Promise<RunBrmemResult>` where
  `RunBrmemResult = CompletedBrmemRun | { type: "unavailable"; failures }`.
- Removed from the public surface: `resolveBrmemCommandCandidates`,
  `runBrmemCandidate`, `runFirstAvailableBrmemCommand`, and the now-unused
  candidate/option/result types (`BrmemCommandCandidate`,
  `RunBrmemCandidateOptions`, `RunFirstAvailableBrmemCommandOptions`,
  `BrmemCandidateRun`, `FirstAvailableBrmemCommandRun`,
  `NoAvailableBrmemCommandRun`). The two-candidate resolution and per-candidate
  run logic were inlined as private helpers (`brmemCommandCandidates`,
  `runBrmemOnCandidate`) so the names above grep to zero occurrences.
- `CompletedBrmemRun` / `UnavailableBrmemRun` are retained for the result shape,
  `brmemCommandFailure`, and the plural `formatBrmemUnavailableMessage`. Their
  unused `candidate` field was dropped (nothing read it outside the file).
- `runAvailableBrmemCommand` (and thus `checkBrmemEntry` /
  `putBrmemEntryFromFile` / `listBrmemEntries` and their external consumers in
  roaster, ccc, and pi-extensions) was repointed onto `runBrmem` with unchanged
  signatures and behavior.
- `ts/packages/ccc/src/worktree-status.ts:loadBrmemStatus` no longer carries its
  own `for (const candidate of resolveBrmemCommandCandidates(cwd))` loop; it
  calls `runBrmem` once and keeps its own lenient parse/degrade behavior
  (malformed JSON / non-canonical entries degrade to `"unavailable"`/`undefined`
  rather than throwing; it was NOT repointed at the strict `listBrmemEntries`).
- Dead `readOptionalBrmemBooleanField` and its (already-absent) test coverage are
  gone; `BrmemFieldParseContext` / `fieldPath` stay (still used by
  `requireBrmemStringFields`). `graphqlErrorsFromJson` was already deleted on
  trunk and remains absent (not re-added).

## Stale premise corrected

The original review claimed `resolveBrmemCommandCandidates` "always returns a
single hardcoded candidate," and the roadmap row's literal wording ("a single
`runBrmem` that shells `brmem` directly") inherited that premise. On current
trunk the resolver genuinely returns up to **two** candidates — PATH `brmem`,
then `pnpm --config.verify-deps-before-run=false --dir <tsWorkspaceRoot> exec
brmem` when a TS workspace root is detected — added after the review in commit
`0ae09c8d9`. The decision (user-confirmed in the attached plan) was to **keep
both candidates' behavior** inside `runBrmem` and collapse only the public
iteration ceremony/types and the leaked ccc call-site loop. Dropping the
fallback would regress dev/CI environments where `brmem` is not yet on PATH but
the TS workspace is present, violating the Objective's "No behavior changes"
Non-Goal. A new `runBrmem` fallback unit test locks the two-candidate behavior
in so future sessions do not re-introduce the stale "single hardcoded candidate"
assumption.

The unmerged branch `origin/extract-brmem-cli-adapter-and-migrate-callers` was
confirmed irrelevant (different Objective, older pi-extensions file layout, not
merged, adds rather than collapses a candidate seam); the collapse was done
directly against trunk.

## Minor adaptation vs. the plan

`worktree-status.ts:loadBrmemStatus` now defers candidate iteration entirely to
`runBrmem`, which returns the first **completed** candidate (matching the
existing `runAvailableBrmemCommand` semantics already used by the other
helpers). The pre-existing leaked loop additionally `continue`d to the next
candidate on a *completed-but-nonzero/killed/invalid* PATH `brmem` result; that
incidental over-retry is gone, which is the intended effect of "fix the
duplicated candidate-loop" (unifying onto `runBrmem`). The contractually
preserved behavior — command-not-found → fallback, and lenient degrade to
`"unavailable"`/`undefined` — is unchanged and covered by the unchanged
`worktree-status.test.ts` brmem cases. The plan also said to delete the
`readOptionalBrmemBooleanField` `describe` test block, but no such block existed
(the function was dead even in tests), so only the source function was removed.

## Validation

- `just ts-format-check` (after `just ts-format-fix` wrapped one long line in
  `worktree-status.ts`), `just ts-lint`, `just ts-check` (tsgo), `just ts-test`
  (3022 passed), `just ts-deps-check`, `just ts-guard` — all green.
- Grep across `ts/packages` for `resolveBrmemCommandCandidates`,
  `runBrmemCandidate`, `runFirstAvailableBrmemCommand`,
  `readOptionalBrmemBooleanField`, `graphqlErrorsFromJson`: zero hits.
- New `runBrmem` test block covers single PATH success, PATH→pnpm-exec fallback,
  both-candidates-unavailable (plural failures), and startup-error paths.
