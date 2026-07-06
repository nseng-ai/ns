# Roadmap

## Work

- [x] Establish the package and command vocabulary for the `ns` CLI.
      Decided (see `updates/20260702T035321Z-harness-artifact-vocabulary-and-layering.md`): domain term **harness artifact** with kinds `skill`/`agent`/`extension-bundle`; user-facing command `ns skills`; verb **provision**; **harness** over "platform"; AREG re-read as Artifact Registry. Package name confirmed and landed as `@nseng-ai/harness-artifacts` at `ts/packages/capabilities/harness-artifacts`, seeded by pushing down areg's lockfile/mirror/frontmatter convention code (see `updates/20260706T100934Z-harness-artifacts-package-seeded-by-areg-pushdown.md`).

- [ ] Design what the thread needs: artifact model, harness path table, provision plan, install manifest.
      Define artifact entries, catalog shape, the three entry kinds (types only; skills provision), harness specs with aliases and user-vs-project scope (including `CLAUDE_CONFIG_DIR` handling), deterministic provision-plan output, and the install manifest with per-file content hashes and source-version provenance. Thread conflict policy is LBYL refuse-to-clobber of locally edited files without `--force`; stale-after-upgrade detection and rename cleanup are manifest-enabled parked follow-ups. Install is plan-plus-apply over the first-party catalog; keep the shape compatible with the decided reconcile architecture (`updates/20260702T041140Z-reconcile-primitive-and-sdl-update-hook.md`) without implementing its generality. Evidence: tests for path resolution, alias normalization, plan output, and manifest-driven refuse-to-clobber.
      A first consumer seam already waits on this: `@nseng-ai/ns-init`'s `SkillMaterializer` gateway (copy objective skill dirs into harness roots for `claude-code`/`codex`/`pi`; areg's symlink/`npx skills` model is explicitly not the customer path — see `updates/20260705T231627Z-areg-rejected-as-customer-path-ns-init-seam.md`). The first harness set is confirmed as `pi` + `claude-code` + `codex`, and the design grows inside the seeded `@nseng-ai/harness-artifacts` package, whose pushed-down lockfile/mirror/frontmatter modules are the existing-behavior substrate (see `updates/20260706T100934Z-harness-artifacts-package-seeded-by-areg-pushdown.md`).

- [ ] Implement and validate the `ns skills` steelthread.
      One real ns-owned skill through every layer of the real system: `ns skills list` shows it, `ns skills path` shows its provision targets for all three harnesses at both scopes, and `ns skills install` deterministically previews then provisions it as a local copy, writing the install manifest — zero `npx skills` dependency, no stubbed layers. Validated end-to-end (including the `SkillMaterializer` seam or an equivalent real consumer) — this row closing is the Objective's completion gate.

## Parked

Deferred breadth from the 2026-07-06 steelthread reshape — widening the validated thread, as follow-on rows here or split-out Objectives:

- [ ] Extension-carried artifact provisioning.
      An ns extension declares bundled or companion skills statically in its package manifest (the `ns` field in `package.json`, parsed by `@nseng-ai/kernel` extension discovery); installing/enabling the extension provisions them through the shared subsystem with no extension code executed during discovery. Hook point decided (see `updates/20260702T041140Z-reconcile-primitive-and-sdl-update-hook.md`): reconcile is the primitive; a `ns update` surface is the primary commanded hook (applies, reported); a cheap load-time/invocation-time fingerprint check backstops ambient drift such as `git pull` on checked-in project-local extensions (detects and nudges, never silently writes). Where the `ns update` surface lives (kernel/extension-lifecycle vs. here) resolves with this row.

- [ ] Re-platform AREG onto the shared core as the proving second consumer.
      Replace AREG's `npx skills` materialization path with the shared provisioner and converge `skills-lock.json` with the install manifest on one hash/record format so `areg check`/`doctor` can verify casual-path installs. The prior AREG migration Objectives (`migrate-areg-and-ns-skills`, `areg-typescript-port`, `areg-ts-cli-cleanup`) have closed; plan against the landed `@nseng-ai/areg` implementation (`ts/packages/tools/areg`, including its `npx-skills` gateway and lockfile/check operations) rather than a moving port.

- [ ] Reconcile with existing skill workflows, docs, and vocabulary.
      Compare the new subsystem against `skillx`, the `@nseng-ai/areg` CLI, `npx skills`, repo skill conventions, and harness skill-invocation docs so the new CLI behavior is additive. Includes the bare-"artifact" collision cleanup: handoff artifact and consumer artifact stay owned by their domains; AREG's "managed artifacts" overlay sense is renamed (e.g. "kind overlays").

- [ ] Marketplace or remote catalog discovery.
- [ ] Update/uninstall/version-resolution command surface, stale-after-upgrade detection, and rename cleanup (the thread's install manifest enables these later; the commands themselves are not thread work).
- [ ] Provisioning the `agent` and `extension-bundle` kinds (modeled in types from day one; skills ship first).
- [ ] Replacing AREG's `npx skills add` acquisition channel for third-party GitHub skills with a first-party fetch-and-vendor path.
