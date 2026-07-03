# Rename SDL to ji

The product renames from SDL ("Source Development Lifecycle") to **ji** — a proper name
with no expansion, always lowercase, including at sentence starts (rewrite the sentence
rather than capitalize). Never `JI`, `Ji`, or an acronym. Pronounced "jee".

The cutover is hard, lands in one window, and ships zero compatibility codepaths: no
`sdl` alias bin, no `.sdl/` or legacy-XDG read fallback, no `/sdl:*` Pi aliases, and no
scrubbing of historical prose (archived objectives, old updates, and commit messages keep
saying "sdl" forever). This is safe because the consumer population at decision time is
exactly this repository and the owner's machines, and it honors the compat-deletion
stance the closed `sdl-config-layout-migration` objective established. Timing forced the
decision: three in-flight objectives (`checkout-free-sdl-distribution`,
`ship-objectives-to-customers`, `eve-parity-docs-site`) were about to freeze the old name
into published npm packages, customer repos, and docs-site URLs; renaming first keeps
this a find-replace instead of a published-package and customer-state migration.

Rejected alternatives:

- **sdl** (status quo) — an expansion-burdened acronym whose letters are heavily
  overloaded elsewhere (Simple DirectMedia Layer, Microsoft's Security Development
  Lifecycle); the publish window forced the question now.
- **asdl** — inherits the acronym problem it was trying to fix and collides with Python's
  ASDL (the Abstract Syntax Description Language behind CPython's AST).
- **erk** — phonetically unpleasant ("irk") for a name said aloud.
- **jib** — no defect; the original candidate, displaced on sight when ji appeared.

ji won on brevity, loop-variable resonance (`j` and `i`, the two canonical index names),
the djinn homage, and the two-letter-CLI aesthetic with `uv` and `ty` as prior art.

Accepted collisions, consciously de-risked by nothing:

- Jujutsu's `jj` is one keystroke away in the same git-tooling space.
- A nontrivial population binds `ji` as a zoxide "jump interactive" alias.
- The unscoped npm `ji` slug is squatted by an abandoned placeholder (a CoffeeScript
  "JSON Inspector", single v0.0.0 release from March 2013). No dispute is filed — not as
  plan A, not as fallback.

npm plan: packages publish under the existing **`@nseng-ai` scope**. The product CLI
package name is `ji`, yielding the publish target `@nseng-ai/ji`; no `@ji` npm org/scope
is claimed. The CLI installs a bin named `ji`, so users type `ji`; packaging details
beyond the product package target remain `checkout-free-sdl-distribution`'s call, since
that objective owns packaging. This resolves the publish-name open question that
objective carried.

The marketing narrative and the fuller naming deliberation live in
`docs/ji-naming-brief.md`; this ADR records the verdicts.
