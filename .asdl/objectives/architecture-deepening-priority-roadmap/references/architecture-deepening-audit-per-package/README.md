# Architecture Deepening Audit — Per-Package Reports

This folder contains read-only per-package architecture audits using the `improve-codebase-architecture` model:

- **Module** / **interface** / **implementation** / **depth** / **seam** / **adapter** / **leverage** / **locality** vocabulary.
- **Deletion test**: if deleting a module makes complexity vanish, it is shallow/pass-through; if complexity reappears across callers/tests, it earns its keep.
- **Interface is the test surface**.
- **One adapter = hypothetical seam; two adapters = real seam**.

The audit intentionally covered the 11 substantive Python packages. `asdl-dispatcher` and `asdl-reviewer` were not given full subagent sessions because the prior handoff identified `asdl-dispatcher` as effectively empty/out of scope and `asdl-reviewer` as historical/replaced by `roaster`.

## Reports

| Package           | Report                                                                                     | Verdict                                         | Primary recommendation                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `asdl-slots`      | [asdl-slots.md](./asdl-slots.md)                                                           | Top serious target                              | Deepen slot release/free/gc workflow; fix checkout planning-time mutation.                                                          |
| `asdl-core`       | [asdl-core.md](./asdl-core.md), [asdl-core-cross-package.md](./asdl-core-cross-package.md) | Highest cross-package leverage                  | Domain output converters for real Git/GH/GT adapters; reduce subprocess-test brittleness; localize production gateway construction. |
| `asdl-objectives` | [asdl-objectives.md](./asdl-objectives.md)                                                 | Cleanest self-contained win                     | Deepen checked-in Objective Markdown storage.                                                                                       |
| `roaster`         | [roaster.md](./roaster.md)                                                                 | Mostly healthy, two serious targets             | Deepen inline findings publication; consider stack mutating workflow locality.                                                      |
| `asdl-pr-address` | [asdl-pr-address.md](./asdl-pr-address.md)                                                 | Generally healthy                               | Deepen feedback snapshot / prepare-run policy.                                                                                      |
| `areg`            | [areg.md](./areg.md)                                                                       | Sprawl cleanup plus one serious locality target | Extract init planning/managed-block behavior; collapse check leaf file seams.                                                       |
| `vibechk`         | [vibechk.md](./vibechk.md)                                                                 | Both collapse and deepen                        | Collapse hypothetical GitGateway ABC; deepen run-store interface.                                                                   |
| `packagechk`      | [packagechk.md](./packagechk.md)                                                           | Well-architected                                | Targeted claim orchestration deepening only.                                                                                        |
| `asdl-handoff`    | [asdl-handoff.md](./asdl-handoff.md)                                                       | Mostly cleanup                                  | Concentrate handoff slug/key contract; optional inventory/branch resolver cleanup.                                                  |
| `aretro`          | [aretro.md](./aretro.md)                                                                   | Mostly cleanup                                  | Inline `gateway_access.py`; consolidate compact result conversion.                                                                  |
| `brmem`           | [brmem.md](./brmem.md)                                                                     | Negative control                                | Keep `BranchMemoryGateway` seam; optional Git snapshot-tree internal extraction.                                                    |

## Cross-package ranking for the architecture skill report

1. **`asdl-slots`** — best fit for a deep architecture report: high test/source ratio, duplicated lifecycle/CLI orchestration, free/gc cleanup policy split, and a likely correctness bug in checkout planning.
2. **`asdl-core`** — highest leverage because many packages depend on it; focus narrowly on real adapter output conversion and test locality, not broad `clinkr` redesign.
3. **`asdl-objectives`** — cleanest single-package implementation target with a clear storage seam and low cross-package disruption.
4. **`roaster`** — architecture is mostly strong, but inline findings publication and stack workflow density are worth deeper design attention.
5. **`asdl-pr-address`** — healthy, but feedback snapshot / prepare-run policy could reduce scenario-test burden.
6. **`areg`** — mostly file-layout sprawl; `init_project.py` is the strongest locality target.
7. **`vibechk`** — inverse problem: collapse hypothetical seams and deepen the run store.
8. **`packagechk`** — well-architected; claim-flow duplication is the only notable target.
9. **`asdl-handoff`** — useful cleanup, low architecture leverage.
10. **`aretro`** — cleanup around DTO conversion and pass-through context access; preserve evidence-vs-judgment boundary.
11. **`brmem`** — negative control; leave broad architecture intact.

## Validation notes

Most subagents were inspection-only and did not run tests. The `asdl-core-cross-package.md` file is a companion consumer-side report for `asdl-core`, not a separate package audit. Two subagents ran package tests as additional validation:

- `asdl-handoff`: `uv run pytest packages/asdl-handoff/tests/scenario/test_handoff_cli.py` → 40 passed.
- `brmem`: `uv run pytest packages/brmem/tests` → 335 passed.

No source/package files were intentionally edited; this folder contains the generated audit artifacts.
