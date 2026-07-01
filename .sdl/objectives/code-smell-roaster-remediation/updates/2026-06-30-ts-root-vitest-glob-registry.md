# ts-root Vitest Glob Registry Remediation

## Summary

Remediated the `ts-root` code-smell cluster by replacing duplicated Vitest test glob literals with a shared `testGlobsFor(subdir?)` helper and a `SPECIALIZED_TEST_CATEGORIES` registry in `ts/vitest.shared.ts`. The default Vitest config now derives specialized-test exclusions from the registry, and the integration/style-guard configs derive their includes through the registry accessor.

Validation passed: `just ts-format-check`, `just ts-lint`, `just ts-check`, and `just ts-test`.

## Objective Impact

The two `references/ts-root.md` findings are now dispositioned as fixed in `roadmap.md`:

- Shotgun Surgery in `ts/vitest.config.ts`: fixed by deriving the default exclude list from the specialized-category registry.
- Duplicated Code in `ts/vitest.shared.ts`: fixed by centralizing the canonical package test glob pair in `testGlobsFor`.

This reduces the open, no-disposition finding count by 2 without changing test behavior.

## Follow-Ups

No ts-root follow-up is known. Future specialized Vitest categories should be added through `SPECIALIZED_TEST_CATEGORIES` and `testGlobsFor` rather than hand-writing include/exclude glob pairs.
