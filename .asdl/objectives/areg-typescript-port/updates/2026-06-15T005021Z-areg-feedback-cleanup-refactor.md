# areg feedback cleanup refactor recorded

## Summary

Recorded the current `areg-feedback-cleanups` branch as a post-`areg init` / `areg check` cleanup pass for the TypeScript `areg` package.

Evidence from the local branch diff against Graphite parent `areg-init-project-bootstrap-port` and PR #1545 shows one cleanup commit touching only `ts/packages/areg` files:

- Renamed generic replacement inspection fields from `adapterExists` / `packageModuleExists` to `hasAdapter` / `hasPackageModule` across gateway contracts, real adapters, fakes, and check logic.
- Renamed the fake prompt default option to `shouldConfirmByDefault` for clearer fake behavior.
- Reworked `areg check` helpers toward options objects and clearer constants.
- Reworked `areg init` plan assembly to build write/skipped-file collections without mutating shared arrays.
- Replaced the package-local scripted command runner implementation with re-exports from shared ASDL dev test support.

## Objective Impact

No roadmap row changes state from this cleanup: `areg check` and `areg init` remain complete, and the next substantive porting row remains `areg update-skills`.

The cleanup strengthens the completed TypeScript slices by clarifying gateway/fake naming and reducing duplicated test support without changing the standalone `areg` product surface or extracting package-local product seams prematurely. The shared scripted-runner reuse is test-support reuse only; skill-lock, project-inspection, Pi replacement, managed-block, and command-conversion logic remain package-local until another real consumer proves a shared boundary.

PR evidence corroborates the same file set, but local branch evidence was sufficient for this tracking update.

## Follow-Ups

- Continue with the planned `areg update-skills` TypeScript port as the next semantic implementation slice.
- During future cleanup or cutover rows, keep distinguishing test-support reuse from product-seam extraction so the Objective does not accidentally violate its package-local-seams assumption.
