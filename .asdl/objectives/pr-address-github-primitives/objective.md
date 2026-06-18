# PR Address GitHub Primitives

## Thesis

Create narrow, agent-composable GitHub PR feedback primitives that can be used by `ts/packages/pr-address/src/download-feedback.ts` and a stack-oriented feedback variant without forcing agents, skills, or workflow code to hand-roll `gh api graphql` queries, pagination, JSON parsing, or review-thread mutations.

The primitives should reduce systemic complexity by making small GitHub operations reusable and testable. They should not merely push a specific Markdown prompt or one-off workflow behind a CLI command.

## Scope

- Define a low-level reusable primitive layer in `@asdl/core` for GitHub PR feedback interactions needed by PR-address workflows.
- Cover the specific operations currently required by `download-feedback` and the anticipated stack variant: PR lookup/details, review-thread page fetching and comment hydration, PR review bodies, discussion comments, and review-thread mutations such as resolving a thread when needed.
- Route `pr-address` through the shared primitive layer while preserving its package-local gateway boundary and workflow-specific selection/formatting behavior.
- Keep GraphQL text, `gh` invocation details, pagination, response parsing, and malformed-response handling in tested TypeScript source rather than in agent prompts or shell snippets.
- Preserve arbitrary agent composition above the primitive layer: callers should be able to combine the primitives into single-PR download, stack download, remediation, or follow-up flows without depending on a monolithic workflow API.
- Capture evidence about whether primitive-shaped CLI/API pushdown reduces repeated agent reasoning and systemic complexity, so a later Objective can evolve the CLI-pushdown documentation from evidence rather than preference.

## Non-Goals

- Do not build a monolithic `downloadFeedbackForPr` or `downloadFeedbackForStack` API as the primary abstraction.
- Do not make `pr-address` the global owner of all GitHub PR APIs.
- Do not broaden this Objective to all GitHub interactions such as checks, mergeability, landing, releases, or non-feedback PR lifecycle operations.
- Do not rewrite PR-address presentation, triage Markdown, or stack workflow policy except where needed to consume the primitives.
- Do not update CLI-pushdown documentation in this Objective unless a small note is needed as completion evidence; durable documentation evolution is parked for follow-on work.
- Do not add hidden registries, Objective state machinery, or execution policy sections to this planning-only Objective.

## Completion Criteria

- `@asdl/core` exposes a small, typed GitHub PR feedback primitive surface backed by `runGitHubCli()` or an equivalent shared GitHub CLI seam.
- The primitive surface returns structured success/failure values for normal GitHub/CLI/parse failures, including nonzero `gh` exits, startup errors, malformed GraphQL JSON, pagination defects, and mutation failures.
- Review-thread fetching/hydration and review-thread mutation GraphQL live in tested source modules, not in agent-facing shell snippets.
- `pr-address` consumes the shared primitives through its gateway or an adapter layer while keeping workflow-specific filtering and Markdown generation local to `pr-address`.
- `download-feedback` behavior remains compatible with its current single-PR use cases, and the resulting primitive shape can support a stack variant without duplicating GraphQL mechanics.
- Tests cover the new primitive layer, PR-address adapter behavior, and at least one evidence-producing composition path relevant to single-PR or stack feedback.
- Completion notes record concrete evidence about whether the primitive approach reduced duplicated command/query logic or simplified agent composition, and park any CLI-pushdown documentation follow-up with that evidence.

## Assumptions and Risks

Assumptions:

- `download-feedback` and the planned stack variant share enough GitHub PR feedback mechanics that a core primitive layer will be reused rather than becoming speculative infrastructure.
- `@asdl/core` is the right home for low-level GitHub PR feedback primitives because it already owns shared GitHub CLI execution helpers and PR gateway code, while higher-level workflow composition can remain in `pr-address` or CCC/package-specific code.
- Existing `pr-address` gateway types can be adapted incrementally without forcing a full package rewrite.
- A primitive API can stay small if it is shaped around current concrete operations rather than a comprehensive GitHub GraphQL client.

Risks:

- The abstraction may become too broad and drift toward a general GitHub SDK, increasing complexity instead of reducing it.
- Moving logic into `@asdl/core` may create unwanted dependency gravity if package-specific PR-address concepts leak downward.
- A stack feedback variant may need composition concerns that are not visible from `download-feedback` alone; the first primitive cut must leave room for arbitrary caller composition.
- Evidence about reduced systemic complexity may be too anecdotal unless completion notes explicitly compare before/after duplication, prompt burden, and test seams.

## Open Questions

- What is the smallest exported primitive set that supports both existing `download-feedback` behavior and the first stack feedback composition without overgeneralizing?
- Should review-thread resolution be part of the first primitive slice or follow immediately after read-side feedback primitives are extracted?
- What result and error vocabulary should the core primitive layer use so `pr-address`, skills, and future stack workflows can present failures consistently?
- What concrete evidence should be saved for the follow-on CLI-pushdown documentation Objective: duplicated command removal, lines of GraphQL removed from workflow code, simpler skill instructions, or agent-session examples?
