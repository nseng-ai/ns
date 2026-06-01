# Roadmap

## Work

- [ ] Extract the Pi-independent planned-branch core into a new `@asdl/planned-branch` package at `ts/packages/planned-branch`, replacing `pi.exec` with an `Exec` gateway (real adapter + in-memory fake). Evidence: the core builds and unit tests pass against the fake.
- [ ] Build the `planned-branch` bin with the hidden `exec` group (`write-plan-file`, `resolve-plan`, `create`, `load-plan`), model-free, shelling out to `brmem`/`git`/`gt`. Evidence: scenario tests cover the exec operations, help, and version.
- [ ] Rename storage to the single `planned-branch` token: brmem namespace `brmem-plans` → `planned-branch` and local store `~/.asdl/plans/...` → `~/.asdl/planned-branch/plans/...`, across code, docs, and tests.
- [ ] Refactor the Pi extension to import the extracted core and namespace its commands to `/planned-branch:write-plan`, `/planned-branch:create`, `/planned-branch:impl`, keeping session-history resolution and tiny-model slug derivation in the extension layer. Evidence: `just ts-check` and `just ts-test` pass; the session-history "latest plan" feature still works.
- [ ] Author the three public Claude skills (`planned-branch-write-plan`, `planned-branch-create`, `planned-branch-impl`) that shell out to the bin and describe CLI operations only, with `skills/<name>` symlinks.
- [ ] Update `docs/pi/planned-branch-workflow.md` and related docs to the new package, namespace, store path, and namespaced command surface.

## Parked

- [ ] Thin human surface `planned-branch list` / `show` (resolve the attached-vs-store scope first).
- [ ] npm publish wiring for `@asdl/planned-branch` as the first non-private TS package (TS analog of `setup-pypi-publish`).
