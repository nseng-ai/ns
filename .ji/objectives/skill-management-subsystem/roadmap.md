# Roadmap

## Work

- [~] Establish the package and command vocabulary for the `ji` CLI.
  Decided (see `updates/20260702T035321Z-harness-artifact-vocabulary-and-layering.md`): domain term **harness artifact** with kinds `skill`/`agent`/`extension-bundle`; user-facing command `ji skills`; verb **provision**; **harness** over "platform"; AREG re-read as Artifact Registry. Remaining: confirm the package name (leading candidate `@ji/harness-artifacts`).

- [ ] Design the artifact model, harness path table, install manifest, and reconcile operation.
      Define artifact entries, catalog shape, the three entry kinds, harness specs with aliases and user-vs-project scope (including `CLAUDE_CONFIG_DIR` handling), deterministic provision-plan output, and the install manifest with per-file content hashes and source-version provenance. Reconcile is the core operation: declared catalogs vs install manifest → provision plan → apply; install/update commands are sugar over it. Conflict policy is LBYL: detect stale content after upgrades, refuse to clobber locally edited files without `--force`, clean up renames. Evidence should include tests for path resolution, alias normalization, plan output, reconcile behavior across drift channels, and manifest-driven conflict behavior.

- [ ] Implement the `ji` CLI catalog steel thread.
      Make the `ji` CLI able to list, path, and provision (with deterministic preview) at least one SDL-owned skill through the shared subsystem, with zero `npx skills` dependency.

- [ ] Extension-carried artifact provisioning (pulled forward from parked).
      An SDL extension declares bundled or companion skills statically in its package manifest (`sdl` field in `package.json`); installing/enabling the extension provisions them through the shared subsystem with no extension code executed during discovery. Hook point decided (see `updates/20260702T041140Z-reconcile-primitive-and-sdl-update-hook.md`): reconcile is the primitive; a `ji update` surface is the primary commanded hook (applies, reported); a cheap load-time/invocation-time fingerprint check backstops ambient drift such as `git pull` on checked-in project-local extensions (detects and nudges, never silently writes).

- [ ] Re-platform AREG onto the shared core as the proving second consumer.
      Replace AREG's `npx skills` materialization path with the shared provisioner and converge `skills-lock.json` with the install manifest on one hash/record format so `areg check`/`doctor` can verify casual-path installs. Coordinate with the active `migrate-areg-and-ns-skills`, `areg-typescript-port`, and `areg-ts-cli-cleanup` Objectives before implementation.

- [ ] Reconcile with existing skill workflows, docs, and vocabulary.
      Compare the new subsystem against `skillx`, the `@sdl/areg` CLI, `npx skills`, repo skill conventions, and harness skill-invocation docs so the new CLI behavior is additive. Includes the bare-"artifact" collision cleanup: handoff artifact and consumer artifact stay owned by their domains; AREG's "managed artifacts" overlay sense is renamed (e.g. "kind overlays").

## Parked

- [ ] Marketplace or remote catalog discovery.
- [ ] Update/uninstall/version-resolution command surface (the install manifest is main-line and enables these later; the commands themselves are not first-slice).
- [ ] Provisioning the `agent` and `extension-bundle` kinds (modeled in types from day one; skills ship first).
- [ ] Replacing AREG's `npx skills add` acquisition channel for third-party GitHub skills with a first-party fetch-and-vendor path.
