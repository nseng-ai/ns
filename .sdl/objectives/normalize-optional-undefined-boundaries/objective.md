# Normalize Optional Undefined Boundaries

## Thesis

SDL's TypeScript code should reserve `?: T | undefined` for boundaries where callers may intentionally omit a key or explicitly pass/forward `undefined`: options, overrides, dependency bags, compatibility inputs, external payload mirrors, and fixture builders. Internal domain, state, result, presentation, and durable record models should normalize loose inputs at the edge, then represent absence by omitting an optional key, using a required default, or using an explicit domain state.

This Objective turns the optional-undefined advisory into semantic cleanup of inappropriate boundary leaks. The goal is not to reach zero candidates, but to stop letting accidental `undefined` enter internal APIs and force downstream surfaces to compensate.

## Process

Treat this Objective as semantic boundary normalization, not a regex cleanup campaign. The working process is intentionally conservative so implementation proceeds in coherent slices with low review noise and minimal type-thrash.

1. **Inventory before editing, but do not optimize for zero.** Start from the optional-undefined advisory or a scoped grep and classify each candidate before changing it. The expected categories are: internal model leak, boundary/input compatibility, external payload mirror, fixture/test-builder ergonomics, parser intermediate, and ambiguous/null-sensitive case.
2. **Fix only candidates with a semantic claim.** A removal is appropriate when we can say: this is an internal normalized domain/state/result/presentation/durable-record model, and accepting explicit `undefined` is not part of its contract. If that claim is unclear, preserve or defer the candidate.
3. **Work in vertical slices.** Prefer one coherent callstack at a time: a result model with its builders/renderers, a status/state model with its ingest/parser boundary, a presentation facade with its direct callsites, or a durable record shape with serializer/deserializer. Avoid package-wide mechanical sweeps.
4. **Normalize at the edge before narrowing internals.** Trace where `undefined` enters. Loose CLI/JSON/GitHub/GraphQL/process/Zod inputs may accept explicit `undefined`; builders/parsers should convert that looseness into omitted optional keys, required defaults such as empty arrays, preserved `null` where meaningful, or explicit discriminated domain states before internal consumers see it.
5. **Edit producers before interfaces.** Do not start by deleting `| undefined` from type declarations and chasing compiler fallout. First update constructors, builders, parsers, and emitters to omit absent keys or produce normalized defaults; then narrow the internal type and simplify downstream compensation such as `?? []` that only existed for loose builders.
6. **Preserve compatibility surfaces deliberately.** Options, overrides, dependency bags, config, public SDK/CLI inputs, external payload mirrors, env/process records, parser staging types, and fixture/fake builders may legitimately keep `?: T | undefined`. Prefer introducing a separate normalized internal type instead of tightening a public or external mirror in place.
7. **Handle null-union cases cautiously.** Do not collapse `null`, omission, and explicit `undefined` unless the domain meaning is understood. If `null` carries external or domain state, preserve it or introduce an explicit state representation.
8. **Summarize each slice.** Each implementation summary should include touched cluster, before/after candidate count for that cluster, fields changed, rationale for removed explicit-undefined acceptance, preserved/deferred candidates with categories, and targeted validation run.
9. **Close with a rebaseline, not a ban.** The endpoint is a classified remaining inventory, not a hard style-guard failure, checked-in allowlist, or zero-count target.

## Scope

In scope:

- Identify and clean clusters where `?: T | undefined` is an internal modeling leak rather than an input compatibility contract.
- Normalize at root boundaries before narrowing internal types: CLI/JSON/GitHub/GraphQL/process outputs may be loose, but internal models should receive omission, defaults, `null`, or explicit discriminated state as appropriate.
- Prioritize coherent callstack cleanup where the change can go all the way up from producer/builder/parser through internal consumers.
- Initial priority clusters:
  - result-block and presentation facades (`@sdl/cli-theme`, Flow/CCC/slot/handoff presentation wrappers);
  - Flow submit transcript/result models where construction already mostly omits absent fields;
  - SDLCC stack-map model normalization, especially empty `children`, `slots`, and `cmuxTabs` arrays;
  - PR feedback watch state/event/fingerprint normalization at ingest and parse boundaries;
  - kernel command/extension registry diagnostics and small internally constructed result models;
  - small packages such as packagechk or areg only where schemas/builders can normalize instead of widening internal results.
- Preserve external/input compatibility where explicit `undefined` is part of the API contract, but prefer converting to a separate normalized internal type when downstream code should not see it.
- Report before/after candidate counts and preserved/deferred rationale in implementation summaries; do not add a checked-in allowlist or hard validation ban unless separately approved.

## Non-Goals

- Do not mechanically rewrite every `?: T | undefined` occurrence.
- Do not make the optional-undefined advisory a hard style-guard failure.
- Do not add a checked-in audit snapshot, global allowlist, or schema registry for candidates.
- Do not break public CLI/options/deps/config/test-builder ergonomics just to reduce counts.
- Do not alter external GitHub/GraphQL/JSON payload mirrors unless a normalized internal representation is introduced.
- Do not remove meaningful `null` semantics from `?: T | null | undefined` cases.

## Completion Criteria

- The named inappropriate internal-boundary clusters are cleaned or explicitly deferred with rationale.
- Result/presentation/status/state models in the cleaned clusters no longer accept explicit `undefined` unless it is a true compatibility boundary.
- Loose external inputs are normalized at the boundary into omission, defaults, `null`, or explicit domain states before internal consumers rely on them.
- Remaining `?: T | undefined` candidates are predominantly option/input/override/deps/config bags, external payload mirrors, public compatibility surfaces, fixture builders, or explicitly deferred ambiguous cases.
- Implementation summaries include before/after counts and rationale groups; no checked-in allowlist/report is required.
- Relevant TypeScript validation for touched clusters passes.

## Assumptions and Risks

Assumptions:

- Most inappropriate candidates can be removed by fixing builders/parsers and model constructors, not by adding more `| undefined` to satisfy typecheck.
- The current advisory policy remains advisory: this Objective should improve semantics without turning the pattern into a blanket ban.
- Public input compatibility matters for CLI deps/options/config and some SDK surfaces; those may legitimately preserve explicit `undefined`.
- Some external payload mirrors are better left loose unless a separate normalized internal type is introduced.
- SDLCC stack-map branch tree collections can represent "loaded and empty" as empty arrays; absence no longer carries separate internal meaning for `children`, `slots`, or `cmuxTabs`.

Risks:

- Narrowing optional properties without following the callstack can push noise into callsites or accidentally break compatibility.
- Normalizing too aggressively can collapse meaningful states, especially where `null`, omission, and explicit `undefined` currently reflect different external data conditions.
- Broad cleanup can create review noise; slices should stay coherent and explain why each boundary no longer admits explicit `undefined`.
- Zod `.optional()` outputs and JSON emit behavior can reintroduce `| undefined` unless schema boundaries are handled deliberately.

## Closure

Closed after completing the named semantic cleanup clusters and final broad rebaseline. The remaining `?: T | undefined` candidates are predominantly option/input/override/deps/config bags, external process/GitHub/JSON/env mirrors, public/CLI compatibility surfaces, test fixture/fake gateway builders, parser intermediate states, and cautious null/omission compatibility surfaces. No checked-in allowlist, hard validation ban, or schema registry was added.

## Open Questions

- For remaining public SDK and CLI surfaces, explicit `undefined` is preserved as compatibility unless future local work introduces a normalized internal type.
- For PR feedback watch, no open modeling question remains for the cleaned watch-state slice: internal status, event, fingerprint, and snapshot records now omit absent fields, while UI status-clearing and GitHub REST/options/query surfaces remain compatibility boundaries.
- For SDLCC stack-map follow-up, no open modeling question remains for branch-node collections: empty arrays are the normalized internal representation for loaded-empty `children`, `slots`, and `cmuxTabs`.
