**Direction: the product is `ns`; `ji` is the legacy name being cut over.**

Getting to: one name everywhere — `ns` bin, `.ns/`, `/ns:*`, `@nseng-ai/*` workspace
packages (ADR 0028: internal names equal published names; the CLI package is
`@nseng-ai/ns`), `NS_*` env vars, XDG `*/ns/`; lowercase-always `ns`, rationale and
accepted collisions in ADR 0026 and `docs/ns-naming-brief.md`.

What you see now — the core surfaces (bin, `.ji/`, `/ji:*`, `@ji/*`, `JI_*`, XDG) still
say `ji`. Legacy, not a convention to follow.

Avoid: introducing new `ji`-named surfaces, paths (especially `.ji/`), commands,
packages, or vocabulary; adding ji→ns compat shims or fallbacks (hard cutover);
mass-editing archived records or historical prose to scrub the old name; "fixing"
pre-existing non-brand `ns` tokens (brmem's `refs/brmem/ns/` segment, `<ns>`
placeholders — see this objective's collision-register.md).

Active slice: see this objective's roadmap.md.
