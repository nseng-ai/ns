# Handoff: Short-term Pi presentation mitigation over the Clinkr presentFinal seam

Continuation focus: Investigate a short-term mitigation that reintroduces a layer of abstraction over the prototype `presentFinal` seam so the in-Pi command experience is not terrible, without waiting for the full `ClinkrResponse` reshape.

## Context

Branch `clinkr-semantic-output-raw-adapters` carries two commits, both submitted as PRs (#4120, #4124):

- `df8ad8246` "[cp] Add invocation-scoped Clinkr presentation" — the prototype: replaces process-writer interception with an invocation-scoped `ClinkrFinalPresentation` aggregate (`presentFinal` callback, `ClinkrPresentationPrimary`, classified diagnostics, `rawOutput` byte adapter for raw commands), threaded through Clinkr, Foundation `defineClinkrAppCli`, SDK `NsCliDeps`, and Pi.
- `11e093278` "[cp] Define Clinkr output channel model" — the design response: `channel-ontology.md` (two-tier channel model) plus a new Objective `clinkr-output-and-interaction-model` that owns settling that model.

The pain: Pi's adapter receives the semantic aggregate and immediately re-renders it into strings named `semanticStdout`/`semanticStderr` via the exported `renderClinkrFinalPresentation`, then pushes them through `formatCliCommandOutput`, which prints literal `stdout:` / `stderr:` section labels into the transcript. The long-term fix (the `ClinkrResponse` reshape, rename map in the ontology doc) is gated on the model being blessed and belongs to `clinkr-readme-driven-development`. This handoff is about a cheap intermediate layer in Pi so the transcript looks sane now.

## Current State

- `just` is green; both commits are pushed and PRs are open.
- `.ns/objectives/clinkr-readme-driven-development/references/channel-ontology.md` holds the target vocabulary: kernel channels (Request, Response) vs invocation services (Progress, Notice, Elicitation), the design test (no stdout/stderr vocabulary outside the terminal adapter and raw commands), and the prototype→target rename map (`ClinkrFinalPresentation` → `ClinkrResponse`, `presentFinal` → `onResponse`, `renderClinkrFinalPresentation` → private terminal adapter, Pi `semanticStdout`/`semanticStderr` → deleted).
- New Objective `.ns/objectives/clinkr-output-and-interaction-model/` (mirrored edge with `clinkr-readme-driven-development`) owns the model; its roadmap row 1 relocates the ontology doc into its own `references/`. Not yet done.
- No mitigation work has started; this session ended at design + Objective creation.

## Decisions / Findings

- `ClinkrFinalPresentation` already carries everything a better Pi rendering needs: `primary.purpose` (closed union incl. `command-outcome`), `primary.text`, `primary.format`, `primary.status` (`success|negative|failure|usage-error`), and per-diagnostic `classification` (`topology-issue|usage-error|command-failure`). The mitigation does not require the rename — it requires Pi to stop flattening the aggregate into fake streams.
- Specific Pi sins to mitigate in `cli-extension.ts`: (1) `presentFinal` re-renders to `semanticStdout`/`semanticStderr`; (2) `formatCliCommandOutput`/`formatSuccessfulOutput`/`formatFailedOutput` emit `stdout:`/`stderr:` labels; (3) `isCliUsageError` string-sniffs `"Error:"` prefixes and exit code 2 instead of reading `status`/`classification`.
- Constraint (prototype gravity, recorded as top risk in the new Objective): keep the mitigation contained in the Pi adapter so the later rename map applies cleanly; do not spread `ClinkrFinalPresentation` vocabulary into new surfaces.
- Constraint: legacy non-Clinkr runners still flow through the string `stdout`/`stderr` sinks in `CliCommandRunDeps` — the labeled-stream fallback must survive for them; the semantic path branches only when a presentation was received (`presentationMode: "semantic"` in the existing trace fields).
- `CliCommandOutputDetails.semanticPresentation` already rides into the custom message `details`, so the message renderer (`renderCliCommandOutputMessage`) can style from classification instead of first-line heuristics.

## Next Steps

1. Read `channel-ontology.md` (target model + design test) and the Pi adapter path in `cli-extension.ts` end to end.
2. Design the mitigation layer: when `semanticPresentation` is present, build the transcript message from `primary.text` plus classification-styled diagnostics — no `renderClinkrFinalPresentation` call, no `semanticStdout`/`semanticStderr` locals, no `stdout:`/`stderr:` labels; derive level and usage-error editor-restore from `primary.status`/diagnostic `classification` instead of exit-code+prefix sniffing.
3. Keep the legacy labeled-stream formatting for runners that never call `presentFinal`.
4. Decide stacking: likely a new branch upstack of `clinkr-semantic-output-raw-adapters` (gt create) so PRs #4120/#4124 stay reviewable as-is.
5. Update `test/cli-command-extension.test.ts` coverage for the semantic path; run `just`.
6. Record the mitigation as a Semantic Update on `clinkr-output-and-interaction-model` if it changes any model-relevant facts (it should not change vocabulary — it is transport-side cleanup ahead of the rename).

## Investigation Sources

- Source session ID: 019fd3f7-016a-7e0e-9f34-2c2d432b45de
- Source session log: /Users/schrockn/.pi/agent/sessions/--Users-schrockn-.local-state-ns-slots-repos-ns-worktrees-slot-07--/2026-08-05T22-06-48-170Z_019fd3f7-016a-7e0e-9f34-2c2d432b45de.jsonl
- Related files:
  - `ts/packages/incubating/hosts/pi/runtime/pi-runtime/src/commands/cli-extension.ts` — the mitigation target: `presentFinal` handler, `semanticStdout`/`semanticStderr`, `formatCliCommandOutput`, `isCliUsageError`, `renderCliCommandOutputMessage`.
  - `ts/packages/public/infra/clinkr/src/app/app.ts` — `ClinkrFinalPresentation`, `ClinkrPresentationPrimary`, `renderClinkrFinalPresentation`, `presentOutcome`: the seam the mitigation consumes.
  - `.ns/objectives/clinkr-readme-driven-development/references/channel-ontology.md` — target model, design test, rename map the mitigation must not conflict with.
  - `.ns/objectives/clinkr-output-and-interaction-model/objective.md` and `roadmap.md` — model ownership, prototype-gravity risk, doc-relocation row.
  - `ts/packages/incubating/hosts/pi/runtime/pi-runtime/test/cli-command-extension.test.ts` — existing semantic-path coverage to extend.
  - `ts/packages/public/sdk/src/cli/index.ts` — `NsCliDeps.presentFinal` plumbing between Pi and Clinkr.
  - `.ns/objectives/clinkr-readme-driven-development/references/implementation-contract-notes.md` — presentation-aggregate contract paragraph pointing at the ontology doc.

## Useful Commands / Files

- PRs: #4120, #4124 (`gh pr view 4120`, `gh pr view 4124`).
- Branch: `clinkr-semantic-output-raw-adapters` (commits `df8ad8246`, `11e093278`); stack a mitigation branch upstack with `gt create`.
- Validate: `just` (dprint failures → `just dprint-fix`).
- Objective status: `ns objective show clinkr-output-and-interaction-model --format md`.
