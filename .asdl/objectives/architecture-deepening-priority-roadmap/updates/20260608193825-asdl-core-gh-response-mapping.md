# asdl-core GitHub Response Mapping Localized

## Summary

The GitHub response-mapping slice of the `asdl-core` output converters/readers roadmap row is now represented as landed Objective state. GitHub `gh` JSON, REST, and GraphQL payload-to-domain conversion helpers moved out of `asdl_core.gh.real_gateway_helpers` into the canonical GitHub-domain module `asdl_core.gh.response_mapping`.

`real_gateway_helpers` now keeps subprocess execution, `gh` command construction, repository resolution, lookup/failure mapping, and mutation request construction local to the real adapter helpers, while delegating response conversion for PR summaries, review threads, REST reviews/files/comments, discussion comments, mutation thread state, review creation, and reactions.

Pure converter coverage now lives in `packages/asdl-core/tests/unit/test_gh_response_mapping.py`, including paginated REST array decoding, optional PR summary fields, resolved-thread filtering, deleted/null author handling, REST review-state filtering, missing file patches, inline and discussion comment mapping, and mutation response mapping. Real PR gateway tests retain command construction, repo-targeting, lookup/failure, mutation request, close/merge, and adapter wiring coverage.

Verification: focused GitHub response-mapping unit tests passed; real PR gateway tests passed; full `asdl-core` tests passed; downstream `asdl-pr-address`, `asdl-slots`, and `roaster` tests passed; Python lint, format, and type checks passed; and a review-only dignified-Python subagent reported no actionable findings. Full `just` passed Python lint/format/type and then failed in unrelated TypeScript package `ts/packages/ccc/src/worktree-status.ts`.

## Objective Impact

The roadmap row **Add domain output converters/readers for `asdl-core` real adapters** remains `[~]`. The Git and GitHub portions now have domain-named conversion locality and converter-level tests, reducing raw subprocess/string/API-shape coupling in real adapter tests without introducing a generic parser dumping ground.

The row remains partial because the Graphite metadata reader remainder still needs current-code disposition: extract a focused reader if it reduces coupling, or park that remainder with reason if current code is already cohesive enough that extraction would be churn.

## Follow-Ups

- Re-read Graphite metadata parsing in `asdl_core.gt` and either extract a focused reader or park the Graphite portion with reason.
- Continue to avoid a generic parser helper module or package-level re-export cleanup under this row.
- After Graphite disposition, decide whether the `asdl-core` converter/readers row can move to `[x]` before starting the `asdl-pr-address` feedback snapshot / prepare-run policy row.
