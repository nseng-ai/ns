# Objective child progress rebaseline

## Summary

A trunk refresh re-verified the parent architecture Objective against current source and found two durable-record drifts:

1. The record still used the old `@sdl/extension-kit` / Peer API vocabulary in forward-looking roadmap evidence even though the current package and canon are `@sdl/capability-kit`, Capability Kit, and Capability API.
2. The parent only recorded that the `objective-capability-extension` child Objective had been spawned, but current source shows partial implementation progress that should be reflected without overstating closure.

Decisive evidence gathered in this checkout:

- `ts/packages/sdl-capability-kit/package.json` names `@sdl/capability-kit`; flow shared modules import `@sdl/capability-kit` and `@sdl/capability-kit/git`.
- `ts/packages/objective/package.json` exports `./api` and has no `@sdl/pi` dependency; `rg "@sdl/pi" ts/packages/objective/src ts/packages/objective/package.json` produced no matches.
- `ts/packages/objective/src/api.ts` is the curated `@sdl/objective/api` Capability API surface, and Pi objective modules now import helpers from `@sdl/objective/api`.
- The objective child is not complete: `rg "@sdl/pi/objectives" ts/packages` still found `ts/packages/ccc/src/objective-stack-impl.ts` and `ts/packages/ccc/src/cmux/sidebar.ts`, and `rg "@sdl/ccc" ts/packages/hosts/pi/src ts/packages/hosts/pi/package.json` still found the package dependency plus Pi→CCC imports.
- `ts/packages/capabilities/flow/src/shared/submit.ts` is the current submit-to-Graphite seam and imports through `@sdl/graphite/submit`; this supersedes the older `@sdl/sdl/submit` internal route in forward roadmap evidence.
- Live source has no `@sdl/sdl/(checkpoint-flow|checkpoint-message|pending-worktree|temp-files|text-generation|text-repair)` imports; those SDK-independent primitives now live under `@sdl/domain-primitives-transitional/*`, and `sdl-sdk` is the author SDK package.
- `@sdl/domain-primitives-transitional` still has consumers, so the parent endgame remains open.

Provenance: objective-refresh basis target=48db3b450bde1ebabd51bd53647cb85f1de3cd94 from=48db3b450bde1ebabd51bd53647cb85f1de3cd94

## Objective Impact

The parent roadmap is rebaselined without closing anything:

- Step 1 and Step 2 forward evidence now names current Capability Kit / Capability API vocabulary while preserving historical update links for the original `extension-kit` landing.
- The Graphite ownership row now names the current `sdl-flow` → `@sdl/graphite/submit` route rather than carrying forward the superseded `@sdl/sdl/submit` route as current evidence.
- Step 4 now records that the Objective child has advanced through `@sdl/objective/api` creation and Objective→Pi dependency removal, but still has live CCC→Pi-objectives and Pi→CCC edges.
- Step 5 remains open and not closure-ready; the child still owns the objective-domain cycle-break and eventual acyclicity guard, while the parent keeps the broader post-child `ccc` clean-consumer work for other capabilities.

The refresh also corrected forward-looking `objective.md` assumptions/risks that still treated `@sdl/extension-kit`, `@sdl/sdl/*` primitive subpaths, or package-owned internal-migration-export seams as current. Current prose now points gateway derivation at `@sdl/capability-kit`, SDK-independent primitives at `@sdl/domain-primitives-transitional`, the author SDK at `sdl-sdk`, and GitHub-PR reuse at `sdl-flow` package-owned seams.

## Follow-Ups

- Continue `objective-capability-extension` by resolving the remaining `ccc` → `@sdl/pi/objectives/selection` and `@sdl/pi` → `@sdl/ccc` edges before treating the child cycle-break as complete.
- Do not close this parent Objective until the remaining child capability migrations, `ccc` clean-consumer work, and `@sdl/domain-primitives-transitional` deletion are complete.
- Treat older `Peer API` / `extension-kit` wording in historical Semantic Updates as history; only forward durable guidance should use Capability API / Capability Kit vocabulary.
