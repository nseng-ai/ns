# Roadmap

## Work

- [x] Retire flow's local text-generation type copy: delete
      `ts/packages/capabilities/flow/src/submit/text-generation.ts` and switch its
      three importers (`pr-description.ts`, `pr-description-orchestration.ts`,
      `submit/index.ts`) to `@nseng-ai/capability-kit/text-generation`.
      `selectPrDescriptionModelRef` / `PR_DESCRIPTION_MODEL_ENV` /
      `DEFAULT_PR_DESCRIPTION_MODEL_REF` stay local in flow (selector-family move
      is Parked).
  - Policy: direct execution; grep-verify no additional importers first.
  - Evidence: `pnpm --dir ts --filter @nseng-ai/flow run check`,
    `pnpm --dir ts --filter @nseng-ai/flow run test`, and `just` passed on
    local branch `capability-kit-promotions/flow-text-generation`.
- [x] Swap ccc branch-slug onto kit model-slug mechanics: pin — add a small
      raw-text sibling helper beside `deriveSlugWithModel` in
      `capability-kit/src/kit/model-slug.ts` (same env model override and
      killed-result retry, no slug normalization), then replace
      `buildGptNanoTextArgs`/`runGptNanoText` in
      `ts/packages/capabilities/ccc/src/cmux/branch-slug.ts` with kit calls. Slug
      and plan-summary prompt text stays in ccc.
  - Policy: direct execution within the pinned helper shape; steer first if
    the helper wants any other new kit export.
  - Evidence: `pnpm --dir ts --filter @nseng-ai/capability-kit test`,
    `pnpm --dir ts --filter @nseng-ai/ccc test`, `pnpm --dir ts run check`,
    and `just` passed on local branch
    `capability-kit-promotions/ccc-raw-text-helper`.
- [x] Migrate objectives picker/selection-flow git parsing onto kit `git`:
      pin — extend `statusPaths` with an optional pathspec filter and add a
      rename-aware `changedPathsUnder` variant, then replace
      `parseObjectiveStatusChangedSlugs` and the raw `host.exec("git", ...)`
      calls in `ts/packages/capabilities/objectives/src/core/objective-picker.ts`
      and `core/objective-selection-flow.ts`. Preserve `-- .ns/objectives`
      scoping, `-M` rename detection collecting both old and new paths, and the
      picker's advisory swallow-errors-return-`[]` semantics.
  - Policy: direct execution; steer first if the extension proves
    non-additive or the Pi exec-seam gateway wiring needs a new adapter.
  - Evidence: `pnpm --dir ts run check`, `pnpm --dir ts run lint`, targeted
    Vitest covering capability-kit git and objectives picker/Pi tests, and
    `just` passed on local branch
    `capability-kit-promotions/objectives-kit-git`.
- [x] Replace handoffs' raw branch resolution: drop the `pi.exec("git",
  ["branch", "--show-current"])` reimplementation in
      `ts/packages/capabilities/handoffs/src/pi/branch-resolution.ts` in favor of
      `GitGateway.currentBranch` via the `RealGitGateway` already constructed in
      `handoffs/src/pi/api-context.ts`. Handoff-worded detached-HEAD recovery
      messages stay in handoffs.
  - Policy: direct execution.
  - Evidence: targeted handoffs Pi tests, `pnpm --dir ts run check`,
    `pnpm --dir ts run fmt:check`, `pnpm --dir ts run lint`, and `just`
    passed on local branch
    `capability-kit-promotions/replace-handoffs-branch-resolution`.
- [x] Drop slots' local JSON parse helper: delete
      `ts/packages/capabilities/slots/src/core/json.ts` (`parseJsonObject`) and
      consume kit `parseJsonUnknown` from its current
      `capability-kit/github/graphql-json` home in `core/gateways/pr.ts` and
      `lifecycle/operations/gt/exec/quiescence.ts`, adapting the failure shape at
      the call sites. No rehoming of the kit export (Parked).
  - Policy: direct execution.
  - Evidence: `pnpm --dir ts --filter @nseng-ai/slots test`,
    `just ts-check`, `just`, and grep verification that slots has no remaining
    `parseJsonObject`/`core/json` references passed on local branch
    `capability-kit-promotions/drop-slots-json-helper`.

Second wave (Tier 2 rows pulled from Parked 2026-07-05, ranked by impact):

- [x] Extend kit `git` with operation-in-progress/worktree-admin detection:
      pin — one kit module covering marker-file detection (`MERGE_HEAD`,
      `CHERRY_PICK_HEAD`, `REVERT_HEAD`, `rebase-merge`/`rebase-apply`, bisect),
      `gitdir:` file resolution / `--git-common-dir` admin-dir resolution, and
      `@{-1}` previous-branch lookup. Replace the triplicate implementations:
      the marker table and rebase head-name recovery in
      `ts/packages/capabilities/slots/src/core/gateways/repository.ts`, the
      `InProgressGitOperation` union plus `detectInProgressOperation` /
      `resolveGitPath` in
      `ts/packages/capabilities/flow/src/land/stack/stack-facts.ts`, and the
      equivalent detection in
      `ts/packages/hosts/pi/src/worktree-status/status.ts`. Consumer-facing
      labels/messages (e.g. flow's `formatInProgressOperationLabel` wording)
      stay local.
  - Policy: direct execution; steer first if the three consumers' operation
    taxonomies genuinely diverge (e.g. slots' rebase head-name recovery does
    not generalize), if the kit `git` extension proves non-additive, or if
    the hosts/pi exec-seam wiring needs a new adapter.
  - Evidence: `pnpm --dir ts --filter @nseng-ai/capability-kit test`,
    `pnpm --dir ts --filter @nseng-ai/slots test`,
    `pnpm --dir ts --filter @nseng-ai/flow test`,
    `pnpm --dir ts --filter @nseng-ai/pi test`,
    `pnpm --dir ts --filter @nseng-ai/ccc test`, `just ts-check`, `just`, and
    grep verification for retired duplicate symbols passed on local branch
    `kit-git-worktree-state-consolidation`.
- [ ] Promote the content-slug derivation layer beside kit `model-slug`:
      pin — generalize
      `ts/packages/capabilities/plans/src/content-slug-derivation.ts`
      (`deriveContentSlug`, `buildContentSlugPrompt`, output normalization,
      truncation, `MAX_PLAN_CONTENT_CHARS`) into a kit module parameterized
      by the existing `ContentSlugDerivationVariant` shape; collapse
      `ts/packages/capabilities/handoffs/src/pi/content-slug.ts` to a variant
      config. Handoff-specific validation wording
      (`validateHandoffContentSlug`) stays in handoffs if not generalizable.
  - Policy: direct execution; steer first if the handoffs variant needs more
    than variant-config parameterization or wants any other new kit export.
- [ ] Extract GitHub REST comment mechanics into a kit `github` subpath:
      pin — move paginated comment reads, inline-review create,
      discussion-comment POST/PATCH, and marker-based sticky-comment upsert
      out of `ts/packages/capabilities/reviews/src/gateways/github.ts`
      (`RoasterGitHubGateway` real + fake) into kit `github` with real/fake
      parity; migrate the second consumer,
      `ts/packages/internal/pi-tools/src/pr-feedback-watch`. Roaster-specific
      result envelopes and wording stay in reviews (the `RoasterResult`
      refactor remains out of scope).
  - Policy: direct execution for an additive extraction; steer first if the
    kit surface wants to absorb Roaster-specific envelopes or if
    pr-feedback-watch's needs force a different contract.

## Parked

Tier 2 — new kit modules with proven multi-consumer duplication (pull into
Work deliberately, one row at a time):

- [ ] Fold git output classification into kit `git`
      (`flow/src/submit/git-operation-output.ts` + slots lifecycle conflict
      needles) and consolidate the newline-mode porcelain parser
      (`flow/src/changes/git-porcelain.ts`) with kit `git/status-paths.ts` —
      careful: they parse different modes (`-z` vs newline).
- [ ] Promote PR-link/Graphite URL parsing (`flow/src/submit/gt-output.ts`;
      duplicated in `pr-feedback/src/core/feedback-summary.ts`) to a kit
      `graphite` subpath.
- [ ] Promote the JSON-input loader (`pr-feedback/src/json-input.ts`:
      one-of `--option`/`--file`/stdin + zod + prettified errors) as a new kit
      leaf; migrate reviews' two hand-rolled equivalents in
      `cli-operations.ts`.
- [ ] Introduce a result-typed fs gateway (real + fake) unifying
      `objectives/src/core/real-storage.ts`, `plans/src/plan-store-gateway.ts`,
      and reviews' ad-hoc readdir/stat.
- [ ] Add a shell-install handler factory to kit `shell-support` collapsing
      the near-identical flows in `slots/src/ns/extension.ts` and
      `kernel/src/cli/shell.ts` (crosses the allowlisted kernel→kit debt edge).
- [ ] Smaller multi-site helpers, foundation-vs-kit per ADR 0018:
      exec+machine-envelope runner (ccc, objectives, hosts/pi, nscc), repo-name
      derivation (ccc + hosts/pi), path-segment sanitizer / `gh--owner--repo`
      store keys (plans + reviews), repoRoot/trunk fallback (objectives ×2,
      retros, areg), `relativeTime`, `defineFailureCatalog`.

Tier 3 — gated on a design decision before any code moves:

- [ ] Namespaced brmem artifact store + GC + shared context assembly
      (`handoffs/src/core/artifact-storage.ts`,
      `branch-context/src/core/branch-memory.ts`, three context factories) —
      gated on the brmem layering decision (kit dep vs `@nseng-ai/brmem` as
      host).
- [ ] Promote retros' payload-artifact store (`retros/src/payloads/*`,
      ~800 LOC, sole implementation of the repo-wide `NS_PAYLOAD_ROOT` contract)
      — placement via ADR 0018 buckets (kit vs dedicated package).
- [ ] Lift branch→PR resolution/mapping (`pr-feedback/src/core/pr-target.ts`,
      `branch-pr-mapping.ts`; slots re-implements on raw `gh`) — gated on an ADR
      0016 PR-Address-seam decision.
- [ ] Anticipatory single-consumer gateways (flow `github-pr-gateway.ts`,
      reviews' Claude Code headless harness, slots diagnostics JSONL runner,
      graphite stack-walk/integrity renderers, clipboard gateway) — per ADR 0019,
      wait for a triggering second consumer.
- [ ] Pi slash-command arg tokenizing (seven packages) and Pi session-JSONL
      parsing (foundation, pi-tools, retros) — likely belong on the Pi surface /
      foundation, not the kit; needs a placement decision.
- [ ] Deferred kit-surface tidies from Tier 1: move flow's
      `selectPrDescriptionModelRef` into the kit selector family; rehome
      `parseJsonUnknown` off `github/` to a neutral subpath.
- [ ] Route `flow/src/land/stack/worktrees.ts`'s embedded slots-path
      knowledge (`isManagedSlotPath`, slot-name regexes) through the slots API —
      cross-capability coupling fix, not kit work.
