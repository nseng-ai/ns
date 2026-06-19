# Roaster Architecture Deepening

## Thesis

The roaster TypeScript CLI (`ts/packages/roaster`) has a deep, well-tested review-run surface (`review list`, `review run`). The friction concentrates downstream of it. An architecture-deepening pass surfaced four candidates, all framed in the deepening vocabulary (module, interface, seam, depth, leverage, locality) from the `codebase-design` skill (`.claude/skills/codebase-design/SKILL.md`), which the `improve-codebase-architecture` skill now routes to for its architecture vocabulary:

1. The **findings-publication** workflow now has one in-process publication interface (`publishFindings`) and one `roaster exec publish-findings` adapter for the CI path. The prior three-command/temp-file/double-parse workflow has been collapsed, with PR-level evidence that summary comments and inline status still render.
2. The core DTOs `ReviewDefinition`, `ReviewApplicability`, and `DiffFile`/`DiffChangeKind` now have one canonical source: Zod schemas and inferred types in `src/models.ts`. The parser, applicability, diff, operation, and test modules import those canonical DTO types rather than owning hand-written mirrors.
3. The per-invocation execution environment and CLI I/O are now captured once as a `RoasterContext`, and `createRoasterRuntime(context)` derives the operation-facing `RoasterRuntime` capability surface. Operation handlers receive `RoasterRuntime` and call work-shaped methods such as `ctx.localDiff.loadDiff({ baseRef })`, `ctx.harness.runReview(request)`, and `ctx.github.*(...)` without threading raw gateways, ambient process facts, or output adapters.
4. `RoasterFailure` carries rich structured payloads (`command`, `stderr`, `code`, `path`, `reviewKey`, `model`) but every seam consumes only `{ type, message }` — a depth mismatch that is either dead weight or latent capability.

This Objective tracks turning these candidates into actual depth: smaller interfaces, more leverage for callers, and locality for maintainers. Candidates #1, #2, and #3 have shipped; the strongest remaining next slice is #4, because the failure-union depth mismatch is now the last unresolved candidate.

## Scope

- **Candidate 1 — shipped: collapse the findings-publication pipeline into one end-to-end workflow.** The branch-local implementation deepens `src/findings-publication.ts` into `publishFindings(ctx, { prNumber, envelope, runUrl, ... })`, which parses the run envelope once, classifies and posts inline findings, renders the summary with inline status threaded in memory, and posts/updates the findings comment. The CI bash in `.github/workflows/roaster.yml` now streams the review envelope directly into one `roaster exec publish-findings` command. The old `post-inline-findings`, `format-findings-comment`, and `post-findings-comment` exec commands were removed rather than retained as compatibility wrappers; because roaster is unreleased/private and the known workflow caller moved in the same change, this is recorded as an accepted CLI compatibility break for the hidden exec surface.
- **Candidate 2 — shipped: one definition per DTO.** `src/models.ts` is now the single source of truth for `ReviewDefinition`, `ReviewApplicability`, and `DiffFile`/`DiffChangeKind`, with TypeScript types inferred from the Zod schemas. `src/review-definition.ts`, `src/review-applicability.ts`, and `src/diff-parsing.ts` import the canonical types and retain behavior only. The hand-written twins and the `cli-operations.ts` manual re-wrap spread are gone. `parseReviewDefinition` keeps its existing manual parse-error semantics, then asserts the assembled DTO against `reviewDefinitionSchema` as a programmer invariant.
- **Candidate 3 — shipped: capture the execution environment in the context.** `runCli` now creates or accepts a complete `RoasterContext` containing raw gateway dependencies, `{ cwd, env, signal }`, and CLI I/O, then derives an operation-facing `RoasterRuntime` through `createRoasterRuntime(context)`. Operation handlers call review catalog, local diff, harness, GitHub, stdin, and stderr capabilities through that runtime with work-shaped arguments only, and `publishFindings()` accepts the runtime plus semantic publication options. Raw gateway seams and tests remain intact behind the context for adapter isolation.
- **Candidate 4 — resolve the failure-union depth mismatch.** First confirm intent: are the unread structured fields forward-room or dead weight? Then either shrink `RoasterFailure` toward `{ type, message }` or deepen the seam to consume the structure (structured failure envelopes, exit codes derived from `code`, machine-readable diagnostics). Decide deliberately; do not leave it half-built.

Execution shape: implemented as one Graphite stack in priority order (1 → 2 → 3 → 4), updating the roadmap as each candidate lands.

The roadmap is an **open list**: deepening one candidate may surface adjacent shallowness in roaster; new rows may be added to `## Work` with a deletion-test argument recorded in this `## Scope` section.

## Non-Goals

- Speculative new gateways or seams. The two-adapter rule applies: don't introduce a seam unless something actually varies across it.
- Changing roaster's diff-parser dependency boundary. ADR 0007 (Roaster Shared Diff Parser, `@pierre/diffs`) stands; candidate 2 reuses roaster's existing `DiffFile` DTO and does not reopen the parser decision.
- Changing the user-facing `review list` / `review run` command contracts, output schemas, or the clinkr machine-envelope format.
- Changing what roaster reviews find (review semantics, prompts, model selection, applicability matching behavior).
- Unrelated refactors discovered along the way (renames, dependency bumps, doc tidying) — those go to their own PRs.
- Other roaster Objectives' territory: the TypeScript port, addressing engine, Graphite stack workflow, and prior thermo-review followups.

## Completion Criteria

Every candidate on the roadmap reaches a definite state:

- **shipped** — the deepening landed and the tests target the new (smaller) interface;
- **parked-with-reason** — explicitly moved to `## Parked` with a one-line reason;
- **rejected-with-ADR** — a `docs/adr/` entry records why the candidate was the wrong shape, so future review passes don't re-suggest it.

Closure requires that no candidate is in an indeterminate state, and that candidate 1 specifically has an end-to-end test exercising the full publication workflow through one interface. Candidates added mid-flight (open-list rule) extend the bar; they do not get a free pass.

Expected evidence per shipped candidate: targeted TS tests plus the full TS validation suite passing (`pnpm --dir ts run test` and `pnpm --dir ts run check`, or `just ts-test`). For candidate 1, evidence includes a roaster CI run on a real PR rendering findings as before.

## Assumptions and Risks

Assumptions:

- The findings-publication workflow's known external consumer is the roaster GitHub Actions workflow (`.github/workflows/roaster.yml`). Candidate 1 resolved the earlier compatibility question by replacing the three user-invocable hidden `exec` commands with one `publish-findings` command and updating the workflow in the same branch; this is an accepted break for the unreleased/private hidden exec surface.
- The three duplicated DTOs proved to be the same concept in each home; candidate 2 unified them into a single source of truth in `models.ts` without changing user-facing review semantics.
- The unread structured fields on `RoasterFailure` are not consumed anywhere outside the roaster package (e.g. by a downstream parser of roaster output). To be verified as the first step of candidate 4.

Risks:

- **CI behavior regression (candidate 1) — de-risked but still worth watching:** the collapsed publication path has scenario coverage, passing TypeScript CI, and real PR evidence from PR #1823 showing roaster summary comments with inline posting status and activity-log updates. Continue watching review feedback for regressions until the branch lands.
- **Lost per-step CI observability (candidate 1) — mitigated:** the single adapter writes concise publication diagnostics (`inline findings: ...`, summary action) while the workflow still prints the original roaster envelope.
- **Schema/type drift during unification (candidate 2) — de-risked:** field-by-field comparison found the hand-written and Zod shapes equivalent aside from readonly-array type decoration. The shipped slice removed the duplicate type owners, added a final parser schema assertion, and passed targeted roaster tests plus full TypeScript validation.
- **Environment capture timing (candidate 3) — de-risked:** the shipped context/runtime split captures invocation facts at `runCli` time in `RoasterContext`, not inside individual gateway adapters, while `createRoasterRuntime(context)` keeps operation handlers on a narrow capability surface. The cancellation decision is resolved: optional `CliDeps.signal` enters the same run context and is forwarded by the runtime to raw gateways that already support it.
- **Candidate 4 premature shrink:** removing fields that were intentional forward-room would have to be re-added later. The "confirm intent first" step is the mitigation; this candidate may legitimately resolve to parked-with-reason.

## Open Questions

- Candidate 1 command shape is resolved: the branch uses one new `roaster exec publish-findings` command and updates the CI workflow in the same change, without compatibility wrappers for the three old hidden exec commands.
- Candidate 4: shrink or deepen? Resolved during the candidate-4 decide step, recorded as an update (and an ADR if deepen is rejected).
- Candidate 2 module placement is resolved for now: the canonical DTO schemas and inferred types remain in `models.ts`; no dedicated schema module was needed for this slice.
