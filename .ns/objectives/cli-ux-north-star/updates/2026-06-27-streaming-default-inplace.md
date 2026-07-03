# flow submit streaming: in-place only (append dropped)

## Summary

Decided the streaming presentation for `flow submit` by feel (real terminal, both variants sharing
the dialed-in cadence): **in-place, and append dropped entirely.**

- **In-place (the presentation)** — live region that owns the cursor: per-phase spinner→`✓`, a
  single log-tail line under the active phase, then a settled `Submitted` block. Polished and
  compact; collapses to one clean final frame. Non-TTY/CI settles to a single static frame
  (`--static`).
- **Append — removed.** Its only role was a non-TTY/scrollback fallback, and that's already
  covered: the static settled frame handles non-TTY humans, and machine `--format json` (the real
  layer) handles CI/scripts. An append variant is redundant, so it was cut from the harness
  (`renderAppend`, `--variant`, the option plumbing) to keep the prototype faithful to the design.

Chose polish over append's raw-robustness, accepting that the in-place live region's reconciliation
against raw subprocess passthrough is deferred to the rebuild.

## Objective Impact

- Roadmap row 2 (dial-in + sign-off) advances: the streaming presentation is settled and append is
  gone from the design surface.
- The deferred risk is unchanged and already parked: "Reconcile the in-place live region against
  raw subprocess passthrough" remains a Parked roadmap item for the real rebuild. The prototype
  fakes it via the log-tail.
- The rebuilt `flow submit` should be in-place only; non-interactive output is the static settled
  frame plus `--format json`, not a separate append renderer.

## Follow-Ups

- Glyph-set pass (next), then full row-2 sign-off → unblocks the clinkr foundations + rebuild rows.
