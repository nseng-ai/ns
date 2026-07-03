# Reshaped the record for autonomous pursuit

The Objective was already execution-friendly (`## Definition of Progress` +
`## Runner Policy`); this update reshapes it to the autoobjective bar following
the `code-smell-roaster-remediation` precedent and
`docs/pi/authoring-remediation-autoobjectives.md`. Decisions recorded:

- **Supported runner:** `/objective:autopilot <slug> [--submit]` — fresh child
  implements one slice and leaves it uncommitted; the parent owns commit and
  submit (`sdl flow submit --no-restack`); landing stays human. Branch creation
  goes through the branch-context Graphite path per the autoobjective branch
  policy, not bare `gt create`.
- **Sequencing gate:** enabling slices (pilot rename → vocabulary → guard →
  inventory) precede all conversion rows; no conversion row is actionable until
  the inventory is approved. Vocabulary and inventory approval remain
  steer-first; autopilot stops at steer-first rows rather than skipping ahead.
- **Inventory home:** full per-package detail (decision, proposed split,
  rationale) lives in `references/inventory.md` as durable source material —
  not current truth; slices re-verify at pickup. On approval, each containerize
  decision becomes a thin per-package conversion row in `roadmap.md`. This
  replaces the earlier plan to append the full inventory to the roadmap, per
  the anti-goal of roadmap-as-task-database.
- **Disposition vocabulary (prose, not schema):** conversion rows resolve as
  **converted** (approved split implemented, evidence recorded) or
  **re-decided** (code reality contradicted the approved split; human
  re-confirmed a new decision recorded back into the inventory). Keep-flat
  entries close at inventory approval with rationale; they never become
  conversion rows.
- **Topology shape-preservation check:** no separate shape tool. The
  rules-of-the-road guard is the structural mechanism (manifest is the only
  circle source, so conformance prevents auto-discovery reversion and orphan
  nodes); per-slice shape deltas are evidence — run `extract-graph.mjs`
  before/after and confirm package count stable, new circles only for newly
  declared subpackages, remainder only shrinking. This resolves the open
  design question from the `plan-container-packages-autonomous-execution`
  handoff about where the shape check lives.
