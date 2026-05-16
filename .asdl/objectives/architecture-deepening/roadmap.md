# Roadmap

## Work

- [x] **Delete `gateway_access.py` pass-throughs** in `brmem/` and `asdl-pr-address/cli/pr_address/`. Op call sites bind their typed context once via `load_typed_context(...)` and read fields directly; brmem's branch resolver collapses into `Ensure.ideal_state(...)` on `DetachedHead`/`GitCommandFailure`. _Start here — smallest, cleanest deletion-test signal, exercises the deepening pattern before touching busier packages._
- [~] **Consolidate asdl-slots slot lifecycle** — introduce a single coordinating module that owns repo discovery → inventory → planning → execution. Intermediate dataclasses become implementation details; CLI commands call semantic operations (`checkout`, `init`, `resize`, `gc`). _Status: `checkout`, `init`, and `resize` consolidated — `lifecycle.checkout_branch` / `checkout_current` / `initialize_pool` / `resize_pool` now own metadata-dir ensure → inventory build → planning → execution and return `Slot<Op>Outcome | SlotLifecycleFailure` discriminated unions; the corresponding CLI ops shrank to translation/rendering shells. `lifecycle` is the sole importer of `build_init_plan` / `build_resize_plan`. `free`, `gc`, `list` still orchestrate `build_slot_inventory` / `ensure_slots_metadata_dir` directly from their CLI ops and remain to be migrated._
- [ ] **Collapse asdl-reviewer gateways into one review-environment seam** — replace `harness_detection`, `local_diff`, `review_definition`, `review_execution` with a composite gateway. Workflow becomes a thin caller of one interface. Real + fake adapters live at the new seam.
- [ ] **Move clinkr operation registration into `ClinkrGroup`** — `_register_operation` and the Pydantic-to-Click params bridge become internal seams. Cache type-hint extraction per request type. Public decorator surface unchanged.
- [ ] **Unify asdl-reviewer harness invocation** — make a harness one module with one interface (review definition + diff → findings). Registry and adapter wiring become internal. Revisit overlap with the gateway consolidation row before starting.

## Parked

_None._
