# PR Address GitHub Primitives

## Thesis

Create narrow, agent-composable GitHub PR feedback primitives that can be used by `ts/packages/pr-address/src/download-feedback.ts` and a stack-oriented feedback variant without forcing agents, skills, or workflow code to hand-roll `gh api graphql` queries, pagination, JSON parsing, or review-thread mutations.

The primitives should reduce systemic complexity by making small GitHub operations reusable and testable. They should not merely push a specific Markdown prompt or one-off workflow behind a CLI command.

## Scope

- Define a low-level reusable primitive layer in `@asdl/core` for GitHub PR feedback interactions needed by PR-address workflows.
- Cover the specific operations currently required by `download-feedback` and the anticipated stack variant: PR lookup/details, review-thread page fetching and comment hydration, PR review bodies, discussion comments, and review-thread mutations such as replying to and resolving a thread when needed.
- Route `pr-address` through the shared primitive layer while preserving its package-local gateway boundary and workflow-specific selection/formatting behavior.
- Keep GraphQL text, `gh` invocation details, pagination, response parsing, and malformed-response handling in tested TypeScript source rather than in agent prompts or shell snippets.
- Preserve arbitrary agent composition above the primitive layer: callers should be able to combine the primitives into single-PR download, stack download, remediation, or follow-up flows without depending on a monolithic workflow API.
- Capture evidence about whether primitive-shaped CLI/API pushdown reduces repeated agent reasoning and systemic complexity, so a later Objective can evolve the CLI-pushdown documentation from evidence rather than preference.
- Keep Objective evidence self-contained: external PRs, review threads, transcripts, or issues may be cited as provenance breadcrumbs, but the durable Objective should inline the facts, mechanics, and decisions needed by a future implementation session without requiring readers to open those links.

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
- Review-thread fetching/hydration and review-thread mutation GraphQL, including thread reply and resolve mutations, live in tested source modules rather than agent-facing shell snippets.
- `pr-address` consumes the shared primitives through its gateway or an adapter layer while keeping workflow-specific filtering and Markdown generation local to `pr-address`.
- `download-feedback` behavior remains compatible with its current single-PR use cases, and the resulting primitive shape can support a stack variant without duplicating GraphQL mechanics.
- Tests cover the new primitive layer, PR-address adapter behavior, and at least one evidence-producing composition path relevant to single-PR or stack feedback.
- Completion notes record concrete evidence about whether the primitive approach reduced duplicated command/query logic or simplified agent composition, and park any CLI-pushdown documentation follow-up with that evidence.
- Objective updates and completion notes that cite motivating PRs or external discussions inline enough context that those references serve as provenance rather than required reading.

## Assumptions and Risks

Assumptions:

- `download-feedback` and the planned stack variant share enough GitHub PR feedback mechanics that a core primitive layer will be reused rather than becoming speculative infrastructure.
- `@asdl/core` is the right home for low-level GitHub PR feedback primitives because it already owns shared GitHub CLI execution helpers and PR gateway code, while higher-level workflow composition can remain in `pr-address` or CCC/package-specific code.
- Existing `pr-address` gateway types can be adapted incrementally without forcing a full package rewrite.
- A primitive API can stay small if it is shaped around current concrete operations rather than a comprehensive GitHub GraphQL client.
- PR review-thread triage commonly needs separate primitives for replying to a thread and resolving it; a workflow may compose those primitives, but the core layer should not collapse them into one PR-address-specific remediation workflow.
- The motivating review-thread mutation case is representative: an agent may need to reply to several inline review threads with different per-thread bodies, then resolve each thread. The core primitive layer should expose the individual mutation operations and their typed results, while leaving batching, classification, and “accept vs defer” policy to the caller.

Risks:

- The abstraction may become too broad and drift toward a general GitHub SDK, increasing complexity instead of reducing it.
- Moving logic into `@asdl/core` may create unwanted dependency gravity if package-specific PR-address concepts leak downward.
- A stack feedback variant may need composition concerns that are not visible from `download-feedback` alone; the first primitive cut must leave room for arbitrary caller composition.
- Evidence about reduced systemic complexity may be too anecdotal unless completion notes explicitly compare before/after duplication, prompt burden, and test seams.
- If Objective evidence is recorded only as PR numbers or external links, future agents will have to rediscover the context manually and may miss the intended primitive shape; mitigate by inlining the observed mechanics and decisions in Objective prose.

## Open Questions

Resolved by the implementation slice:

- The first exported primitive set covers PR lookup/details, open PR listing, PR-level reviews, hydrated review threads, discussion comments, review-thread reply, and review-thread resolution. Stack feedback can continue composing these primitives without a monolithic stack API.
- Review-thread reply and resolution shipped in the first primitive slice as separate operations, not a combined workflow.
- The core result vocabulary is `Result<T, GithubPrFeedbackFailure>` with stable failure codes for `gh` failures, startup failures, JSON parse failures, response validation failures, GraphQL errors, and pagination defects.
- Follow-on CLI-pushdown documentation evidence should emphasize mechanics moved into tested primitives, the hidden primitive exec surface, and the partial reply-success / resolve-failure composition test.

## Closure

Completed by the shared GitHub PR feedback primitive implementation. `@asdl/core/github-pr-feedback` now owns PR feedback `gh`/GraphQL command construction, response validation, hydrated review-thread pagination, discussion/review parsing, and separate reply/resolve review-thread mutations. `pr-address` consumes that layer through an adapter while preserving downloader filtering and Markdown policy, and hidden `pr-address exec` primitive commands expose structured read/mutation operations for agents without restoring retired workflow machinery.

Evidence: the full TypeScript typecheck, legacy typecheck, lint, formatting check, and Vitest suite passed; targeted `asdl-core`, `pr-address`, and `pi-extensions` PR feedback tests passed. Parked follow-ups remain outside this Objective: evolve CLI-pushdown documentation from this evidence, broaden GitHub primitives beyond PR feedback only if a later Objective asks for it, and avoid replacing every package-local GitHub gateway with a universal client by default.
