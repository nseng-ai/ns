# asdl-core Git Output Conversion Localized

## Summary

The Git slice of the `asdl-core` output converters/readers roadmap row is now represented as landed Objective state. Git subprocess stdout-to-domain conversion helpers moved out of `asdl_core.git.real_git_gateway` into the canonical Git-domain module `asdl_core.git.output_conversion`.

Moved symbols include porcelain status, local branch tips, commit graph, tree oid batch-check, worktree list, path touch, path change touch, log range, patch-id, and name-status conversion helpers. `RealGitGateway` now imports those helpers while keeping subprocess execution, command failure mapping, `_patch_id_pairs` pipeline execution, worktree admin-dir reading, and gateway behavior in the real adapter.

Pure converter coverage now lives in `packages/asdl-core/tests/unit/test_git_output_conversion.py`, including the parser-only cases formerly mixed into real gateway/log-range tests and the porcelain/worktree parser cases mirrored from downstream slots coverage. Real gateway tests retain command construction, cwd, git failure, and adapter behavior coverage. Downstream `asdl-slots` parser imports now target `asdl_core.git.output_conversion` rather than `asdl_core.git.real_git_gateway`.

Verification: focused Git converter tests passed; affected real Git gateway/log-range tests passed; affected `asdl-slots` gateway tests passed; full `asdl-core` and `asdl-slots` tests passed; a review-only dignified-Python subagent reported no findings; and the full `just` gate passed.

## Objective Impact

The roadmap row **Add domain output converters/readers for `asdl-core` real adapters** moves from `[ ]` to `[~]`. The Git portion now has domain-named conversion locality and converter-level tests, which reduces raw subprocess/string-shape coupling in real adapter tests without introducing a generic parser dumping ground.

The row remains partial because this branch deliberately did not change GitHub response mapping or Graphite metadata reading. Those adapters still need either a focused converter/reader slice or a parked-with-reason disposition based on current implementation evidence.

## Follow-Ups

- Inspect GitHub response mapping in `asdl_core.gh` for a second output-conversion slice where it reduces test coupling without changing GitHub command/API behavior.
- Re-read Graphite metadata parsing in `asdl_core.gt` before extracting anything; park the Graphite portion with reason if current code is already cohesive enough that extraction would be churn.
- Do not broaden future slices into a generic parser helper module or root package re-export cleanup.
