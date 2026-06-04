# Roadmap

## Work

- [x] Extract `@asdl/planned-branch` as a publishable TS workspace package with the deterministic core, `Exec` gateway, real adapter, in-memory/scripted fake, and hidden `planned-branch exec` CLI operations (`write-plan-file`, `resolve-plan`, `create`, `load-plan`). Evidence: `@asdl/planned-branch` package check/tests pass; CLI scenario tests cover help/version and each exec operation; no package code depends on Pi APIs or model calls; `just ts-check` and `just ts-test` pass for the slice.
- [x] Refactor Pi and cmux planned-branch surfaces to import/use `@asdl/planned-branch`, rename Pi commands to `/planned-branch:write-plan`, `/planned-branch:create`, and `/planned-branch:impl`, and complete the storage rename to `planned-branch` namespace plus `~/.asdl/planned-branch/plans/...`. Evidence: Pi extension/cmux tests cover namespaced command registration, session-history latest-plan resolution, tiny-model slug derivation, attached-plan loading, and updated launch/status text; `just ts-check` and `just ts-test` pass for the slice.
- [ ] Add the public Claude skills (`planned-branch-write-plan`, `planned-branch-create`, `planned-branch-impl`) and update planned-branch workflow docs to the new CLI/package/storage contract. Evidence: skill directories are discoverable via `skills/<name>` symlinks, skill prose references CLI operations only, docs describe the cross-harness flow, and final `just ts-check` / `just ts-test` pass.

## Parked

- [ ] Thin human surface `planned-branch list` / `planned-branch show` after resolving whether it should read attached plans on the current branch, local saved-plan store entries, or both.
- [ ] Actual npm publication and release automation for `@asdl/planned-branch` (publish config, versioning, CI/release workflow, and registry publication).
