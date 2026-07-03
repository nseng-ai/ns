# Distribution Narrative Reconciled to the Run-From-Source Shim

## Summary

The Objective's distribution and wrapper narrative had drifted from the implemented reality. Several sections (the `bundle-distribution` endgame thesis, the `[~]` cutover row, and the Assumptions/Risks/Open Questions around distribution) still described the original Python-era wrapper: a bash `skills/pr-address/scripts/pr-address-run` with an `ASDL_PR_ADDRESS_MODE=local|prod` split, a `uvx --from asdl-pr-address` prod path, and a broken `0.1.0` pin.

The actual installed wrapper is a **run-from-source bash shim**:

- Source: `ts/packages/pr-address/scripts/pr-address-shim`, installed to `~/.local/bin/pr-address` by `just install-pr-address`, which substitutes the installing checkout path into `@@ASDL_CANONICAL_CHECKOUT@@`.
- Behavior: `exec node <checkout>/ts/packages/pr-address/src/cli.ts "$@"`. It prefers the enclosing worktree (`git rev-parse --show-toplevel`) so each worktree runs its own sources, then falls back to the baked canonical checkout, then errors `exit 2`.
- Preconditions: the target checkout must have `ts/node_modules` (`just ts-install`); Node must be able to run the `.ts` entrypoint directly (TypeScript type stripping).
- Not present: any `local|prod` mode env var, any `uvx`/Python invocation, any `0.1.x` pin, any bundled artifact.

This shim predates the current `pr-address-ts/fu-*` follow-up stack (it is not in that stack's diff); the narrative simply never caught up when the wrapper was redesigned. The earlier contract-inventory update (`2026-06-09T121838Z-current-contract-inventory.md`) accurately described the Python-era `pr-address-run` wrapper as of that date and is left intact as a historical record.

## Objective Impact

- **objective.md** — Distribution `Decided` entry reframed (bundle is the planned checkout-free end state; the shim is the run-from-source reality); the "local/prod detection" risk reworded to the shim's enclosing-worktree-then-canonical-checkout resolution; the Python-fallback-surfaces risk reconciled (wrapper is no longer a Python-fallback surface, `--json-schema` routes and click usage-error shapes are TS-owned after branches 5-6); the broken-`0.1.0`-prod-pin "Materialized" risk marked **superseded** (replacement gap is checkout/`ts-install` dependence); Open Question #4 reframed against the run-from-source baseline.
- **roadmap.md** — the `[~]` cutover row's `Decided`/`Evidence` notes reconciled to the shim model; the `bundle-distribution` (branch 7) thesis rewritten so its goal is checkout-free distribution (bundle the TS to JS and have the installed wrapper run the bundle when no source checkout applies, keeping enclosing-worktree-wins for development) rather than a `prod`-mode/`uvx` cutover; the `python-deletion` row gained a reconciliation bullet narrowing its remaining gates.
- No roadmap statuses changed: the cutover row stays `[~]` and `bundle-distribution`/`plugin-retirement`/`python-deletion`/`playbook` stay pending. This update corrects forward-looking narrative; it does not assert new completion.

## Follow-Ups

- The next executable slice (`bundle-distribution`) should be planned against the shim: add bundle build machinery, teach the shim to run the bundle when no source checkout applies, and update `ts/packages/pr-address/test/wrapper/pr-address-shim.test.ts` plus public docs (`skills/pr-address/SKILL.md`, `references/cli-reference.md`, `README.md`). Resolve the reframed Open Question #4 (Node version floor, single-file vs directory bundle, bundle pickup) as part of that branch.
- Documentation reconciliation (skill/CLI-reference/README) for the shim model is implementation work for branch 7, not part of this tracking update; this update touched only Objective files.
