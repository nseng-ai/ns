# Flow Architecture Review — Land Extraction Prioritized

## Summary

Recorded a deep-module architecture review of the whole `sdl-flow` package as evidence at
`.sdl/objectives/flow-capability-deepening/evidence/architecture-review-2026-06-29.html`. The
report was produced from a four-way read of the landing, submit, shared, and
autobranch/command subsystems and is framed in the `/codebase-design` deep-module vocabulary
(module, interface, depth, seam, leak, locality).

It surfaces nine deepening candidates and, per direction, elevates **extracting `land` as a
self-contained deep module out of flow** to the top priority. The land extraction is framed as
an umbrella that sequences five constituent candidates rather than a single leap.

## Priority: extract the land module

Consolidate all land code under `src/land/` behind a narrow interface — `executeStackLanding`

- `registerLandCommand` + a small typed `LandOutcome` — with the rest of flow and CCC
  depending only on that seam. Constituent sequence drawn from the report:

1. Split the 1,225-line `land-stack/landing-operations.ts` god-file along its pre-merge /
   merge-loop / graphite-maintenance phases (existing roadmap row "Decompose Flow land command
   shells from land-stack domain orchestration").
2. Introduce a typed Graphite/Git seam over the argv-string scripting so land paths are tested
   through intent, not exact command argv (existing roadmap row "Introduce a fake-driven
   land-stack domain seam"; scope against the `neutral-infra-gateway-consolidation` objective
   and ADRs 0018/0019, and the `graphite-dependency-boundary`).
3. Dissolve the isolated single-PR fast-path fork so land has one entry with one merge-
   verification guarantee (`src/land/isolated-fast-path.ts` currently skips verification and
   backup refs).
4. Return structured outcomes instead of prose, replacing the `setStatus`-string back-channel
   that `commands/land.ts` re-parses with a typed `LandOutcome`/`LandPhase` at the seam.
5. Narrow `api.ts` down to the land execute/register surface, ending the 13-symbol land leak
   (`parseArgs`, `ParsedArgs`, `ValidPullRequestView`, `landArgumentCompletions`, …) that
   couples CCC to land internals.

## Objective Impact

This advances the open roadmap rows on land decomposition and the fake-driven land-stack seam,
and gives the "Final API/export cleanliness rebaseline" row a concrete leak inventory to close.
It does not change scope: land stays Flow domain. Treating `src/land/` as a bounded module
behind `executeStackLanding` is the in-objective step; promoting land to a standalone capability
package is a separate, later decision (tracked by the objective's open question on a deeper
`LandingWorkflow`). Durable `refs/ccc/land-backup/*` namespaces are preserved.

## Other candidates (parallel, non-blocking)

The report also records non-land deepenings that do not block land work: one PR-description
regeneration module (collapsing three near-duplicate submit pipelines), lifting submit-failure
interpretation out of `commands/submit.ts` into the submit core, reconciling autobranch's two
opposite decompositions and divergent dirty/clean routers, and naming the CCC-era `ccc-cli.ts`
residue while assembling the run-flow-CLI-with-phase-output module.

## Evidence

- `evidence/architecture-review-2026-06-29.html` — self-contained report (Tailwind + Mermaid
  via CDN), with before/after diagrams per candidate and a priority banner for the land
  extraction.

## Follow-ups

- Grill the land-extraction interface (`executeStackLanding` shape, what `LandOutcome` carries,
  which tests survive the typed-seam swap) before starting the god-file split.
- Decide the smallest useful land gateway set (one `LandingGateway` vs. focused
  Git/Graphite/GitHub/worktree gateways) from the current land-stack tests rather than up front.
