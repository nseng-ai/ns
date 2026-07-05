# Happy-path launch slice: launch bar opened, gate-removal row added

## Summary

The 2026-07-05 happy-path charting session (recorded in
`ship-objectives-to-customers`,
`updates/20260705T185714Z-happy-path-pi-install-decisions.md`) set a fully-live ship
bar for the first customer slice: docs site publicly deployed on nseng.ai with the
three-command objectives happy path real and stranger-verified on Claude Code. That
makes this Objective's launch mechanics concrete and opens a scoping question it owns:
what the rest of the site must look like when only the happy path is guaranteed real.

## Objective Impact

- New Open Question: launch bar for non-happy-path content (hide vs rewrite vs
  mark-immature; must-stay-private pages such as internal tooling the happy path
  excludes; north-star-rewrite dependency; full IA restructure vs minimal Get-Started
  slice).
- Roadmap: launch-bar decision row and a go-live row (remove the Vercel
  `ignoreCommand` gate, confirm nseng.ai wiring, deploy, smoke happy-path pages +
  search + machine routes), gated on the Claude-Code stranger verification owned by
  `ship-objectives-to-customers`.
- IA restructure row annotated: decide the minimal launch slice first; the Pi-style
  bare-core + `ns install` model reinforces the kernel+extensions IA direction.

## Follow-Ups

- Resolve the launch-bar Open Question before gate removal.
- Reconcile Get Started content ownership: prose is owned by
  `ship-objectives-to-customers`; shell, IA, and gating stay here.
