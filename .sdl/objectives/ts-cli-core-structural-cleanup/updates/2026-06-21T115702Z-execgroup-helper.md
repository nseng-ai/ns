# execGroup Helper Migration Complete

## Summary

`@sdl/clinkr` now exports an `execGroup<TContext>(description?)` helper that centralizes the hidden `exec` subgroup convention: `name: "exec"`, `isHidden: true`, and the standard skill-invoked default description.

The 10 current hand-wired hidden `exec` groups were migrated to the helper in `areg`, `aretro`, `branch-context`, `brmem`, `ccc`, `objective`, `plans`, `pr-address`, `roaster`, and `slot`. Existing per-CLI descriptions were passed through unchanged so `exec --help` text remains stable.

Validation evidence: focused `@sdl/clinkr` and `@sdl/plans` package tests passed; stale-pattern greps no longer find manual hidden `exec` object literals in CLI entrypoints; `just ts-format-check`, `just ts-lint`, `just ts-check`, `just ts-test`, `just ts-deps-check`, and `just ts-guard` passed.

## Objective Impact

This completes the roadmap row for the `clinkr` `execGroup(description?)` factory. The hidden-exec construction convention now lives once in `@sdl/clinkr`, while visible groups and root groups continue to use `new ClinkrGroup(...)` directly.

The description-preservation choice intentionally avoids observable help-text churn for this structural slice.

## Follow-Ups

- Do not standardize all hidden `exec` descriptions unless the Objective owner explicitly accepts help text churn.
- Proceed to the next structural cleanup row; the legacy-command migrations for `plans` and `branch-context` remain parked.
