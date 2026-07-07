# Roadmap

## Work

- [x] Inventory the overlap surface: every doc, skill, CONTEXT.md, and code identifier where old and new skill/artifact vocabulary or workflows meet. Record as a Semantic Update with a disposition per item; this bounds the sweep.
      **Done 2026-07-07**: `updates/20260707T161121Z-overlap-surface-inventory.md` — items A–E with per-item dispositions. Key findings: no machine-facing identifier carries "managed artifacts" (rename is textual-only); `skill-management` is first-party, editable in place (resolves that Open Question); neither `skill-conventions.md` nor the `skill-management` skill mentions `ns skills`/`ns update` at all.
- [x] Settle the replacement term for AREG's "managed artifacts" overlay sense (working candidate: "kind overlays") against CONTEXT.md conventions, then execute the mechanical rename across `skill-kind.ts`, `skill-kind-apply-plan.ts`, tests, and output strings. Flag machine-facing renames.
      **Done 2026-07-07**: `updates/20260707T163033Z-harness-overlays-term-decision.md` — final term **harness overlays**; textual-only rename across AREG user-facing strings, scenario test name, and live convention prose/table; no machine-facing identifiers changed.
- [ ] Update `docs/conventions/skill-conventions.md` and the `skill-management` skill positioning to the additive two-channel story (`ns skills`/`ns update` first-party provisioning; `npx skills` third-party acquisition; AREG whole-project inspector over both records).
- [ ] Sweep residual `skillx` references (`skills/python-fake-driven-test-layout/SKILL.md`, `docs/retros/cli-surface-conformance-audit.md`, pi-tools backing-skill-commands test, areg cli-shape test), preserving deliberately-historical records with clarifying notes only where actively misleading.
- [ ] Align affected domain CONTEXT.md files with the harness-artifact vocabulary, including `Avoid` entries for bare "artifact" (where ambiguous) and "platform" (for harness).

## Parked

- (none)
