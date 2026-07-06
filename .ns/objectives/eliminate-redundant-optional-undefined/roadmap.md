# Roadmap

## Work

- [x] Consolidate tracking into one open Objective.
      Created this canonical follow-up record so agents do not choose between reopening the closed normalization Objective, following the original five-PR branch-context plan literally, or adopting a separate hard-enforcement interpretation. The closed Objective (`.ns/objectives/normalize-optional-undefined-boundaries`) remains precedent; this Objective owns active follow-up tracking.

- [x] Deliver the initial branch-local continuation slice.
      The packagechk / GitHub PR feedback / pr-feedback-watch / preview-checks / worktree-status cleanup stack landed as merged PRs #2420, #2423, #2428, and #2429 (merged 2026-06-30). It provided the seed evidence for the standing loop and proved the process of classifying candidates, narrowing internal shapes, preserving compatibility surfaces, and validating touched TypeScript.

- [x] Drive the known raw optional-undefined inventory to zero.
      Completed 2026-07-01: the repo-wide raw count reached 0 after the campaign worked through internal option/result/helper shapes across capabilities, infra, hosts, and tools, and resolved the final residual groups by converting public SDK command/execution fields to typed `ExplicitUndefined<"public-api-compatibility", T>` contracts (mechanism in `ts/packages/infra/foundation/src/primitives/primitives.ts`; the SDK surfaces now live at `ts/packages/kernel/src/sdk/`). See `updates/2026-07-01T034508Z-final-raw-optional-undefined-resolution.md`. Zero is a milestone, not an enforcement decision.

- [~] Continuously classify or remove reintroduced raw optional-undefined candidates.
  Policy: `objective-next` may autonomously inventory, classify, edit, validate, and record review-substantive local cleanup slices under the Objective's Runner Policy. Start each run by re-running `tools/measure-objective.mjs`; do not revisit the exhausted pre-zero cluster inventory (worktree-status, pr-previews, pr-feedback-watch, GitHub PR feedback parser, Roaster/SDK/GitHub residual groups) without new evidence. Prefer internal result, diagnostic, presentation, durable-record, and helper-only types when construction evidence shows absence is modeled by omission; convert compatibility-significant surfaces to typed `ExplicitUndefined` contracts with a precise reason. Avoid public/input/options/dependency/environment/signal/external-schema surfaces unless a normalized internal boundary justifies the narrowing.
  Evidence: repo-wide (`ts`) and scoped before/after tool scorecards, changed fields, semantic claim, preserved/deferred categories, construction-path notes, and relevant TypeScript validation. Every kept cleanup update should include the repo-wide before/after scorecard, even for a narrow slice. When a slice becomes a PR, put both repo-wide and scoped before/after metrics and their measurement scopes in the PR description.
  Current state (verified 2026-07-06 on `post-zero-optional-undefined-cleanup-classification`): repo-wide (`ts`) raw count is 3 after the brmem namespace helper, GitHub PR feedback normalizer helper, and areg-test helper omission-only cleanups. The remaining raw candidates are classified preserves: the `next?: undefined`/`stackEnd?: undefined` discriminants of the `MergeNumberedBranchOptions` union in `ts/packages/capabilities/flow/test/unit/land-stack-command-scenarios.test.ts`, and `readonly load?: undefined` on `PreinstalledNsCommandPackageCatalogEntry` in `ts/packages/kernel/src/extensions/registry.ts`. Scorecard: 96 typed contracts, 0 legacy markers, and 2609 normalization/check lines.

- [~] Maintain reusable candidate-classification and metric knowledge.
  Record durable findings about recurring preserved categories, safe normalization patterns, ruled-out approaches, and how the progress metrics should be interpreted for recurring boundaries. The measurement instrument and its classification artifacts live in this record's `tools/` directory (`measure-objective.mjs`, `classification.json`, `classification-report.md`). Do not write per-run logs; record only knowledge that changes future runner behavior, explains kept progress, or changes the measurement model.

- [~] Keep review slices coherent, review-substantive, and coarser than tiny trickles.
  Execution granularity and review granularity are different: autonomous runs may make small, reversible, locally validated edits or checkpoints while exploring, but PRs should usually aggregate those steps into a coherent review-substantive unit. Prefer package/subsystem-level clusters when nearby candidates share the same semantic boundary. As a default minimum, keep inventorying/classifying and include adjacent safe candidates until the PR has at least 10 substantive edit sites / touched lines attributable to the optional-undefined cleanup. Do not open standalone PRs for one trivial field, one tiny helper, or one incidental cluster when adjacent candidates can be safely classified and included. If an inventory suggests unrelated clusters, choose one cluster rather than batching by syntax. If a slice grows broad, stop and record the split/narrowing rationale. A smaller PR is acceptable only when the semantic boundary is genuinely exhausted (the normal case in the post-zero phase when the reintroduced inventory is small), the diff is independently review-substantive, or nearby candidates are explicitly unsafe/unrelated. Do not batch unrelated optional-undefined edits just to make a PR bigger.

- [~] Gather lessons for making autonomous Objectives work well.
  Maintain `autonomous-objective-lessons.md` with reusable lessons from objective-autopilot style runs: objective-function design, PR-level metric evidence, slice sizing, temporary normalization debt, semantic stop conditions, and candidates for shared SDL automation. Keep it as durable design learning, not a per-run log.

- [ ] Periodically consider whether a hard guard / allowlist deserves a separate Objective.
      Do not implement enforcement in this Objective unless explicitly approved. If autonomous cleanup repeatedly finds the same accidental pattern and a guard would prevent recurrence, record the evidence and recommend a separate bounded Objective. The post-zero reintroduction rate (6 raw candidates across four files within five days of the 2026-07-01 zero milestone, roughly half of them legitimate discriminated-union discriminants rather than debt) is relevant evidence for that future recommendation.

## Parked

- [ ] Repo-wide hard enforcement / allowlist campaign.
      Parked until explicitly approved. This standing Objective deliberately remains semantic and incremental rather than a blanket zero-count target.
