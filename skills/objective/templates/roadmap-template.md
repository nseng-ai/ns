<!--
Canonical `roadmap.md` shape for the objective subsystem. A roadmap is an
ordered, numbered plan that traces how the workstream gets from today's state
to the `body.md` completion criteria.

Rules:
- Use numbered entries (`1.`, `2.`, `3.`). Nested numbered subentries are fine
  when a single entry needs to be split later (`3.1`, `3.2`).
- Do not pre-label entries as PRs, stacks, docs-only work, or splits. The
  `objective-next` workflow recommends the implementation shape when the entry
  is selected.
- Every checklist task must be codified work (code, tests, docs, config, or a
  deliberate delete). No manual-only or observation-only bullets like "live
  testing session" or "manual smoke-test".
- Prefer early entries that exercise the real end-to-end behavior over
  framework-only scaffolding.
- Check tasks as work lands; split entries when work turned out more granular
  than expected; keep completed entries visible for history.

Optional: drop this file entirely while the roadmap is still being thought
through — `body.md`'s `How to Make Progress` is enough until you have a
concrete numbered plan.

Delete this HTML comment before use.
-->

# Roadmap

1. Steelthreaded core change plus first real surface

- [ ] Smallest end-to-end change that exercises the new design
- [ ] Tests, help, or behavior updates needed for that entry

2. Next core change plus next surface

- [ ] Next landable change
- [ ] Follow-up needed to keep the work moving
