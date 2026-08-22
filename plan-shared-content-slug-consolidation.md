# Handoff: Plan shared file-to-slug consolidation

Continuation focus: Plan a consolidation of semantic slug creation from file content and reuse the resulting capability across ns.

## Context

PR #4269 on branch `handoff-content-slug-cli` moved Handoff content-derived slugging into the portable CLI. During review, we identified that ns already has several related model-backed slug paths: Handoffs, Branch Context plan files, Saved Plan filenames, Herdr resource labels, and Flow/autobranch naming. The next session should determine which of these are genuinely the same file/content-to-semantic-slug capability and design the smallest coherent shared surface without erasing domain-specific policy.

## Current State

- PR #4269 is submitted at https://github.com/nseng-ai/ns/pull/4269.
- Handoffs now supports `ns handoff exec derive-slug [--file <path>]`; omitted `--file` reads stdin.
- `ns handoff create` atomically reads final Markdown, derives a Handoff-specific slug, collision-checks, stores the exact bytes, and returns model and durable-reference evidence.
- Shared mechanics already live in `@nseng-ai/extension-kit/content-slug` as a variant-driven API.
- Branch Context reads a plan file and derives a branch-context slug; Plans derives a saved-plan filename slug from in-memory content; Herdr derives labels from descriptions; Flow has separate model-slug paths based on changes and commits.
- The exported Node project-config adapter was changed from an import-time singleton to `createNodeProjectConfigGateway()`, and the TypeScript standards now discourage import-time singleton collaborators.
- The former upstack `handoff-self-observer` branch and PR #4270 were abandoned, closed, and deleted.
- The working tree was clean when this handoff was created.

## Decisions / Findings

- Distinguish generic mechanics from domain policy. The shared kit owns model invocation, prompt assembly, truncation, normalization, and evidence, while each domain currently owns prompt wording, validation, suffix stripping, word limits, and output identity.
- The closest existing analogue to Handoff file-to-slug is Branch Context's plan-file wrapper. Saved Plans uses the same content machinery but receives content in memory.
- A domain-neutral CLI such as `ns content-slug derive --file ...` does not currently appear to exist. Do not assume that exposing one is preferable to keeping domain-owned command faces.
- Flow/autobranch slugging may not belong in the same consolidation because its input is a change/commit snapshot rather than an arbitrary content file and it has fallback behavior.
- The active `centralize-layered-project-config` Objective is relevant: new config access should converge on its future invocation-scoped API rather than deepen direct low-level `ProjectConfigGateway` use.
- Planning should decide whether the reusable capability is an in-process API, a portable command, a source-reader abstraction, or a combination. Avoid creating a broad abstraction based only on similar names.

## Next Steps

1. Load active Objective orientations and inspect whether the proposed work overlaps an active Objective, especially `centralize-layered-project-config`.
2. Inventory all production semantic-slug derivation call sites and classify each by input source, domain policy, model selection/config access, normalization, validation, fallback behavior, evidence, and command exposure.
3. Compare Handoffs, Branch Context, Saved Plans, Herdr, Flow/autobranch, and tracked-branch payload behavior. Explicitly separate file reading from content slugging.
4. Decide the desired consolidation boundary and vocabulary. Preserve domain-specific variants and avoid a lowest-common-denominator API.
5. Determine whether a generic file/stdin command is actually needed by multiple consumers or whether a shared in-process operation plus domain commands is the deeper interface.
6. Produce a reviewed implementation plan with coherent landing batches, migration order, tests, documentation, and any compatibility or package-boundary implications. Do not implement before the plan is reviewed.

## Investigation Sources

- Source session ID: 01a029a2-eca7-7b03-b4c4-a55588df929e
- Source session log: /Users/schrockn/.pi/agent-ns-dev/sessions/--Users-schrockn-.local-state-ns-slots-repos-ns-worktrees-slot-03--/2026-08-22T13-22-18-407Z_01a029a2-eca7-7b03-b4c4-a55588df929e.jsonl
- Related files:
  - `ts/packages/public/extension-kit/src/kit/content-slug.ts` — shared variant-driven content-slug mechanics.
  - `ts/packages/incubating/extensions/handoffs/src/core/content-slug.ts` — Handoff-specific slug policy and model configuration.
  - `ts/packages/incubating/extensions/handoffs/src/core/operations/derive-slug.ts` — current file/stdin-to-Handoff-slug operation.
  - `ts/packages/incubating/extensions/handoffs/src/core/operations/create.ts` — atomic derive, collision-check, and persistence flow.
  - `ts/packages/incubating/extensions/branch-context/src/core/plan-content-slug.ts` — existing plan-file-to-branch-context-slug wrapper.
  - `ts/packages/incubating/extensions/plans/src/content-slug-derivation.ts` — Plans wrapper over the shared kit.
  - `ts/packages/incubating/extensions/plans/src/saved-plan-content-slug.ts` — saved-plan filename policy over in-memory content.
  - `ts/packages/incubating/hosts/pi/extensions/pi-ns-herdr/src/pi/resource-label.ts` — Herdr semantic-label variant.
  - `ts/packages/incubating/extensions/flow/src/autobranch/slug.ts` — separate change/commit-driven branch slug behavior.
  - `ts/packages/public/sdk/src/project-config/points.ts` — project-config gateway factory currently used by model-policy consumers.
  - `.ns/objectives/centralize-layered-project-config/orientation.md` — standing direction for configuration access.
  - `.ns/objectives/centralize-layered-project-config/objective.md` — scope and constraints for the active config consolidation.
  - `skills/internal/typescript/typescript-style/core-rules.md` — updated composition-time collaborator construction standard.
  - `docs/wayfinding/ontology-reshape/vocab-sweep-capabilities.md` — inventory language for Plan and Handoff content-derived slugs.

## Useful Commands / Files

- PR: https://github.com/nseng-ai/ns/pull/4269
- Current branch: `handoff-content-slug-cli`
- Resume inventory search:
  `rg -n 'deriveKitContentSlug|deriveContentSlug|derive.*Slug|MODEL_OPERATION_IDS\\.slug' ts/packages`
- Load active directions:
  `ns objective exec load-orientations --format md`
- List active Objectives:
  `ns objective list`
- Inspect the Handoff derivation command:
  `ns handoff exec derive-slug --help`
