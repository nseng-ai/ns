# `@internal/pi-tools`

Private, repository-only Pi tools used by this ns checkout. This container package is not
published and is not a platform surface.

## Current tools

- `backing-skill-commands` — generated command-backed skill surfaces.
- `code-workflows` — repo-specific workflow selection, CI debugging, and smart-restack UI.
- `context-profiler` — Pi context inspection and analysis.
- `grill` — structured grilling UI and tool behavior.
- `pr-feedback-watch` — project-local PR feedback watching and session behavior.
- `side-session` — shared side-session substrate used by other Pi tools.
- `slash-command-rerank` — project-local slash-command ordering policy.
- `stack-view` — Graphite/GitHub stack presentation.
- `thermo-council` — multi-runner review council behavior.

## Near-term organization follow-up

The package remains one private container during the package-ontology cutover. Soon after
that cutover, break these nine units into dedicated subfolders under the Pi tools ontology
rather than leaving them consolidated behind one `pi-tools` leaf. Preserve the
`@internal/*` private boundary and review each resulting leaf identity before moving code.
