# Roadmap

## Work

- [x] Inventory the overlap surface: every doc, skill, CONTEXT.md, and code identifier where old and new skill/artifact vocabulary or workflows meet. Record as a Semantic Update with a disposition per item; this bounds the sweep.
      **Done 2026-07-07**: `updates/20260707T161121Z-overlap-surface-inventory.md` — items A–E with per-item dispositions. Key findings: no machine-facing identifier carries "managed artifacts" (rename is textual-only); `skill-management` is first-party, editable in place (resolves that Open Question); neither `skill-conventions.md` nor the `skill-management` skill mentions `ns skills`/`ns update` at all.
- [x] Settle the replacement term for AREG's "managed artifacts" overlay sense (working candidate: "kind overlays") against CONTEXT.md conventions, then execute the mechanical rename across `skill-kind.ts`, `skill-kind-apply-plan.ts`, tests, and output strings. Flag machine-facing renames.
      **Done 2026-07-07**: `updates/20260707T163033Z-harness-overlays-term-decision.md` — final term **harness overlays**; textual-only rename across AREG user-facing strings, scenario test name, and live convention prose/table; no machine-facing identifiers changed.
- [x] Update `docs/conventions/skill-conventions.md` and the `skill-management` skill positioning to the additive two-channel story (`ns skills`/`ns update` first-party provisioning; `npx skills` third-party acquisition; AREG whole-project inspector over both records).
      **Done 2026-07-07**: `updates/20260707T170500Z-two-channel-layered-positioning.md` — landed as a layered-management story (four-layer stack + overlay-seam invariant for externally sourced skills); includes the minimal `harness-skill-invocation.md` additivity pointer (inventory item C); `commands.md` deliberately unchanged; full `skill-management` rewrite deliberately declined.
- [x] Sweep residual `skillx` references (`skills/python-fake-driven-test-layout/SKILL.md`, `docs/retros/cli-surface-conformance-audit.md`, pi-tools backing-skill-commands test, areg cli-shape test), preserving deliberately-historical records with clarifying notes only where actively misleading.
      **Done 2026-07-07**: `updates/20260707T165430Z-residual-skillx-sweep.md` — live skill guidance and guard tests now use neutral/fictional names; `docs/retros/cli-surface-conformance-audit.md` preserved as historical evidence with its existing historical-status banner; scoped `rg` clean outside that preserved retro; targeted Vitest suites, tsgo, and dprint passed.
- [x] Align affected domain CONTEXT.md files with the harness-artifact vocabulary, including `Avoid` entries for bare "artifact" (where ambiguous) and "platform" (for harness).
      **Done 2026-07-07**: `updates/20260707T173213Z-context-vocabulary-alignment.md` — root `CONTEXT.md` now carries the binding harness-artifact vocabulary cluster, and `CONTEXT-MAP.md` reflects **harness overlays** plus the partially settled Skill/agent/resource ambiguity.

## Parked

No parked rows remain here. The areg push-down row moved to the `skill-management-subsystem` umbrella at closure.
