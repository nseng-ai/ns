# Inventory Baseline

## Summary

The first roadmap slice inventoried current `@sdl/branch-context` and `@sdl/plans` package exports, direct consumers, and storage-sensitive behavior before Peer API design.

Findings:

- `@sdl/branch-context` exports only `.` and `./testing`. Its package root currently mixes context factories, Branch Memory namespace/key helpers, branch-context create/load operations, session artifact helpers, implementation command formatting, existing-branch reuse, and plan-content slug derivation.
- `@sdl/plans` exports only `.`. Its package root currently mixes CLI builders, content slug derivation, path/persistence helpers, local plan-store helpers, saved-plan write/list/selection helpers, and session saved-plan extraction helpers.
- No `@sdl/branch-context/api` or `@sdl/plans/api` Peer API subpath exists yet.
- `branch-context` intentionally depends on `plans` for plan slug/file naming, validation, source-file resolution, saved-plan selection, and slug derivation.
- Sibling runtime consumers are concentrated in `ccc` and `pi-extensions`. `ccc` composes saved-plan lookup with branch-context operation construction and cmux/Pi launch, especially in `ts/packages/ccc/src/cmux/slot-dispatch-plan.ts`; adjacent consumers handle branch-context evidence lookup and implementation-session launch. `pi-extensions` owns Pi presentation/adapters for branch-context and enriched-plan workflows while importing both package roots for capability behavior.
- Test consumers import package roots plus `@sdl/branch-context/testing`; testing imports should move only after deliberate public or Peer API boundary choices.
- Storage-sensitive semantics are already concrete and should be treated as compatibility constraints: XDG `enriched-plan` local plan store, repo identity and encoded source-branch directories, `<slug>.md` saved-plan and attached-plan filenames, validated lowercase kebab-case 3–7 word slugs, out-of-repo absolute/home-relative plan source files, Branch Memory namespace `branch-context`, explicit rejection of legacy `plan.md`, default branch name equal to slug, trunk/detached implementation refusal, single-key attached-plan auto-selection, and saved-plan fallback only when no attached entries exist and no explicit key was requested.

## Objective Impact

The Objective now has a durable inventory baseline for the next design slice. The next step can define `@sdl/branch-context/api` and `@sdl/plans/api` from concrete sibling needs instead of copying package roots wholesale.

This de-risks the main Peer API risk by separating likely Peer API candidates from command-face/private helpers and by making storage compatibility constraints explicit before code migration begins.

## Follow-Ups

- Design the combined Peer API boundaries and export-map targets from the inventoried consumer needs.
- Start with `ccc` dispatch-plan as the strongest proof path, but avoid freezing all root exports into Peer APIs.
- Preserve storage behavior unless a future steer-first decision explicitly changes it.
