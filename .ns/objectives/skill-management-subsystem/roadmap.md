# Roadmap

## Work

- [x] Establish the package and command vocabulary for the `ns` CLI.
      Decided (see `updates/20260702T035321Z-harness-artifact-vocabulary-and-layering.md`): domain term **harness artifact** with kinds `skill`/`agent`/`extension-bundle`; user-facing command `ns skills`; verb **provision**; **harness** over "platform"; AREG re-read as Artifact Registry. Package name confirmed and landed as `@nseng-ai/harness-artifacts` at `ts/packages/capabilities/harness-artifacts`, seeded by pushing down areg's lockfile/mirror/frontmatter convention code (see `updates/20260706T100934Z-harness-artifacts-package-seeded-by-areg-pushdown.md`).

- [x] Subobjective `ns-skills-steelthread`: designed and validated the `ns skills` thread end-to-end. **Closed 2026-07-06 as completed** (see the child's `## Closure` and umbrella synthesis `updates/20260706T153500Z-steelthread-closed-synthesis.md`).
  The child delivered the full thread: the artifact model / harness path table / provision plan / install manifest, and `ns skills list/path/install [--dry-run] [--force]` provisioning the real `objective` skill for `pi`/`claude-code`/`codex` at both scopes with a per-file-SHA-256-hashed install manifest, zero `npx skills` dependency, consumed through the `@nseng-ai/ns-init` `RealSkillMaterializer` seam. Every Completion Criterion was independently re-verified against the real system and full `just` is green (main suite 4539, style-guard 120, tsgo, edge sweep `sweep-ok`). Cross-child lesson synthesized in the update above.

- [ ] Decide the disposition of each parked-breadth row after the steelthread validates.
      Per the Steelthread pattern: each row below either widens the validated thread as a follow-on slice or splits into its own Subobjective (edge-tracked). Record dispositions as Semantic Updates.

## Parked

Deferred breadth from the 2026-07-06 steelthread reshape — widening the validated thread, as follow-on rows here or split-out Subobjectives:

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
