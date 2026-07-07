# Roadmap

## Work

- [x] Establish the package and command vocabulary for the `ns` CLI.
      Decided (see `updates/20260702T035321Z-harness-artifact-vocabulary-and-layering.md`): domain term **harness artifact** with kinds `skill`/`agent`/`extension-bundle`; user-facing command `ns skills`; verb **provision**; **harness** over "platform"; AREG re-read as Artifact Registry. Package name confirmed and landed as `@nseng-ai/harness-artifacts` at `ts/packages/capabilities/harness-artifacts`, seeded by pushing down areg's lockfile/mirror/frontmatter convention code (see `updates/20260706T100934Z-harness-artifacts-package-seeded-by-areg-pushdown.md`).

- [ ] Design the artifact model, harness path table, install manifest, and reconcile operation.
      Define artifact entries, catalog shape, the three entry kinds, harness specs with aliases and user-vs-project scope (including `CLAUDE_CONFIG_DIR` handling), deterministic provision-plan output, and the install manifest with per-file content hashes and source-version provenance. Reconcile is the core operation: declared catalogs vs install manifest → provision plan → apply; install/update commands are sugar over it. Conflict policy is LBYL: detect stale content after upgrades, refuse to clobber locally edited files without `--force`, clean up renames. Evidence should include tests for path resolution, alias normalization, plan output, reconcile behavior across drift channels, and manifest-driven conflict behavior.
      A first consumer seam already waits on this: `@nseng-ai/ns-init`'s `SkillMaterializer` gateway (copy objective skill dirs into harness roots for `claude-code`/`codex`/`pi`; areg's symlink/`npx skills` model is explicitly not the customer path — see `updates/20260705T231627Z-areg-rejected-as-customer-path-ns-init-seam.md`). The first harness set is confirmed as `pi` + `claude-code` + `codex`, and the design now grows inside the seeded `@nseng-ai/harness-artifacts` package, whose pushed-down lockfile/mirror/frontmatter modules are the existing-behavior substrate (see `updates/20260706T100934Z-harness-artifacts-package-seeded-by-areg-pushdown.md`).

- [ ] Implement the `ns` CLI catalog steel thread.
      Make the `ns` CLI able to list, path, and provision (with deterministic preview) at least one ns-owned skill through the shared subsystem, with zero `npx skills` dependency.

- [ ] Extension-carried artifact provisioning (pulled forward from parked).
      An ns extension declares bundled or companion skills statically in its package manifest (the `ns` field in `package.json`, parsed by `@nseng-ai/kernel` extension discovery); installing/enabling the extension provisions them through the shared subsystem with no extension code executed during discovery. Hook point decided (see `updates/20260702T041140Z-reconcile-primitive-and-sdl-update-hook.md`): reconcile is the primitive; a `ns update` surface is the primary commanded hook (applies, reported); a cheap load-time/invocation-time fingerprint check backstops ambient drift such as `git pull` on checked-in project-local extensions (detects and nudges, never silently writes).

- [ ] Re-platform AREG onto the shared core as the proving second consumer.
      Replace AREG's `npx skills` materialization path with the shared provisioner and converge `skills-lock.json` with the install manifest on one hash/record format so `areg check`/`doctor` can verify casual-path installs. The prior AREG migration Objectives (`migrate-areg-and-ns-skills`, `areg-typescript-port`, `areg-ts-cli-cleanup`) have closed; plan against the landed `@nseng-ai/areg` implementation (`ts/packages/tools/areg`, including its `npx-skills` gateway and lockfile/check operations) rather than a moving port.

- [ ] Reconcile with existing skill workflows, docs, and vocabulary.
      Compare the new subsystem against `skillx`, the `@nseng-ai/areg` CLI, `npx skills`, repo skill conventions, and harness skill-invocation docs so the new CLI behavior is additive. Includes the bare-"artifact" collision cleanup: handoff artifact and consumer artifact stay owned by their domains; AREG's "managed artifacts" overlay sense is renamed (e.g. "kind overlays").

## Parked

- [ ] Marketplace or remote catalog discovery.
- [ ] Update/uninstall/version-resolution command surface (the install manifest is main-line and enables these later; the commands themselves are not first-slice).
- [ ] Provisioning the `agent` and `extension-bundle` kinds (modeled in types from day one; skills ship first).
- [ ] Replacing AREG's `npx skills add` acquisition channel for third-party GitHub skills with a first-party fetch-and-vendor path.
