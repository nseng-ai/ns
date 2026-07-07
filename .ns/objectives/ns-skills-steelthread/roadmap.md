# Roadmap

## Work

- [ ] Design what the thread needs: artifact model, harness path table, provision plan, install manifest.
      Define artifact entries, catalog shape, the three entry kinds (types only; skills provision), harness specs with aliases and user-vs-project scope (including `CLAUDE_CONFIG_DIR` handling), deterministic provision-plan output, and the install manifest with per-file content hashes and source-version provenance. Thread conflict policy is LBYL refuse-to-clobber of locally edited files without `--force`; stale-after-upgrade detection and rename cleanup are manifest-enabled follow-ups parked in the umbrella. Install is plan-plus-apply over the first-party catalog; keep the shape compatible with the decided reconcile architecture (umbrella update `20260702T041140Z-reconcile-primitive-and-sdl-update-hook.md`) without implementing its generality. Evidence: tests for path resolution, alias normalization, plan output, and manifest-driven refuse-to-clobber.
      A first consumer seam already waits on this: `@nseng-ai/ns-init`'s `SkillMaterializer` gateway (copy objective skill dirs into harness roots for `claude-code`/`codex`/`pi`; areg's symlink/`npx skills` model is explicitly not the customer path — umbrella update `20260705T231627Z-areg-rejected-as-customer-path-ns-init-seam.md`). The first harness set is confirmed as `pi` + `claude-code` + `codex`, and the design grows inside the seeded `@nseng-ai/harness-artifacts` package, whose pushed-down lockfile/mirror/frontmatter modules are the existing-behavior substrate (umbrella update `20260706T100934Z-harness-artifacts-package-seeded-by-areg-pushdown.md`).
      Policy: runner steps may execute this row directly as types-plus-pure-logic slices (artifact model; harness path table; provision plan; manifest format) inside `@nseng-ai/harness-artifacts`. Record binding design decisions as Semantic Updates. Ask before fixing a public API shape intended to outlive the thread or resolving the plan-subcommand vs `install --dry-run` open question.
      Evidence: passing tests for path resolution, alias normalization, plan output, and manifest-driven refuse-to-clobber.

- [ ] Implement and validate the `ns skills` steelthread.
      One real ns-owned skill through every layer of the real system: `ns skills list` shows it, `ns skills path` shows its provision targets for all three harnesses at both scopes, and `ns skills install` deterministically previews then provisions it as a local copy, writing the install manifest — zero `npx skills` dependency, no stubbed layers. Validated end-to-end (including the `SkillMaterializer` seam or an equivalent real consumer) — this row closing is the Objective's completion gate.
      Policy: runner steps may execute this row directly once the design row's substrate exists, slice by slice (materialization apply + manifest write; `ns skills list/path/install` CLI wiring with deterministic preview; `SkillMaterializer` seam consumption). No stubbed layers count as progress. Provisioning into real user-global harness directories happens only in tests or explicit user-invoked commands.
      Evidence: `ns skills` output against a real ns-owned skill for all three harnesses at both scopes; install manifest with per-file hashes verified in tests; the consumer seam exercised end-to-end.

## Parked

None. Deferred breadth is coordinated by the umbrella `skill-management-subsystem` (its `## Parked`); this record stays thread-only by design.
