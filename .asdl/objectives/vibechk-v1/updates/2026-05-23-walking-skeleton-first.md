# Walking Skeleton First

## Summary

Implementation sequencing now prioritizes the earliest user-facing vertical workflow over completing every supporting layer first. The next useful slice is a thin `run -> show -> diff` loop: run the same plan in two prepared workdirs, persist enough evidence to compare them, and render Markdown that can be manually pasted into a PR.

This slice may intentionally be incomplete: one real runner is enough to start, bundle metadata can be minimal, unavailable metrics should remain `null`, and `publish`, full runner parity, `runs`, and store hardening can follow after the first real comparison works.

## Objective Impact

The roadmap has been reordered away from a layer-first sequence and toward a walking skeleton. Bundle store, run-id, runner, git, and rendering work should be implemented only as thick as needed for the first end-to-end comparison, then hardened after the user workflow is observable.

This adds a durable assumption that early user-facing workflow feedback is more valuable than up-front infrastructure polish, and records the risk that layer-by-layer hardening could delay or distort the product loop.

## Follow-Ups

- Implement the thin `run -> show -> diff` walking skeleton next.
- Keep store/schema/prefix/`runs` work minimal until it directly serves that walking skeleton.
- Defer full `claude`/`codex`/`pi` parity and `publish` until the comparison loop is usable.
