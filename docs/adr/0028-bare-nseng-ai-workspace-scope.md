# Bare @nseng-ai workspace scope — no publish-time alias mapping

Standalone npm publishing of the runtime closure (per the
`checkout-free-sdl-distribution` Objective's 2026-07-05 standalone-publish decision)
forced a choice between two mapping strategies: rename workspace packages to their
published names, or keep the internal `@ns/*` scope and generate per-package publish
roots that rewrite every dependency edge to `@nseng-ai/*` via npm aliases
(`"@ns/x": "npm:@nseng-ai/x@0.1.0"`). We built the second option end-to-end on the
`standalone-publish-alias-machinery` branch — discovery, topo-sorted per-package dist
builds, publish-root generation, packing, a foreign-consumer smoke, and a runtime
version-coherence guard, all green — precisely to price it before committing.

**Decision (2026-07-05): we will not maintain the alias layer. The workspace scope
becomes bare `@nseng-ai/*` — internal package names equal published names, with no
workspace-name-to-published-name mapping anywhere.**

The measured cost of the alias approach, not its feasibility, drove the rejection.
Roughly 40% of the ~880-LOC machinery was permanent mapping tax that a rename deletes:
`externalName` manifest keys and internal→external translation, an exact-pinned npm-alias
dependency entry per in-set edge (with lockstep republish of the whole set, forever), and
consumer-facing alias oddities (installed folder name ≠ manifest name, alias-support
variance across package managers, `overrides` gymnastics in any `file:`-based install).
It also stood on standing invariants that grow with the package set and can silently
move under us — sharpest among them TypeScript's external-library non-emission
semantics, which a compiler upgrade could shift with only a pack-time assertion as the
tripwire. The durable ~60% of that build — per-package dist builds, publish-root
generation (exports/bin rewrite, dev-field stripping, asset passthrough), discovery +
topo-sort + packing, the smoke's substantive assertions, and the mixed-version
fail-fast guard — survives the rename and is kept.

Consequences:

- This amends ADR 0026's npm-plan clause ("the internal workspace scope is `@ns/*`").
  Everything else in 0026 stands: the product is `ns`, the bin is `ns`, `.ns/`,
  `/ns:*`, `NS_*`, and `@nseng-ai/ns` as the CLI publish target are all unchanged —
  only the npm workspace scope moves from `@ns/*` to `@nseng-ai/*`.
- The scope rename happens before the publish surface widens; nothing ships on the
  alias layer, including wave 1. The `pkg-scope-sweep` codemod lineage from the
  `rename-ji-to-ns` cutover retargets directly at `@ns/*` → `@nseng-ai/*`.
- Publishing a package now means its workspace name is public API from day one; there
  is no internal/external naming seam left to hide behind.
