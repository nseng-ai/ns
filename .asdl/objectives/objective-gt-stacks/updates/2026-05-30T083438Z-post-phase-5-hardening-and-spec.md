# Post-Phase-5 hardening: restack annotation, rename-aware touches, gt subpackage, and spec doc

## Summary

Three commits landed on `master` after the Phase 5 Pi-wrapper update and finish a post-Phase-5 hardening, consolidation, and docs slice for `objective gt stacks`. The Objective tracking files were last touched at Phase 5 (`1df07d24`); these landed afterward and were not yet reflected:

- `needs_restack` annotation (`628f8dc6`): `GtTrackedBranch` gains a `needs_restack` flag populated from optional Graphite parent-revision metadata columns, and the `gt stacks` renderer surfaces it as a cheap, deterministic restack-health annotation. Validation-result matching is normalized so `OK`/`VALID`/`TRUNK`/empty are routine (no annotation) and case/hyphen variants of `NEEDS_RESTACK` are handled.
- Rename-aware touch parsing + gt-stacks fixes (`17d18542`): the git gateway's `path_touches_under` switches from `--name-only` to `--name-status -M`, so renamed/copied files contribute both old and new paths and deletions surface correctly as touches. Same commit flattens the Graphite CLI context (`ObjectiveGtCliContext` holds `repo_root` and `git` directly via `build_objective_gt_context`), extracts local-branch scoping into its own module with warning deduplication, and fixes "objective branches" pluralization.
- `gt/` subpackage consolidation (`164fda53`): the `gt_stack_*` modules are consolidated into an `asdl_objectives/gt/` subpackage, intermediate projection models are collapsed, and the CLI command handler is unified. Internal refactor only — no user-facing CLI contract change.

Docs landed alongside: `docs/specs/objective-gt-stacks.md` now records the full observable-behavior specification (domain concepts, command surface, projection semantics including the stack-only `in-flight` status, output formats with schemas, failure taxonomy, warnings, a worked end-to-end example in all three formats, non-goals, and an acceptance checklist), and `docs/objective-system.md` cross-references it from the `objective list` section. `docs/spec-distillation.md` adds a general prototype-to-spec methodology.

Evidence: landed commits `628f8dc6`, `17d18542`, `164fda53` on `master` at HEAD `164fda53`; working tree clean, no current-branch PR involved. Each commit shipped with its own expanded coverage per its diff (`test_objective_cli.py` scenarios, real git/gt gateway tests, and `gt` projection/scope/touches unit tests). PR evidence was not required; the landed committed history was sufficient.

## Objective Impact

- Phase 4 branch-annotation boundary is updated: v1 annotations now include a cheap, deterministic `needs_restack` restack-health flag alongside touch/connector/`also_touches`/`validation_result`. Richer restack health beyond `needs_restack` and lifecycle interpretation stay out of v1, consistent with the parked health-annotation boundary.
- Phase 3 touch extraction is now rename/copy-aware in addition to deletion-aware, hardening the active-root touch model.
- Phase 6 repo-docs row is complete: the Graphite stack projection has a dedicated spec (`docs/specs/objective-gt-stacks.md`) and an `objective gt stacks` cross-reference from `docs/objective-system.md`, and no stale branch-wide `in-flight` discovery language remains in repo docs.
- The `gt/` subpackage consolidation is internal cleanup that preserves the shipped CLI/JSON contract.

Remaining open Phase 6 work is unchanged in shape: the public `objective` skill still needs `objective gt stacks` / Graphite stack-projection language, and full cross-language repo validation for the docs/skills slice is still outstanding.

## Follow-Ups

- Phase 6: add `objective gt stacks` / Graphite stack-projection language to the public `objective` skill (`skills/objective/SKILL.md` currently describes only checkout-local `objective list`).
- Phase 6: run full cross-language repo validation for the consolidated docs/skills slice.
- Keep the interactive Objective stack TUI parked until the JSON graph contract has more real use.
