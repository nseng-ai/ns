# Legacy plumbing consolidated into `@asdl/clinkr/legacy`; pr-address envelope canonicalized

## Summary

The per-CLI legacy machine-contract plumbing is now shared foundation code. `@asdl/clinkr` gained a `legacy` subpath export (`legacyCommand`, `legacyMachine`) — intentionally isolated so the whole module can be deleted as a unit when the umbrella's envelope migration debt is retired — plus a `failure()` constructor and a `resolveIo`/`ClinkrIoOverrides` seam for per-stream I/O injection. `@asdl/core` gained a `cli-entry` subpath export with `isDirectCliInvocation` (entrypoint detection for runtimes without `import.meta.main`).

`plans` and `planned-branch` were migrated onto `legacyCommand`/`LegacyPayload`, deleting their hand-rolled legacy adapters, failure wrapping, I/O construction, per-CLI `isDirectCliInvocation` copies, and the duplicated `formatSavedPlanListFromJson` (~300 net lines removed across the two `cli.ts` files).

`pr-address` no longer maintains its local envelope duplicate: `clinkr-envelope.ts` (~97 lines — `ClinkrExit` types, `clinkrOk`/`clinkrNegative`/`clinkrFailure`, `emitClinkrExit`, `toMachineEnvelope`) is deleted, `@asdl/clinkr` is wired as a workspace dependency, and all call sites use the canonical `ok`/`negative`/`failure`/`toMachineEnvelope`/`emitExit` exports plus `@asdl/core/cli-entry` and `formatErrorMessage`. The umbrella's `migration-debt.md` entry 1 now records that the escape-hatch kill action is "delete the `@asdl/clinkr/legacy` subpath and update `legacyCommand` call sites."

## Objective Impact

- Groundwork for the "Migrate the `@asdl/pr-address` CLI shell to clinkr" row landed: pr-address already depends on `@asdl/clinkr` and consumes the canonical envelope, so the remaining shell work is the command tree itself. The row stays open — argv parsing and help are still hand-rolled there.
- The completed `plans` and `planned-branch` migration rows deepened: their legacy adapters are no longer per-package copies but shared `@asdl/clinkr/legacy` consumers, strengthening the record's thesis that the foundation absorbs seams bottom-up from proven implementations.
- The "new monolith" risk mitigation is being exercised as designed: both new capabilities shipped as decoupled subpath exports (`@asdl/clinkr/legacy`, `@asdl/core/cli-entry`) rather than accreting into package roots.
- Evidence: commits `962e0917d`, `615d4227c`, `d50035bbe` on `master`; the plumbing commit ships dedicated unit suites for `exit`, `io`, and `legacy`.

## Follow-Ups

- The `pr-address` shell migration remains sequenced last, after `pr-address-typescript-port`'s payload-spec rows; the envelope groundwork does not change that ordering.
- `pr-address-typescript-port` may want its own tracking update for the envelope canonicalization, since `d50035bbe` touched pr-address operation files; that is a separate single-Objective update.
