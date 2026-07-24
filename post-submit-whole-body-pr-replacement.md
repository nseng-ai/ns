# Simplify PR Description Generation to Whole-Body Replacement

## Goal and outcome

Simplify Flow’s implemented PR-description system around one ownership rule: whenever Flow generates PR metadata, it owns and replaces the complete PR title and body.

The finished behavior must be:

- `ns flow submit` generates metadata only for PRs newly created by that invocation.
- New-PR generation happens only after Graphite has created the PRs. Submit no longer generates metadata before publication, amends commit messages for PR prose, or reconciles Graphite-created metadata against an in-memory prewrite.
- `ns flow submit --regenerate-descriptions` is removed.
- `ns flow regenerate-pr` remains the focused operation for the current branch’s existing PR.
- Both generation paths replace the complete title and complete body. They never preserve, parse, merge, or migrate existing PR-body content.
- Generated bodies end with deterministic, visibly rendered provenance identifying the generating command, stable prompt-source label, and resolved model reference.
- There are no PR-description managed regions, hidden provenance markers, fingerprints, skip-current behavior, legacy-body recognition, commit-prefill recognition, or backwards-compatibility migrations.
- `regenerate-pr` warns that all title/body content will be replaced, confirms by default, and uses `--yes` for explicit non-interactive approval.
- When submit creates multiple PRs, Flow prepares and validates every generated replacement before editing any PR. It then applies replacements sequentially. On a GitHub write failure, stop; report replacements already applied, the failed PR, and replacements not attempted. Do not roll back successful edits.
- Existing title/body text is not supplied to the model. The model receives PR identity, branch/base identity, commit headlines, and diff evidence only.

This plan deliberately ignores the theoretical `ns flow ship` design. No `ship` command exists in current Flow source or tests; references to it live only in Objective/draft material and are out of scope.

## Planning provenance

- Repository: `ns`
- Source branch while planning: `pr-make-accountable`
- Planning baseline: `cf7595493` (`[cp] Simplify generated PR description markup`)
- Trunk anchor visible during analysis: `fe13a2571491c7db288536dbe9bcee1572dcf6b8`
- Current branch also contains the new `pr-make-accountable` skill. That skill already replaces the complete PR body and is not an implementation target for this plan.
- The implementation session must revalidate the listed symbols and excerpts before editing; the SHA records provenance, not a mechanical branch gate.

## Resolved product decisions and rationale

1. **Keep only implemented generation surfaces.** Ignore theoretical `ship`. Ordinary submit handles only newly created PRs; `regenerate-pr` handles the current existing PR.
2. **Generate new-PR prose post-submit only.** A short interval where Graphite’s default metadata is visible is acceptable. It is preferable to mutating local commits, changing SHAs, reacquiring readiness, and reconciling two metadata representations.
3. **Remove explicit stack regeneration from submit.** Delete `--regenerate-descriptions`; users regenerate an existing PR from its branch with `regenerate-pr`.
4. **Couple title and body replacement.** They are generated from the same evidence and prompt and must not drift.
5. **Overwrite everything.** Human prose, legacy generated markup, decisions-log blocks, Objective Runner regions, malformed markers, and commit-prefilled bodies receive no special treatment. Help and confirmation must state this destructive ownership clearly.
6. **Use visible deterministic provenance.** Append it in code after model-output validation, rather than asking the model to author it. Use a short italic footer after a horizontal rule; use no hidden comments.
7. **Identify command, prompt source, and model.** Prompt labels must be stable and must not publish absolute local paths.
8. **Regeneration always regenerates.** Delete fingerprint caching and skip-current behavior. Replace the old overloaded `--force` with `--yes`, whose only meaning is explicit approval to write without an interactive confirmation.
9. **Prepare batches before mutation.** Model/prompt/diff failures must edit no PR in a multi-new-PR submit. GitHub edits are not transactional; do not implement rollback because it could overwrite concurrent human edits.
10. **Do not anchor the model on stale prose.** Existing title/body may be shown in the human confirmation display, but neither belongs in the model prompt.

### Rejected alternatives

- Keep managed regions to preserve human prose: rejected because it recreates partial ownership and parsing complexity.
- Retain fingerprints as a cache: rejected because an explicit regeneration command should regenerate, and current-body parsing would remain necessary.
- Keep metadata prewrite to avoid briefly showing Graphite defaults: rejected because it requires commit mutation, eligibility rules, readiness reacquisition, and reconciliation.
- Keep `submit --regenerate-descriptions`: rejected to keep existing-PR mutation focused and explicit.
- Preserve known ns blocks such as decisions logs or Objective Runner regions: rejected because special extraction/reinsertion is another partial-body protocol.
- Roll back earlier GitHub edits after a later edit failure: rejected because rollback is not atomic and may destroy concurrent edits.

## Current architecture and discovered facts

### Implemented entry points

- `ts/packages/capabilities/flow/src/ns/commands/submit.ts`
  - Defines `regenerateDescriptions` and documents ordinary/new-PR versus explicit stack regeneration.
  - Resolves the PR-description model for ordinary submit.
  - Passes `shouldRegenerateExistingPrDescriptions` into the submit engine.
- `ts/packages/capabilities/flow/src/ns/commands/regenerate-pr.ts`
  - Calls `preparePrDescriptionUpdateForCurrentBranch`, confirms, then calls `applyPreparedPrDescriptionUpdate`.
  - Current help/confirmation promises managed-region preservation.
  - Current `--force` both bypasses fingerprint skipping and bypasses confirmation.
- `ts/packages/capabilities/flow/src/pi/ns-extension.ts`
  - Mirrors `regenerate-pr` and `submit` into Pi. Command behavior remains CLI-owned.

### Shared generation

- `ts/packages/capabilities/flow/src/submit/pr-description.ts`
  - Resolves the `flow.submit.pr-description` point and model selection.
  - Builds model context, filters lockfiles, truncates diffs, parses output, validates title/body, and performs one repair attempt.
  - `ExistingPrDescriptionPromptContext` currently contains the stale existing title.
  - `PromptSource` currently preserves concrete paths for repo/env prompt sources.
- `ts/packages/capabilities/flow/src/submit/pr-description-orchestration.ts`
  - Has separate generated and `PrewrittenPrMetadata` reconciliation paths.
  - Computes a fingerprint, may skip generation, loads commit messages, generates a draft, merges the body, and applies it.
  - Result variants include `skipped`, `prepared`, `matched_prewritten`, `updated`, and `generated`.
- `ts/packages/capabilities/flow/src/submit/github-pr-gateway.ts`
  - `GithubPrDetails` contains title/body/head/base data.
  - `stablePatchIdForPr` obtains a diff and runs `git patch-id --stable` for fingerprinting.
  - `editPr` already performs the desired primitive: `gh pr edit <n> --title ... --body-file ...`.

### Body compatibility subsystem

`ts/packages/capabilities/flow/src/submit/pr-description-body.ts` owns complexity that the new contract deletes:

- v1 whole-body marker and v2 managed-region markers;
- patch/prompt/generator fingerprints;
- skip/force decisions;
- managed-region parsing and malformed recovery;
- partial replacement while preserving prefix/suffix prose;
- legacy marker recognition;
- commit-message-prefill recognition;
- prewritten equality and fallback-marker behavior.

The generic `@nseng-ai/foundation/managed-region` module is still used by Objective Runner publication and remains in scope for those other consumers. Delete only PR-description dependence on it.

### Submit prewrite and reconciliation

- `ts/packages/capabilities/flow/src/submit/submit-plan.ts`
  - `SubmitPlan` tracks `existingPrLinks`, `metadataPrewriteBranches`, and `skippedMetadataBranches`.
  - `planMetadataPrewrite` selects new, single-commit branches on the current branch’s parent chain.
- `ts/packages/capabilities/flow/src/submit/submit-pr-metadata-prewrite.ts`
  - Combines stack inspection with metadata generation and commit amendment.
  - `prewriteSubmitMetadata` generates all eligible drafts, checks cleanliness, then sequentially invokes metadata amendments (`gt modify` through the gateway).
  - A later amendment failure may leave earlier local branches amended.
- `ts/packages/capabilities/flow/src/submit/submit.ts`
  - Prewrites metadata before submit, threads `PrewrittenPrMetadata` through transport failures/advisories, and reacquires readiness because prewrite may change SHAs.
  - After publication, partitions new/existing links. Default generation targets new links; `--regenerate-descriptions` targets all links and forces regeneration.
- `ts/packages/capabilities/flow/src/submit/submit-pr-descriptions.ts`
  - Matches prewritten metadata by branch.
  - Interleaves per-PR preparation and GitHub editing; a later generation failure can leave earlier PRs edited.
  - Reports four success buckets: generated, skipped, prewritten, and prewrite fallbacks.
- `ts/packages/capabilities/flow/src/submit/submit-pr-description-summary.ts` and `submit-format.ts`
  - Expose/report those buckets and skipped-current behavior.
- `ts/packages/capabilities/flow/src/submit/submit-transport-preparation.ts`
  - Carries prewritten metadata into restack/readiness failure advisories.

Preserve stack inspection and `existingPrLinks` classification because post-submit ordinary generation still needs to identify PRs created by the invocation. Remove only prose prewrite/amendment/reconciliation responsibilities. If `submit-pr-metadata-prewrite.ts` becomes misleading after deletion, split/rename the retained stack-inspection module rather than leaving stale ownership in the name.

### Other PR-body writers

- `ts/packages/capabilities/flow/src/publication/managed-objective-runner-region.ts` owns a separate Objective Runner region protocol.
- Complete PR-description replacement will erase that region if present. Do not modify Objective Runner publication in this slice; document the collision in user-facing overwrite warnings and tests.
- `skills/pr-make-accountable/SKILL.md` already replaces the complete body after author approval. Leave it unchanged.

## Target module shape

Create one linear preparation contract and one application contract. Exact names may follow nearby conventions, but the conceptual shape should be:

```ts
interface PreparedPrMetadataReplacement {
  pr: GithubPrDetails;
  title: string;
  body: string; // final model body plus visible provenance
  promptSource: PromptSource;
  modelSelection: ModelSelection;
}

preparePrMetadataReplacement(...)
applyPreparedPrMetadataReplacement(...)
```

The preparation module should:

1. Resolve prompt/model generation inputs.
2. Load the PR diff directly; do not compute a patch ID.
3. Load only commit data used by the prompt (headlines).
4. Generate and validate title/body.
5. Append deterministic provenance.
6. Return the complete replacement without writing GitHub.

The apply module should call the existing `GithubPrGateway.editPr` with the complete title/body.

Do not expose options for body merge policy, compatibility mode, fingerprints, or skip policy. Their absence is the new interface’s depth.

### Provenance format

Use a code-owned footer of this form (wording may be tightened while preserving all fields):

```markdown
<Model-generated body>

---

_Generated by `ns flow regenerate-pr`. Prompt: built-in `flow.submit.pr-description`. Model: `openai-codex/gpt-5.6-luna`._
```

For submit-created PRs, identify `ns flow submit` instead.

Define stable prompt-source presentation that never emits an absolute path:

- built-in default: `built-in flow.submit.pr-description`;
- repository-selected prompt: `repository flow.submit.pr-description`;
- environment-selected override: `environment override flow.submit.pr-description`.

The implementation may retain concrete paths internally for reading and diagnostic errors. The provenance formatter must consume a stable source classification/label, not `source.path` directly. Use `formatModelRef` for the model label.

Keep the model prompt’s prohibition on model-authored attribution. Append the true provenance only after `preparePrDescription` validates the model output, so invented attribution remains invalid while Flow-owned provenance remains deterministic.

## Scope

### In scope

- Flow submit command/schema/help and its ordinary new-PR metadata path.
- Focused `regenerate-pr` command/help/options/confirmation/result.
- PR prompt context, preparation, provenance formatting, orchestration, batch preparation/application, GitHub gateway calls, and result reporting.
- Deletion of PR-description body compatibility and fingerprint mechanisms.
- Deletion of metadata prewrite/commit amendment/reconciliation behavior and stale transport advisories.
- Pi parity/registration metadata affected by CLI option/help changes.
- Flow package README, `skills/ns-flow-submit/SKILL.md`, and active `prod-submit-roast-and-fix` Objective records that currently describe the interim behavior.
- Unit/scenario/fake updates proving the new contract.

### Out of scope

- Implementing or designing `ns flow ship`; it does not exist in production code.
- Changing `pr-make-accountable`; it already has explicit complete-body replacement semantics.
- Preserving or migrating any existing PR body on GitHub.
- Changing Objective Runner’s own publication-region implementation.
- Adding rollback or transactional GitHub mutation.
- Altering the generic Foundation managed-region module for its remaining consumers.
- Publishing, pushing, or mutating PR #3833 as part of implementation unless separately authorized.

## Landing stack and subagent execution

Implement this plan as **two new PRs stacked above the existing PR #3833**. The completed Graphite stack will therefore contain **three PRs total**: existing PR #3833 plus the following two implementation PRs.

### Implementation PR 1: whole-body replacement foundation

Shared review narrative: establish the new complete-replacement interface and focused command behavior before submit consumes it.

Include:

- whole-title/body preparation and application interfaces;
- deterministic visible provenance;
- removal of managed regions, fingerprints, legacy compatibility, commit-prefill recognition, and patch-ID use;
- removal of existing title/body from model context;
- `regenerate-pr` destructive confirmation semantics and `--yes` replacement for `--force`;
- focused gateway, unit, scenario, help, and Pi parity changes required by that behavior.

Do not include submit prewrite deletion or submit batch restructuring in this PR, except for the minimum compile-preserving adaptation needed to consume the new interface. If a temporary adapter is unavoidable, keep it narrow and delete it in PR 2.

### Implementation PR 2: submit pipeline simplification

Dependency: implementation PR 1.

Shared review narrative: make ordinary submit consume the complete-replacement foundation after PR creation and delete the obsolete prewrite/reconciliation architecture.

Include:

- removal of metadata prewrite, commit amendment, readiness reacquisition, and prewritten reconciliation;
- preservation/extraction of stack inspection and reliable new-PR identification;
- removal of `--regenerate-descriptions`;
- post-submit generation only for PRs created by that invocation;
- prepare-all-before-write batch behavior and applied/failed/not-attempted reporting;
- submit result/progress simplification;
- submit scenarios, docs, skill guidance, and Objective updates;
- final stale-concept deletion and repository-wide validation for the combined stack.

The two PRs should not be combined: PR 1 creates a coherent reusable replacement contract and focused user-facing operation with an independent review/revert boundary; PR 2 is a larger submit lifecycle refactor that depends on that contract and has separate Graphite/publication failure modes.

### One implementation subagent per PR

Use **one focused `task` implementation subagent for each implementation PR**, dispatched sequentially in the shared worktree:

1. Dispatch subagent 1 with the complete PR 1 scope, this plan’s resolved semantics, applicable repo instructions, and explicit instruction not to begin PR 2 work. It should implement and validate PR 1 locally but must not push, submit, create, or mutate a PR.
2. The parent inspects the child result, session evidence when needed, working-tree diff, tests, and scope. Resolve defects, then create the PR 1 Graphite commit/branch checkpoint using the `graphite` skill.
3. Only after PR 1 is locally coherent, dispatch a fresh subagent 2 with the complete PR 2 scope, PR 1’s resulting interface/current state, and explicit instruction to remove any temporary adapter left for stackability. It should implement and validate PR 2 locally but must not publish.
4. The parent again inspects the child result and diff, runs combined-stack validation, and creates the PR 2 Graphite checkpoint above PR 1.
5. Publication of either implementation PR is a separate parent-only action and requires the user’s publication authority; implementation subagents have no push/submit/PR-mutation authority.

Each subagent prompt must be self-contained: include the target PR’s review narrative, exact in/out scope, inherited evidence, STOP conditions, and expected validation. Treat a child’s final text as a report, not proof; inspect repository state and diagnostics before advancing to the next PR.

## Implementation steps

The numbered steps below map to the landing stack: steps 1–3 and 7 primarily belong to implementation PR 1; steps 4–6 and 9 primarily belong to implementation PR 2; step 8 is split so each PR carries its own behavior-level tests and PR 2 performs final stale-compatibility cleanup.

### 1. Establish the new contract in focused tests

Before broad deletion, rewrite/add the smallest tests around the intended interface:

- A generated replacement contains the model title, full model body, and visible provenance footer.
- Provenance distinguishes `ns flow submit` from `ns flow regenerate-pr` and uses stable built-in/repository/environment labels plus `formatModelRef` output.
- No absolute prompt path appears in a body.
- Existing title/body are not present in the model prompt.
- Applying a prepared replacement passes the exact complete title/body to `GithubPrGateway.editPr`.
- A body containing legacy markers, human prose, a decisions log, or Objective Runner markers is overwritten without parsing/preservation.

Prefer tests through the new preparation/application interface. Do not preserve low-level tests for helpers scheduled for deletion.

### 2. Replace managed-body/fingerprint orchestration with complete replacement

In `pr-description-orchestration.ts` and `pr-description.ts`:

- Remove fingerprint policy, stable patch-ID use, skip-current outcomes, merge logic, and prewritten reconciliation.
- Obtain the diff through `getPrDiff` (including its existing too-large fallback behavior) rather than `stablePatchIdForPr`.
- Remove existing title from `ExistingPrDescriptionPromptContext` and from `formatPrContextLines`; keep PR number/URL and branch identities.
- Continue passing commit headlines; remove commit-body use from this workflow.
- Add command/workflow identity to preparation input so provenance can name the caller without guessing.
- Format and append provenance after model-output validation.
- Return one prepared replacement success shape plus a structured failure shape.
- Keep preparation side-effect free with respect to GitHub; keep apply as the only mutation step.

After callers migrate, delete `pr-description-body.ts` and remove its exports from `submit/index.ts`. If a tiny provenance formatter merits its own file, use a name reflecting final-body formatting, not managed-region ownership.

### 3. Simplify the GitHub PR gateway around used evidence

In `github-pr-gateway.ts` and its fake/tests:

- Remove `stablePatchIdForPr`, patch-ID constants/timeouts, and `git patch-id` execution once no caller remains.
- Narrow commit-message data to headlines if no remaining Flow caller needs bodies. Verify all package-wide consumers before changing `PrCommitMessage`.
- Decide whether `GithubPrDetails.body` remains necessary only for confirmation display or unrelated callers. The generation module must not consume it. If no caller needs it after scenario rewrites, remove `body` from `PR_VIEW_FIELDS` and the type; otherwise retain it solely at the command/display seam.
- Keep `getPrDiff` and its GitHub-too-large local fallback intact.
- Keep `editPr` as the complete replacement primitive.

### 4. Delete submit metadata prewrite while preserving stack inspection

Refactor `submit-plan.ts`, `submit-pr-metadata-prewrite.ts`, `submit.ts`, `submit-transport-preparation.ts`, and gateway/spec support:

- Remove `metadataPrewriteBranches`, `skippedMetadataBranches`, `planMetadataPrewrite`, `prewriteSubmitMetadata`, `generateMetadataForBranches`, metadata amendment operations, and their progress/result types.
- Remove submit’s prewrite phase and the second readiness acquisition that existed only because commit SHAs could change.
- Remove `PrewrittenPrMetadata` threading from transport preparation, failure advisories, and formatting.
- Retain stack inspection facts needed for submit execution, especially `currentBranch`, branches/topology, `existingPrLinks`, and `hasUpstackBranches`.
- Extract retained inspection code from `submit-pr-metadata-prewrite.ts` into a clearly named stack-inspection module if the old file would otherwise become a misleading mixed-responsibility shell.
- Remove `gt modify` metadata-amendment methods/command shapes only after proving they have no non-description consumer.

The ordinary flow should become:

```text
inspect/plan submit scope
→ prepare submit transport once
→ Graphite submit/update/verify
→ partition resulting PR links against pre-existing PR links
→ prepare complete replacements for all new PRs
→ apply those replacements
→ report
```

### 5. Make new-PR batch generation prepare-first

Refactor or replace `generateSubmitPrDescriptions`:

- Resolve prompt/model generation once for the batch.
- Load each selected new PR and prepare every replacement without invoking `editPr`.
- If any PR cannot be loaded or prepared, return all known preparation failures (or fail at the first deterministic failure) with **zero GitHub edits**. Tests must assert no `editPr` calls.
- Once every replacement is prepared, apply sequentially in deterministic PR-link order.
- On the first edit failure, stop applying. Return/report:
  - PRs successfully replaced;
  - the failed PR and diagnostic;
  - prepared PRs not attempted.
- Do not roll back successful replacements.
- Reduce summary/result types from generated/skipped/prewritten/prewrite-fallback buckets to states that represent the new truth, such as prepared/applied/failed/not-attempted plus previews.
- Update matrix progress language from “skip or regeneration” and “prewritten” to preparation/replacement states.

### 6. Remove `--regenerate-descriptions` from submit

In `src/ns/commands/submit.ts`, submit engine options, Pi parity tests, README, and scenarios:

- Delete the schema field and CLI option.
- Delete its `--minimal` conflict handling.
- Delete `shouldRegenerateExistingPrDescriptions` plumbing.
- Always select only `partitionedPrLinks.newPrLinks` for ordinary submit description generation.
- Ensure existing PRs, including empty or legacy-marked bodies, receive no reads/generation/edits beyond what submit verification intrinsically requires.
- Update success/failure copy to describe initial complete metadata replacement for newly created PRs, not managed regions or skip-current behavior.

### 7. Make `regenerate-pr` explicitly destructive and always fresh

In `src/ns/commands/regenerate-pr.ts` and scenario tests:

- Replace `force` with `yes` / `--yes` in the schema and option metadata.
- Remove the already-current success path; every invocation that reaches generation produces a fresh replacement.
- Default interactive flow:
  1. prepare a fresh replacement;
  2. show PR URL, current/new title, provenance summary, and an explicit statement that **all existing PR body content will be removed**;
  3. request confirmation;
  4. apply only on confirmation.
- `--yes` skips confirmation and writes non-interactively.
- Update non-interactive missing-confirmation guidance to mention `--yes`.
- Keep declined/aborted behavior as a refusal with no GitHub edit.
- Update command summary/help/result text from “ns-managed body region” to “complete PR title and body.”

Do not add compatibility aliases for `--force`; backwards compatibility was explicitly waived.

### 8. Delete stale compatibility tests and add behavior-level coverage

Delete or rewrite assertions for:

- managed-region formatting/parsing/replacement;
- malformed marker recovery;
- preservation of human prefix/suffix;
- decisions-log preservation;
- v1/v2 marker conversion;
- commit-message-prefill detection;
- matching fingerprint skip;
- forced fingerprint bypass;
- prewritten exact match/fallback;
- generated/skipped/prewritten/prewrite-fallback reporting.

Add/retain coverage for:

- prompt resolution precedence and diagnostics;
- output parsing, title/body validation, repair, diff filtering/truncation;
- visible stable provenance and no absolute path leakage;
- complete title/body replacement;
- `regenerate-pr` confirmation, decline, missing UI, and `--yes` behavior;
- overwrite of arbitrary/legacy/other-ns body content;
- ordinary submit leaves every pre-existing PR untouched;
- ordinary submit prepares all new-PR drafts before the first edit;
- one preparation failure causes zero edits;
- sequential apply stops on first edit failure and reports applied/failed/not-attempted sets;
- multi-new-PR success edits every new PR exactly once;
- Graphite submit/readiness runs once with no metadata amendment commands.

### 9. Update documentation and active Objective truth

Update at least:

- `ts/packages/capabilities/flow/README.md`
- `skills/ns-flow-submit/SKILL.md`
- `ts/packages/capabilities/flow/src/ns/commands/submit.ts` help
- `ts/packages/capabilities/flow/src/ns/commands/regenerate-pr.ts` help
- `ts/packages/capabilities/flow/src/pi/ns-extension.ts` descriptions/parity metadata if surfaced text changes
- `.ns/objectives/prod-submit-roast-and-fix/objective.md`
- `.ns/objectives/prod-submit-roast-and-fix/roadmap.md`
- a new timestamped Semantic Update under `.ns/objectives/prod-submit-roast-and-fix/updates/`

Record the new interim reality accurately:

- ordinary submit still generates initial metadata for PRs it creates, but only post-submit;
- existing PRs are never rewritten by submit;
- `--regenerate-descriptions` is removed;
- `regenerate-pr` replaces complete metadata with visible provenance;
- final theoretical movement of prose to `ship` remains an Objective concern, not part of this implementation.

Do not rewrite historical Objective updates; add a new update that supersedes their interim managed-region/explicit-stack-regeneration contract.

## Execution strategy for the refactor

This change contains both deep semantic surgery and same-shape cleanup across more than five code/docs/test files. The primary execution strategy is the **two sequential implementation subagents described above, one per implementation PR**.

- **Core semantic path:** within each PR subagent, make precise, dependency-ordered edits manually (or with a suitable TypeScript AST tool if repository tooling provides one). PR 1 starts at the preparation/application interface and migrates focused regeneration. PR 2 migrates submit batching and deletes prewrite/reconciliation. Do not use an opaque global text-replacement script for the core state/result changes.
- **Broad cleanup path:** keep cleanup owned by the same subagent as its PR so review narrative and implementation stay aligned. A PR subagent may use the repository’s `refactor-swarm` workflow internally for 5+ non-overlapping file-local test/help/docs cleanup only if available and if it remains within that PR’s scope. The parent must integrate and validate all child work.
- **Mechanical symbol removal:** if a suitable repo TypeScript codemod/AST tool exists, use it for purely syntactic import/export/call-site cleanup after the semantic design is established. Otherwise use precise edits.
- **Mandatory stale-concept sweep:** finish with bounded `rg` checks for removed concepts, including:

```bash
rg -n --glob '!*.map' --max-columns 300 --max-columns-preview \
  'regenerateDescriptions|regenerate-descriptions|PrewrittenPrMetadata|prewrittenFallback|matched_prewritten|prewriteFallbacks|fingerprintPolicy|skip-current|MANAGED_BODY_BEGIN_MARKER|GENERATED_BODY_MARKER|mergeGeneratedBody|stablePatchIdForPr|ns-managed generated description region' \
  ts/packages/capabilities/flow skills/ns-flow-submit .ns/objectives/prod-submit-roast-and-fix | head -n 200
```

Any remaining match must be either removed, intentionally historical, or documented in the implementation summary.

## Likely files and symbols

The executor should re-run bounded searches before editing. Likely production scope:

- `ts/packages/capabilities/flow/src/ns/commands/submit.ts`
- `ts/packages/capabilities/flow/src/ns/commands/regenerate-pr.ts`
- `ts/packages/capabilities/flow/src/ns/extension.ts`
- `ts/packages/capabilities/flow/src/pi/ns-extension.ts`
- `ts/packages/capabilities/flow/src/submit/pr-description.ts`
- `ts/packages/capabilities/flow/src/submit/pr-description-orchestration.ts`
- `ts/packages/capabilities/flow/src/submit/pr-description-body.ts` (expected deletion)
- `ts/packages/capabilities/flow/src/submit/pr-description-regenerate.ts`
- `ts/packages/capabilities/flow/src/submit/prompts/pr-description-default.md` only if wording must distinguish model output from code-appended provenance
- `ts/packages/capabilities/flow/src/submit/github-pr-gateway.ts`
- `ts/packages/capabilities/flow/src/submit/submit.ts`
- `ts/packages/capabilities/flow/src/submit/submit-plan.ts`
- `ts/packages/capabilities/flow/src/submit/submit-pr-metadata-prewrite.ts` (major reduction/split; prose prewrite removed)
- `ts/packages/capabilities/flow/src/submit/submit-pr-descriptions.ts`
- `ts/packages/capabilities/flow/src/submit/submit-pr-description-summary.ts`
- `ts/packages/capabilities/flow/src/submit/submit-format.ts`
- `ts/packages/capabilities/flow/src/submit/submit-transport-preparation.ts`
- `ts/packages/capabilities/flow/src/submit/submit-command-spec.ts` / `submit-gateway.ts` if metadata amendment shapes are owned there
- `ts/packages/capabilities/flow/src/submit/index.ts`

Likely tests/fakes:

- `test/scenario/regenerate-pr-command.test.ts`
- `test/scenario/submit-command.test.ts`
- `test/unit/pr-description.test.ts`
- `test/unit/pr-description-body.test.ts` (expected deletion or replacement)
- `test/unit/pr-description-orchestration.test.ts`
- `test/unit/submit-pr-descriptions.test.ts`
- `test/unit/submit.test.ts`
- `test/unit/github-pr-gateway.test.ts`
- `test/support/pr-description.ts`
- Pi parity/extension tests under `test/pi/`
- any submit metadata/prewrite/transport unit tests located by symbol search

## Inherited evidence and revalidation

### Stable findings inherited from analysis

- `GithubPrGateway.editPr` already replaces complete title/body using `gh pr edit --body-file`; no new GitHub write seam is required.
- PR-description managed-region and fingerprint policy is concentrated in `pr-description-body.ts` and `pr-description-orchestration.ts`.
- Submit’s prewrite path mutates commits and requires a second readiness pass.
- Batch description generation currently interleaves generation and edits.
- Objective Runner has a distinct managed-region implementation that must remain untouched.
- No production `ship` command exists in Flow source/tests at the planning baseline.

### Volatile facts to revalidate

- Current branch/source SHA and whether trunk has advanced.
- Whether another branch has introduced `ship`, changed submit planning, or added consumers of `stablePatchIdForPr`, `PrCommitMessage.body`, metadata-amendment gateways, or exported PR-body helpers.
- Exact active Objective wording and latest Semantic Update.
- Current package test scripts and validation commands from `ts/AGENTS.md`.
- Availability and current instructions for `refactor-swarm` if used.

### Material open questions

None. Product semantics, compatibility posture, destructive behavior, provenance, confirmation, and batch preparation/application behavior were resolved during structured grilling.

## STOP conditions

Stop and report rather than improvising if:

1. A current production consumer outside Flow PR-description generation depends on `stablePatchIdForPr`, commit-body retrieval, metadata-amendment commands, or exported managed-body helpers in a way that would make deletion cross a separate capability boundary.
2. Post-submit inspection cannot reliably distinguish PRs created by this invocation from pre-existing PRs using the retained submit-plan evidence. Do not substitute “empty body,” markers, timestamps, or other heuristics.
3. A newly landed concrete `ns flow ship` implementation owns the same generation code, invalidating the explicit scope decision to ignore theoretical ship work.
4. GitHub application order or current gateway behavior cannot report applied/failed/not-attempted outcomes without introducing rollback or concurrent-write hazards; pause for a design decision rather than silently weakening the batch contract.

## Validation guidance

Follow root `AGENTS.md` and `ts/AGENTS.md`. Use relevant targeted tests while iterating, then broaden because this work touches shared submit orchestration, command schemas, gateways, Pi parity, docs, and Objective records.

Minimum expected focused checks include the rewritten PR-description and submit scenario/unit suites, for example through the repository-pinned pnpm version:

```bash
corepack pnpm@11.8.0 --config.verify-deps-before-run=false --dir ts exec vitest run \
  packages/capabilities/flow/test/scenario/regenerate-pr-command.test.ts \
  packages/capabilities/flow/test/scenario/submit-command.test.ts \
  packages/capabilities/flow/test/unit/pr-description.test.ts \
  packages/capabilities/flow/test/unit/pr-description-orchestration.test.ts \
  packages/capabilities/flow/test/unit/submit-pr-descriptions.test.ts \
  packages/capabilities/flow/test/unit/github-pr-gateway.test.ts
```

Adjust paths when files are deliberately deleted/renamed. Then run repository-standard TypeScript and formatting gates appropriate to the final changed-file set, normally including:

```bash
just ts-format-check
just ts-lint
just ts-check
just ts-test
just ts-test-integration
just ts-test-isolated
just ts-test-typescript-style-guard
just dprint-check
```

Run `just` as the default repository validation entrypoint before completion unless an unrelated baseline blocker prevents it. If formatting fails, use the prescribed autofixers (`just ts-format-fix` or `just dprint-fix`) and rerun checks.

Expected behavioral evidence:

- focused regeneration edits complete title/body and shows stable visible provenance;
- no model call or edit is skipped because an old fingerprint matches;
- `--force` and `--regenerate-descriptions` are rejected/absent from help;
- `--yes` provides explicit non-interactive approval;
- ordinary submit never edits pre-existing PR metadata;
- all new-PR drafts are prepared before the first edit;
- a preparation failure yields zero edits;
- an edit failure reports applied/failed/not-attempted without rollback;
- no metadata `gt modify` command runs and readiness is not reacquired for prose amendments;
- no removed marker/fingerprint/prewrite terminology remains outside intentional historical records.

## Risks and mitigations

- **Destructive overwrite surprises users.** Mitigate with explicit help and confirmation wording; require `--yes` non-interactively.
- **Other ns body content is erased.** This is intentional. Test it and state it rather than reintroducing preservation logic.
- **Brief Graphite-default metadata window.** Accepted consequence of post-submit-only generation; report generation failure clearly so the user can run `regenerate-pr` from the affected branch.
- **Partial GitHub application remains possible.** Prepare all drafts first, stop on first write failure, report exact outcomes, and avoid unsafe rollback.
- **Submit stack classification may be accidentally coupled to prewrite.** Preserve/retest `existingPrLinks` planning separately before deleting metadata-plan fields.
- **Prompt provenance can leak local paths.** Keep path-bearing prompt source data for diagnostics only; render stable classifications in PR bodies.
- **Large mechanical cleanup may hide semantic mistakes.** Use dependency-ordered core edits, bounded worker ownership for broad cleanup, targeted tests at the new interface, and a final stale-symbol grep.

## Review and remediation

Before declaring completion:

1. Re-read command help and confirmation as a user; verify “complete replacement” and data-loss implications are unmistakable.
2. Inspect actual body strings passed to the GitHub fake, not only result variants or snapshots. Confirm provenance is rendered text and no hidden marker remains.
3. Review batch tests to ensure they prove call ordering: all preparation before the first edit, zero edits on preparation failure, and stop/report behavior on edit failure.
4. Compare changed files against this scope. Investigate unrelated changes, especially to `pr-make-accountable`, Objective Runner publication, or Foundation managed-region code.
5. Read rewritten/deleted test assertions for meaningful behavioral coverage rather than trusting green output.
6. Run the stale-concept sweep and explain any intentional historical matches.
7. Rerun declared validation gates after formatter/autofix changes.
8. Document commands run, outcomes, and any unrelated baseline blockers.

If review finds that compatibility logic survived only to satisfy old tests, delete or rewrite those tests according to the resolved no-compatibility contract. If review finds a genuinely separate production consumer, honor the STOP condition and isolate that consumer before deleting its dependency.
