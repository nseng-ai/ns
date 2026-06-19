# Packagechk Cutover and Playbook Lessons

## Summary

`packagechk` was promoted from parked pending evidence to active in-scope work during final migration cleanup and completed its TypeScript cutover in this branch.

The new standalone TypeScript `@asdl/packagechk` package preserves the active CLI contract: bare-name default checks, repeated `--registry pypi|npm|brew`, schema-version-1 JSON with snake_case keys, human status lines, exit codes 0/1/2, PyPI/npm/Homebrew registry validation and metadata parsing, `claim-pypi` / `claim-npm` dry-run behavior, `--force`, `--skip-check`, confirmation prompts, temporary claim-project rendering, and real publish gateway boundaries for `uv build`, `uvx uv-publish`, and `npm publish --access=public`.

Tracked Python `packages/packagechk` files were deleted. Root Python workspace, dev dependency, Ruff source, ty source, and pytest path references were removed from `pyproject.toml`, and `uv.lock` was regenerated. A new opt-in `just install-packagechk` source shim installs the TypeScript CLI and removes stale project-venv `packagechk` scripts.

Validation evidence: focused `pnpm --dir ts --filter @asdl/packagechk run check`, focused `pnpm --dir ts --filter @asdl/packagechk run test`, full `pnpm --dir ts run deps:check`, `pnpm --dir ts run fmt:check`, `pnpm --dir ts run lint`, `pnpm --dir ts run check`, full `pnpm --dir ts run test`, targeted `just test`, and full `just check` all passed.

## Objective Impact

The migration ledger now marks `packagechk` as TS-default instead of parked pending evidence. The repeated capability-subobjective roadmap row records `packagechk` as a final-cleanup promoted capability rather than a persisted-sequence default capability. The final cleanup row remains open because root `asdl exec` / `asdl-core` disposition, stale docs/context cleanup, and migration-debt review still need explicit resolution before closure.

`porting-playbook.md` now includes packagechk lessons for small standalone utilities with real publish effects: preserve legacy dispatch and schema contracts, keep registry/publisher seams fake-driven, and treat dry-run/confirmation behavior as deletion-gate safety evidence.

## Follow-Ups

- Resolve root `asdl exec` and `asdl-core` disposition before closing the umbrella Objective.
- Rebaseline stale `CONTEXT-MAP.md` and instruction examples that still mention deleted Python package paths in a focused docs/domain-language cleanup.
- Decide whether packagechk's schema-version-1 snake_case JSON is a permanent public contract or part of a broader machine-output debt sweep; do not silently change it in cleanup-only work.
