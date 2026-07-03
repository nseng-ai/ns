# Reference material — TypeScript CLI Architecture Deepening

This directory holds the full audit context behind the nine candidates in `../objective.md`. It exists so a future session can pick up any candidate, or re-prioritize, without re-running the `improve-codebase-architecture` pass.

## Contents

- **`architecture-review.html`** — the original self-contained visual report (Tailwind + Mermaid). Before/after diagrams and recommendation strength per candidate. Open in a browser.
- **`method-and-vocabulary.md`** — how the audit was run, the `codebase-design` glossary used throughout, the deletion test, and the two-adapter rule. Read this first if the terms in the findings are unfamiliar.
- **`findings-asdl-core.md`** — full findings for the shared `asdl-core` library (submit subsystem, gateways, github-pr-feedback). 5 candidates.
- **`findings-ccc.md`** — full findings for the `ccc` orchestration CLI. 4 candidates.
- **`findings-slot-sdl-sdlcc.md`** — full findings for `slot`, `sdl`, `sdlcc`. 5 candidates.
- **`findings-memory-context-clis.md`** — full findings for `brmem`, `handoff`, `branch-context`, `objective`, `plans`. 5 candidates.
- **`findings-review-eval-clis.md`** — full findings for `roaster`, `aretro`, `vibechk`, `packagechk`, `pr-address`, `areg`. 5 candidates.
- **`candidate-map.md`** — maps the nine curated roadmap candidates back to the raw findings, and lists the raw findings that were *not* promoted to the roadmap (with why).

## Provenance

- Pass run on branch `remove-final-python-runtime` (checkout under `worktrees/slot-02`), 2026-06-20.
- Method: five parallel `Explore` agents, one per package group, each applying the deletion test and the deep/shallow vocabulary; results curated into nine candidates.
- Line counts and file paths reflect that checkout. Re-verify before acting on any candidate — refactors may have moved or renamed modules.
- Raw findings are reproduced verbatim-in-substance from the exploration agents; light editing for consistency only. Treat agent claims about line numbers and symbol names as leads to verify, not ground truth.
