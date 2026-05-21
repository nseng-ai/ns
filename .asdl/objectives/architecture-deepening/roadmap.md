# Roadmap

## Work

- [x] **Delete `gateway_access.py` pass-throughs** in `brmem/` and `asdl-pr-address/cli/pr_address/`. Op call sites bind their typed context once via `load_typed_context(...)` and read fields directly; brmem's branch resolver collapses into `Ensure.ideal_state(...)` on `DetachedHead`/`GitCommandFailure`. _Start here — smallest, cleanest deletion-test signal, exercises the deepening pattern before touching busier packages._
- [x] **Consolidate asdl-slots slot lifecycle** — introduce a single coordinating module that owns repo discovery → inventory → planning → execution. Intermediate dataclasses become implementation details; CLI commands call semantic operations (`checkout`, `init`, `resize`, `free`, `gc`). _Shipped: `checkout`, `init`, `resize`, `free`, and `gc` now route mutating slot workflows through lifecycle-owned semantic entry points returning `Slot<Op>Outcome | SlotLifecycleFailure` shapes; the corresponding CLI ops are translation/rendering or selector-resolution shells. `lifecycle` is the sole importer of `build_init_plan` / `build_resize_plan`, and `slot gc` no longer has a standalone orchestration module. Decision: `slot list` and `slot goto` remain thin read-only inventory operations rather than lifecycle APIs because their deletion-test signal is weaker than the mutating workflows; selector-specific reads in `slot free` likewise remain CLI/Graphite selection seams unless a future query abstraction has a second caller._
- [ ] **Collapse asdl-reviewer gateways into one review-environment seam** — replace `harness_detection`, `local_diff`, `review_definition`, `review_execution` with a composite gateway. Workflow becomes a thin caller of one interface. Real + fake adapters live at the new seam.
- [ ] **Move clinkr operation registration into `ClinkrGroup`** — `_register_operation` and the Pydantic-to-Click params bridge become internal seams. Cache type-hint extraction per request type. Public decorator surface unchanged.
- [ ] **Unify asdl-reviewer harness invocation** — make a harness one module with one interface (review definition + diff → findings). Registry and adapter wiring become internal. Revisit overlap with the gateway consolidation row before starting.

## Parked

_None._
