<!--
Canonical `roadmap.md` shape for the objective subsystem. Ordered,
PR-sized slices that trace how the workstream gets from today's state to
the `body.md` completion criteria.

Rules:
- One roadmap section equals one PR-sized slice.
- Every slice heading must include one visible `(slice: `<slug>`)` marker.
- Slice slugs use lowercase ASCII, digits, and hyphens only; no slash, no
  leading `objective-`, no consecutive hyphens, and usually 50 characters or
  fewer.
- Child checklist tasks belong to the section's slice and must not carry
  their own slice markers.
- Every checklist task must be codified PR work (code, tests, docs, config,
  or a deliberate delete). No manual-only or observation-only bullets like
  "live testing session" or "manual smoke-test".
- Prefer steelthreaded early slices (end-to-end) over framework-only
  scaffolding.
- Check tasks as work lands; split sections when work turned out more
  granular than expected; keep completed sections and their original slice
  markers visible for history.

Optional: drop this file entirely while the roadmap is still being
thought through — `body.md`'s `How to Make Progress` is enough until you
have a concrete slice plan.

Delete this HTML comment before use.
-->

# Roadmap

## Steelthreaded core change plus first real surface (slice: `steelthread-core-surface`)

- [ ] Smallest end-to-end slice that exercises the new design
- [ ] Tests, help, or behavior updates needed for that slice

## Next core change plus next surface (slice: `next-core-surface`)

- [ ] Next landable slice
- [ ] Follow-up needed to keep the work moving
