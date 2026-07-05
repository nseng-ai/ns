**Direction: the product is `ns`; `ji` is the legacy name being cut over.**

Getting to: one name everywhere — `ns` bin, `.ns/`, `/ns:*`, `@nseng-ai/*` workspace
packages (ADR 0028: internal names equal published names; the CLI package is
`@nseng-ai/ns`), `NS_*` env vars, XDG `*/ns/`; lowercase-always `ns`, rationale and
accepted collisions in ADR 0026 and `docs/ns-naming-brief.md`.

What you see now — trunk mostly speaks `ns`: core invocation, repo state, Pi extension,
skill dirs, workspace package names, `ns.toml`, and machine migration are landed. Legacy
`ji` may still appear in residual active prose or identifiers; historical records stay
verbatim.

Avoid: introducing new `ji`-named surfaces, paths, commands, packages, or vocabulary;
adding ji→ns compat shims or fallbacks (hard cutover); mass-editing archived records or
historical prose to scrub the old name; "fixing" pre-existing non-brand `ns` tokens
(brmem's `refs/brmem/ns/` segment, `<ns>` placeholders — see this objective's
collision-register.md).

Active slice: finish residual `ji` trail cleanup/rebaseline, then close this Objective.
