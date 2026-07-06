# `@nseng-ai/init` renamed to `@nseng-ai/ns-init` before scaffold

## What changed

Amended one derived design decision from the 2026-07-01 grilling session
(`updates/20260701T185244Z-grilling-decisions-and-distribution-split.md`): the `ns init`
capability package scaffolds as **`@nseng-ai/ns-init`**, not `@nseng-ai/init`. Everything
else about that decision stands — capability-tier package, `SkillMaterializer` gateway
seam, reuse of `@nseng-ai/foundation/managed-region`, areg `init` as pattern reference
only, surfaced as top-level `ns init`.

## Rationale

- **Taxonomy.** `ts/packages/capabilities/` holds domain capabilities (`objectives`,
  `flow`, `handoffs`, `slots`, …). `init` is not a domain — it is the ns product
  bootstrapping itself in a customer repo. A bare `@nseng-ai/init` overstates it as a
  peer capability and squats a generic name in the org scope; the ns-attached name says
  what it is.
- **Not a host subpath.** Folding the code into `@nseng-ai/ns` (`ts/packages/hosts/ns-cli`)
  was considered and rejected: the host is a deliberate one-file assembler
  (`"tier": "host"`), capabilities and the dev run-from-source kernel bin cannot import
  code that lives in the host, and that package is under active rewrite by
  `checkout-free-sdl-distribution`. The genuinely host-shaped piece — the real
  `SkillMaterializer` adapter that locates skill dirs bundled inside the published
  artifact — is injected by the host at wiring time; that is exactly the gateway seam.
- **Distribution identity.** The package is `private: true` permanently and ships only
  folded into the published `@nseng-ai/ns` esbuild bundle (same treatment as
  `@nseng-ai/kernel`). Customers only ever see `@nseng-ai/ns`; no standalone publish, no
  addition to `checkout-free-sdl-distribution`'s publish set. Note for that Objective's
  bookkeeping: this adds one to the private-package inventory it tracks (9 of 25 at its
  last rebaseline), with a recorded treatment of bundle-inline.

## Objective impact

- `objective.md` Resolved Decisions / naming prose and `roadmap.md` scaffold row now name
  `@nseng-ai/ns-init`.
- No scope change; the scaffold row remains the next unblocked slice and proceeds against
  a run-from-source install while the checkout-free dependency finishes elsewhere.
