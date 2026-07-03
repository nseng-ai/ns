# asdl-core foundation findings

Scope: `ts/packages/asdl-core/src/**`. asdl-core is genuinely well-built —
errors-as-values, gateway seams, `exactOptionalPropertyTypes` spread idiom, no
`as unknown as`, no `any`. Findings are the high-conviction structural ones.

## 1. [HIGH] submit/ carries two parallel near-duplicate PR-description paths

The biggest structural smell in the package. Two independent generate-PR-
description flows re-derive nearly identical state:

- **Prewrite** (`submit/submit-pr-metadata-prewrite.ts:363-423`
  `generateMetadataForBranches`): inspects the stack via `gt`, reads commits +
  diff via `git`, calls `preparePrDescription` with `kind:"local"`, amends commit
  messages.
- **Post-submit** (`submit/submit-pr-descriptions.ts:29-149`
  `generateSubmitPrDescriptions`): re-views each PR via `gh`, re-reads commits +
  diff via `gh`, calls `preparePrDescription` with `kind:"github"`, edits the PR
  body.

A third path (`reconcilePrewrittenPr`, `submit-pr-descriptions.ts:171-204`)
exists solely to reconcile the case where prewrite produced metadata but Graphite
created a mismatched body (compares `title.trim()`/`body.trim()`, re-edits). The
`prewritten`/`generated`/`skipped`/`prewriteFallbacks` four-bucket result type
(`submit-pr-descriptions.ts:13-21`) and the four matching status arrays in
`formatSubmitSuccessStatuses` (`submit-format.ts:57-76`) exist *only* to paper
over the fact that the same PR can be touched by both paths.

Remedy (code judo): collapse to a single description-application pass keyed on
patch-id fingerprint. `decidePrBodyOverwrite` (`pr-description-apply.ts:41-81`)
already makes the post-submit pass idempotent. If prewrite produced a body, write
the managed region + fingerprint into the commit message body directly and let
the single post-submit pass's fingerprint check no-op it. Deletes
`reconcilePrewrittenPr`, the `prewritten`/`prewriteFallbacks` buckets,
`prMetadataMatches`, and `formatSubmitSuccessStatuses`'s dual-bucket branching.

## 2. [HIGH] the root `.` export (index.ts) is vestigial — delete it [VERIFIED]

`index.ts` (the `"."` entry) re-exports exactly 5 symbols from `primitives.ts`.
But every real consumer imports from `@asdl/core/primitives` directly, and the
*only* bare `@asdl/core` importer in the monorepo is
`pi-extensions/src/harness-session.ts:1` pulling `truncatedSha256Digest` — which
is also in `/primitives`. `primitives.ts` exports 9 functions; the `.` index
forwards only 5 (omits `errorCodeFromUnknown`, `mapFromRecordOrMap`,
`formatZodError`, `formatZodIssue`), so the surface is an arbitrary subset.

Remedy: delete `src/index.ts`, drop the `"."` export from package.json, repoint
the one `harness-session.ts` import at `@asdl/core/primitives`. The package
becomes purely subpath-addressed (which it already is in practice).

## 3. [HIGH] brmem-cli multi-candidate framework wraps a single hardcoded candidate [VERIFIED]

`resolveBrmemCommandCandidates` (`brmem-cli.ts:129-136`) takes `cwd` and an
`exists` option, `void`s both, and returns `[{command:"brmem", prefixArgs:[]}]` —
always exactly one element. On top sits an entire candidate-iteration layer:
`runBrmemCandidate`, `runFirstAvailableBrmemCommand`,
`FirstAvailableBrmemCommandRun`, `NoAvailableBrmemCommandRun`,
`BrmemCandidateRun`, `UnavailableBrmemRun`, plus
`formatBrmemUnavailableMessage(failures: readonly UnavailableBrmemRun[])`
joining a list that can never have more than one entry. And
`ccc/src/worktree-status.ts:255` re-implements the same
`for…of resolveBrmemCommandCandidates` loop at its call site — the leaky
abstraction has already spread.

Remedy: replace the candidate framework with a single `runBrmem(args, opts)` that
shells `brmem` directly and returns `completed | unavailable`. Delete
`BrmemCommandCandidate`, `runFirstAvailableBrmemCommand`, the `failures:
readonly[]` plurality, and collapse `formatBrmemUnavailableMessage` to a
single-failure formatter. Also delete the two confirmed-dead exports
`readOptionalBrmemBooleanField` (`brmem-cli.ts:396-411`) and
`graphqlErrorsFromJson` (`github-graphql-json.ts:29`). See
`branch-memory-access.md` — this finding combines with branch-context's shell-out
to make most of brmem-cli's 549 lines removable.

## 4. [MED] submit.ts failure-transcript built from three copy-pasted spread blobs

`submit.ts` is 826 lines but mostly cohesive; the spaghetti region is the
`SubmitFailureTranscriptCommand` construction. The exact
`{ commandDisplay, stdout, stderr, exitCode, ...(startupError), ...(killed) }`
spread is hand-written 3×: `commandFailureTranscript` (651-671) and twice inside
`postSubmitFailureTranscript` (685-705). The `...(output.startupError ===
undefined ? {} : …)` / `...(output.killed === true ? {} : …)` optional-spread
pair appears 5+ times. Remedy: extract one `transcriptCommand(commandDisplay,
output): SubmitFailureTranscriptCommand`. NOTE: `commandFailureTranscript`
normalizes the exit code (`normalizedFailureExitCode`) while
`postSubmitFailureTranscript` uses the raw `output.exitCode` — a silent
inconsistency a shared helper would force a decision on.

## 5. [MED] submit/index.ts re-exports ~20 internal helpers with no external consumers

`submit/index.ts:50-72` exports `buildPrDescriptionUserPrompt`,
`filterLockfileSections`, `formatManagedGeneratedRegion`, `hasGeneratedMarker`,
`isCommitMessagePrefillBody`, `parsePrDescriptionOutput`,
`replaceOrInsertGeneratedRegion`, `truncateDiff`, `generatePrDescriptionForPr`,
`appendGeneratedMarker`, etc. None have a non-test consumer outside asdl-core.
Remedy: prune to the genuinely consumed surface (`runSubmitCommand`, the
gateways, `RealGithubPrGateway`, the `Submit*` types, `extractPrLinks`); keep the
rest module-internal.

## 6. [MED] two divergent formatOutputSection implementations share a name

`exec.ts:254` exports `formatOutputSection` (tail-limited,
`----- stdout tail -----`, strips escapes, applies `tailText`).
`submit-format.ts:401` defines a *private* `formatOutputSection` (full output,
`----- stdout -----`, `(empty)` fallback, no tail limit). Same name, different
behavior — a reader can't tell which is in play without checking imports.
`submit-format.ts` also re-implements a tail in `formatSubmitOutputTail` (82-96)
that duplicates `tailText`/`formatOutputSection`. Remedy: rename the local one
(`formatRawOutputSection`) or parameterize the canonical `exec.ts` one with
`mode: "tail" | "full"` and delete `formatSubmitOutputTail`.

## 7. [LOW] submit/result.ts is a 2-line alias-only re-export

`submit/result.ts` exists only to rename `Result` → `GatewayResult` and re-export
`err`/`ok`. Remedy: delete it; import from `../result.ts` directly. If the
`GatewayResult` alias is wanted, define it once at root `result.ts`.

## 8. [LOW] unreachable assertNever after exhaustive single-case switch

`submit-format.ts:336` — `formatSubmitSemanticFailureCause` switches on
`cause.kind` whose only member is `"empty_branch_skipped"`, returns, then has an
unreachable `return assertNever(cause.kind)` where `cause.kind` is `string`-typed
(not `never`), so it doesn't actually typecheck as an exhaustiveness guard. Drop
the dead tail or widen the union meaningfully.

## Notes (no action)

- `git/index.ts` (588) and `graphite-metadata.ts` (439) are large but cohesive —
  each method is a thin uniform git-result wrapper; the repetition is honest.
- `text-table.ts`, `text-truncation.ts`, `text-repair.ts`, `managed-region.ts`,
  `markdown-frontmatter.ts` are well-scoped and non-overlapping despite the
  shared `text-*` prefix. No unification warranted.
- `generateSubmitPrDescriptions` (`submit-pr-descriptions.ts:54`) and the
  per-branch metadata loop are intentionally sequential (inline comment cites
  gh/API rate limits + deterministic ordering). Defensible, not a regression.
