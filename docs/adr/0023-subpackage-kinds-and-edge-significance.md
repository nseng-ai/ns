# Subpackage kinds and edge-significance rank

Refines ADR 0022. A **Subpackage** earns declaration in `sdl.subpackages` by anchoring a class of dependency edges worth tracking — never by source size. A 40-line contract with fourteen importers outranks a 4,000-line internal layer; a low-LOC entry that anchors no edge class its siblings don't already anchor is consolidated away.

Every declared subpackage is one of four kinds, each with a sanctioned importer set:

- **API subpackage** (`api`) — the package's sole cross-package programmatic import surface, hosting its **Capability API** as a thin contract/facade over the package's internals. Importable by any package.
- **Testing subpackage** (`testing`) — the cross-package test-time contract (fakes, test kits). Importable by any package's tests, never by runtime code.
- **Host-surface subpackages** (`sdl`, `pi`, `repo-local-sdl-extension`) — thin adapters a specific host consumes as its entry surface. Importable only by that host. Per-feature entry points live inside the surface (for example `pi/land-stack.ts`), keeping surfaces thin and features host-free.
- **Feature subpackages** (open vocabulary: `land-stack`, `submit`, `cmux`, `lifecycle`, …) — named domain verticals that carry the package's meaning in topology views. Host-free: they never import host surfaces, and their edges stay inside the package. A feature may expose its own `api`/`testing` modules to sibling subpackages, but those are intra-package only; external appetite for a feature's contract is the signal it is outgrowing the package, not grounds for a second public door.

Internal horizontal layers — `operations`, `gateways`, `commands`, `shared`, `shell` — do not earn subpackage rank and live as folders inside the kind that owns them. We explicitly rejected layers-as-subpackages: layer entries are uniform boilerplate that make per-package topology say nothing package-specific, and the load-bearing import rules attach to contract and host boundaries, not to internal layering. `core` remains legitimate only as the feature subpackage naming a package's central domain, not as a layer dump.

Operational guidance (naming, checklists, consolidation mechanics) lives in `docs/conventions/subpackage-conventions.md`; canonical vocabulary lives in the root `CONTEXT.md` package-topology cluster.
