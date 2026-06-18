# Roaster Architecture Deepening

## Thesis

The roaster TypeScript CLI (`ts/packages/roaster`) has a deep, well-tested review-run surface (`review list`, `review run`). The friction concentrates downstream of it. An architecture-deepening pass surfaced four candidates, all framed in the deepening vocabulary (module, interface, seam, depth, leverage, locality) from `.claude/skills/improve-codebase-architecture/LANGUAGE.md`:

1. The **findings-publication** workflow now has a pure helper module and tests for the individual `exec` commands, but the end-to-end CI publication path is still glued across three commands by a temp file and a doubly-parsed run envelope. The remaining depth opportunity is to make one in-process publication workflow the tested interface.
2. Three core DTOs (`ReviewDefinition`, `ReviewApplicability`, `DiffFile`) each exist twice — a hand-written interface and a Zod schema — kept in sync by hand and bridged by a manual spread at a call site.
3. The per-invocation execution environment (`cwd`, `env`, and gateway-level cancellation support) is ambient to a roaster run yet represented outside the gateway context: handlers repeatedly pass `{ cwd, env }`, while lower gateway seams already accept `signal` in several places. This sits on top of a `RoasterCliContext` that wraps `RoasterContext` (the `ctx.context.X` double hop).
4. `RoasterFailure` carries rich structured payloads (`command`, `stderr`, `code`, `path`, `reviewKey`, `model`) but every seam consumes only `{ type, message }` — a depth mismatch that is either dead weight or latent capability.

This Objective tracks turning these candidates into actual depth: smaller interfaces, more leverage for callers, and locality for maintainers. The strongest and first is #1 — not because there is no code module at all anymore, but because the riskiest path still lacks one end-to-end publication interface that matches the CI behavior.

## Scope

- **Candidate 1 — collapse the findings-publication pipeline into one end-to-end workflow.** Reuse or deepen the existing `src/findings-publication.ts` helpers into one in-process publication operation (working name `publishFindings(ctx, { prNumber, envelope, runUrl })`) that parses the run envelope once, classifies and posts inline findings, renders the summary comment with inline status threaded in memory, and posts/updates the findings comment. The three existing `exec` commands either collapse to one thin `roaster exec publish` adapter or remain compatibility wrappers over the new operation. The CI bash in `.github/workflows/roaster.yml` should shrink accordingly. Files in play: `src/operations/cli-operations.ts`, `src/findings-publication.ts`, `src/cli.ts`, `.github/workflows/roaster.yml`, and the existing findings-publication/exec tests.
- **Candidate 2 — one definition per DTO.** Make the Zod schemas in `src/models.ts` the single source of truth for `ReviewDefinition`, `ReviewApplicability`, and `DiffFile`/`DiffChangeKind`; infer the TypeScript types; have `src/review-definition.ts`, `src/review-applicability.ts`, and `src/diff-parsing.ts` import the canonical types. Delete the hand-written twins and the manual re-wrap spread in `cli-operations.ts`.
- **Candidate 3 — bind the execution environment into the context.** Bind `cwd`/`env` once at `runCli`, decide whether cancellation should also enter through the same bound run environment, and flatten the two context records so handlers call gateways with work-shaped arguments only (e.g. `ctx.localDiff.loadDiff({ baseRef })`). Remove the repeated `{ cwd, env }` threading and the `ctx.context.X` double hop. Gateway seams stay; the caller-facing interface narrows.
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

- The findings-publication workflow's known external consumer is the roaster GitHub Actions workflow (`.github/workflows/roaster.yml`), but the current three `exec` commands are user-invocable. Before deleting them, confirm whether any caller depends on the separate steps; otherwise keep compatibility wrappers over the single operation.
- The three duplicated DTOs are genuinely the same concept in each home (not deliberately divergent shapes), so a single source of truth is correct rather than a coincidental name collision.
- The unread structured fields on `RoasterFailure` are not consumed anywhere outside the roaster package (e.g. by a downstream parser of roaster output). To be verified as the first step of candidate 4.

Risks:

- **CI behavior regression (candidate 1):** the publication path runs only in GitHub Actions, so a refactor can pass local tests yet break real PR comment rendering or inline posting. De-risk by giving the collapsed module an end-to-end test and validating against a real PR before closing.
- **Lost per-step CI observability (candidate 1):** the current bash logs each step's envelope/output separately; collapsing to one command may reduce debuggability. Mitigate by preserving meaningful logging inside the module or its adapter.
- **Schema/type drift during unification (candidate 2):** if the hand-written and Zod shapes have subtly diverged today (e.g. `changeKind` enum members, nullability), unifying them could change validation behavior. De-risk by diffing the two shapes field-by-field before deleting either.
- **Over-binding the environment (candidate 3):** binding `cwd` at construction conflicts with `createRealRoasterContext()` being built before argv is known. Bind at `runCli` time, not at context construction, to keep both real and fake adapters honest. Treat `signal` as a design decision because current handlers do not thread one even though lower gateway options support it.
- **Candidate 4 premature shrink:** removing fields that were intentional forward-room would have to be re-added later. The "confirm intent first" step is the mitigation; this candidate may legitimately resolve to parked-with-reason.

## Open Questions

- Candidate 1: should the three `exec` commands be fully collapsed into a single `roaster exec publish`, or retained as thin adapters over `publishFindings` for backward-compatible CI invocation? (Leaning: one new command, with the CI workflow updated in the same change.)
- Candidate 4: shrink or deepen? Resolved during the candidate-4 decide step, recorded as an update (and an ADR if deepen is rejected).
- Whether unifying DTOs (candidate 2) should live in `models.ts` as today or motivate a small dedicated schema module if `models.ts` grows unwieldy.
