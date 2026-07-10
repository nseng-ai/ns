# Jot pad — ontology-reshape

Free-form, never authoritative. Mined from the superseded `repo-ontology` objective
(`.ns/objectives/repo-ontology/objective.md`, read at close) plus charting-session
finds. Verify against source before relying on any of it.

## Inventory facts inherited from repo-ontology (as of its last update)

- 29 tracked packages; `CONTEXT-MAP.md` Inventory Baseline still says 26 and its
  "Thirteen have present package context files" wording is off by one (12 package
  contexts + root).
- Packages absent from the map **entirely**: `@internal/ns-dev`, `@nseng-ai/ns-init`
  (owns `ns.toml` repo-root harness selection — vocabulary recorded nowhere),
  `@nseng-ai/harness-artifacts` (`ns install`/`list`/`path`/`update` surface).
- Packages with **no recorded context decision**: pr-feedback, clinkr, foundation,
  nscc, ns (ns-cli), command-backed-skill-registry, pi-command-surfaces,
  typescript-style-guard, plus the three absent ones above.
- **Partial decisions**: capability-kit (graphite subpackage only, no kit-level
  decision); pi-tools (Planned subpackage targets, no container-level decision).
- The map's Planned slate includes `@nseng-ai/flow-pi`, which is *not a tracked
  package* — planned architecture recorded as if inventory.

## Open questions inherited from repo-ontology

- Foundation: one context entry with H2 anchors vs. per-subpackage files (provisional:
  single entry; do not split unless a subpackage graduates).
- Severe cross-context ambiguity: canonicalize one repo-wide name vs. preserve
  package-local names with documented boundaries (provisional: preserve local names
  when concepts differ; `Avoid` aliases guard synonym collapse).
- ADR corpus: 36 ADRs, numbers 0001–0031, with 0012/0016/0022/0023/0024 each used
  twice. Map has no ADR index. Old leaning: keep authoring parked, consider a single
  map pointer to `docs/adr/`.
- Residual stale `sdl`/`ji`/`@ns` naming may linger in package context prose —
  opportunistic fix territory.
- Maintenance cadence after the sweep: opportunistic-on-PR vs. periodic re-grill —
  now this map's "post-map maintenance ownership" fog.

## Charting-session finds

- `ts/packages/` on disk is littered with leftover directories from retired
  identities (`address`, `aretro`, `asdl-core`, `autobranch`, `roaster`, `sdl-sdk`,
  `sdlcc`, `slot`, `objective`, `local-pi-tools`, `worktree-status`, ...) — untracked
  residue from moves. Physical cleanup would make the topology legible from `ls`
  alone; candidate small task or part of a layering-reshape spec.
- The four user-named suspect clusters (CCC/orchestration, layering vocabulary,
  source-control lifecycle, review/feedback residue) all involve *meta*-vocabulary as
  much as product vocabulary — a hunch that the ontology's biggest impurity is the
  describing-language, not the domain nouns.
- `cross-harness-parity` orientation ("Pi is additive, never canonical") and
  `extension-descriptor-contract` (typed descriptor modules) are live initiatives whose
  direction constrains the layering reexamination — read their orientations before that
  grilling session.
