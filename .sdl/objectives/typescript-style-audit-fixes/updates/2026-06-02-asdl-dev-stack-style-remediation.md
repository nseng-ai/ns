# Style Remediation Extended to the asdl-dev Stack

## Summary

Branch `asdl-dev-stack-omnibus-roaster-fixes` (PR #812; commits `f9717c30` then
`647ffd30`) lands a roaster-review-driven `typescript-style` remediation slice on the
`asdl-dev` package — a part of the TypeScript surface this Objective's earlier slices,
all scoped to `ts/packages/pi-extensions`, had not reached. Six finding buckets shipped:

- **Object type aliases → `interface`** across `asdl-dev/src` and its tests (commit
  `f9717c30`) — the same decision already completed for pi-extensions, now extended to
  the asdl-dev surface. Unions, function types, and simple aliases stay `type`.
- **Boolean names → predicate prefixes** (`f9717c30`) — naming hygiene per the guide.
- **Long positional helpers → options objects** in
  `pi-extensions/src/cli-command-extension.ts` (`647ffd30`): `runRegisteredCliCommand`,
  `buildOutputDetails`, `restoreCommandInvocationToEditor`, and `formatFailedOutput`
  each take one module-private options interface now; behavior and the public extension
  API are unchanged, and tests exercise the helpers only through the public surface.
- **Unitless constant → unit suffix** (`647ffd30`): `STDERR_DETAIL_LIMIT` →
  `STDERR_DETAIL_LIMIT_CHARS` in `asdl-dev/src/gateways/git.ts` and `vercel.ts`.
- **Cross-package and same-package relative imports → package-absolute** (`647ffd30`,
  buckets 4 & 6): `../../asdl-dev/src/X` and `../../src/X` rewritten to `asdl-dev/src/X`
  across pi-extensions and asdl-dev tests, backed by a new `asdl-dev: workspace:*`
  dependency in `pi-extensions/package.json` (and its `ts/bun.lock` entry). This is
  import-path convention work, adjacent to — not part of — the `typescript-style` guide,
  which the guardrail reviewer deliberately leaves toolchain-neutral on import-suffix
  choices; it is recorded here because it shipped in the same roaster-remediation slice.

Evidence: local branch diff against `master` (44 files — 26 in `asdl-dev`, 17 in
`pi-extensions`, plus `ts/bun.lock`); PR #812 corroborates the same file set. Full gate
passed on the branch: `just ts-check`, `just ts-test`, and `just dprint-check`.

## Objective Impact

Advances the Objective's thesis of full `typescript-style` compliance across the
existing TypeScript surface by extending it to the `asdl-dev` package, which prior
slices had not covered. The "Convert existing object-shape and contract aliases to
interfaces" row stays `[x]` and now records asdl-dev coverage alongside pi-extensions.

No open roadmap row is completed by this slice: expected-failure-API rework,
dependency-injection / adapter ownership, and closing the audit loop remain open and
untouched — the branch deliberately preserved existing throw/return failure shapes and
DI seams. The assumption that broad object-literal `type` → `interface` conversion is
acceptable despite churn (behavior and public exports preserved) is re-confirmed on a
second package.

## Follow-Ups

- The remaining open rows (failure-as-data, DI / adapter ownership, close-the-audit-loop)
  are unaffected by this slice and still need dedicated work.
- If a later audit pass formalizes import-path conventions, decide whether
  package-absolute imports should become a tracked guide rule or stay a toolchain-neutral
  repo convention outside this Objective.
- When closing the audit loop, fold this asdl-dev stack remediation into the
  fixed-versus-accepted summary.
