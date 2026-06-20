# Hard Language Violations Removed

## Summary

The first remediation slice removed the hard language-style violations in `ts/packages/pi-extensions`: constructor parameter properties are now explicit fields with constructor assignments, and the runner-subagent fake process listener no longer uses an explicit `any[]` cast.

Evidence came from the branch diff against Graphite parent `update-typescript-style-audit-fixes-objective-docs` and PR #784, covering `grill-ui/inline-ui.ts`, `land-stack/command-stream.ts`, `runner-subagent/subagent-process.ts`, `plan-content-slug.test.ts`, `runner-subagent-fakes.ts`, and `runner-subagent-terminal-tools.test.ts`.

## Objective Impact

The roadmap item to remove hard language-style violations across source and tests is complete. This de-risks the erasable TypeScript portion of the Objective without changing runtime behavior or public extension contracts.

Focused scans found no remaining constructor parameter properties or explicit type-level `any` in `ts/packages/pi-extensions`. The broader emit-time construct scan still reports only intentional ambient `declare module` declarations and text/identifier false positives such as `namespace` wording, not runtime TypeScript constructs introduced or left by this slice.

Validation passed with `bun run --cwd ts/packages/pi-extensions check`, `bun run --cwd ts/packages/pi-extensions test`, `just ts-check`, and `just ts-test`.

## Follow-Ups

- Continue with the next semantic remediation row: convert existing object-shape and contract aliases to interfaces while preserving unions and function aliases as `type`.
- Keep the guardrail question open for a later slice; `erasableSyntaxOnly` or a lightweight scan/lint rule should be considered after the remaining style remediation is clearer.
