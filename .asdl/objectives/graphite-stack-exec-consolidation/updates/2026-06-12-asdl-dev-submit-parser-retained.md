# `asdl-dev submit` Parser Path Decided

## Summary

Audited the remaining TypeScript submit parser surfaces in `ts/packages/asdl-dev/src/submit-pr-metadata-prewrite.ts`, `ts/packages/asdl-dev/src/submit.ts`, and `ts/packages/asdl-dev/src/submit-format.ts`, plus the existing Graphite structured helpers in `asdl_core.gt` and `slot gt exec stack-branches`.

Decision: **retain the submit-specific Graphite output parsing for now; do not route `asdl-dev submit` through a new or existing `slot gt exec` helper in this Objective.**

### Rationale

- `asdl-dev submit` is itself an explicitly Graphite-named workflow whose durable contract is to run Graphite submit/readiness commands, prepare initial PR metadata, submit the stack, and verify the current branch PR. The parser is not agent guidance telling an LLM to interpret display text; it is isolated gateway code with command-construction and parser tests.
- The prewrite path needs submit-specific facts that `slot gt exec stack-branches` intentionally does not own: branch PR links from Graphite branch info, classification of existing-PR vs new branches before submit, parent ranges for local commit/diff context, and amendment limited to the current branch's parent chain.
- `slot gt exec stack-branches --format json` would replace only the branch-list/current/trunk slice. It would not provide existing PR links, and it would add a TypeScript `asdl-dev` runtime dependency on the Python `slot` CLI plus the Graphite metadata-store reader. That would be a larger cross-package coupling than this decision slice justifies.
- Existing Graphite plumbing (`gt parent --no-interactive`, `gt children --no-interactive`) is current-branch oriented and does not replace the per-branch parent/PR inspection that prewrite currently performs with `gt branch info --branch <branch>`.
- The post-submit current-PR verification surface belongs in the same retained rationale. `RealSubmitGateway.verifyCurrentPr` runs `gt branch info --no-interactive` only to verify Graphite reports a PR for the current branch and to extract PR URLs; `submit-format.ts` buffers that command output for diagnostics. It is not a stack-topology decision and should remain Graphite submit-specific.

### Retained risks

- `parseGtLogStack` still depends on Graphite's human-facing `gt log --stack --reverse --no-interactive` glyph/current-marker format.
- `parseParentBranch` still depends on the `Parent: <branch>` line in `gt branch info --branch <branch>` output.
- If Graphite changes these display formats, prewrite may fail or prepare inaccurate initial metadata. The blast radius is narrower than agent-wide display parsing because the logic is confined to the `RealSubmitMetadataGateway`, covered by real-gateway tests, runs after submit dry-run readiness, checks branch info before local diff reads, amends only one-commit new branches on the current branch's parent chain, and rechecks worktree cleanliness before `gt modify`.
- If this parser becomes flaky in practice, the future replacement path should first clarify an `asdl-dev` dependency boundary for invoking repo Python CLIs, then replace the topology slice with `slot gt exec stack-branches --format json` while continuing to use a submit-specific source for PR-link verification.

## Objective Impact

- The roadmap row “Decide the `asdl-dev submit` `gt log --stack` parser path” is complete with an explicit **retain** decision.
- No new `slot gt exec` command or implementation slice is spawned by the submit audit.
- The Objective completion criterion for the submit parser is satisfied: the parser is retained with documented submit-specific rationale and retained risk.
- The final documentation-loop row remains the only substantive open Objective work.

Evidence basis: close read of `ts/packages/asdl-dev/src/submit-pr-metadata-prewrite.ts`, `ts/packages/asdl-dev/src/submit.ts`, `ts/packages/asdl-dev/src/submit-format.ts`, `ts/packages/asdl-dev/test/gateways/submit-gateway.test.ts`, `packages/asdl-core/src/asdl_core/gt/real_gateway.py`, and `packages/asdl-slots/src/asdl_slots/cli/slot/gt/exec/stack_branches.py`.

## Follow-Ups

- In the documentation loop, distinguish deterministic, tested, submit-specific gateway parsing from agent guidance that asks LLMs to parse Graphite display output.
- Do not add a `slot gt exec` submit helper unless a future failure proves that the submit parser's retained risk is no longer acceptable.
