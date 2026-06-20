# Relocated Cursor Fix Complete

## Summary

The parked `gh api -F`/`@` cursor file-read finding was resolved in the shared
`@asdl/core/github-pr-feedback` primitive owner. The narrow fix changes dynamic
cursor GraphQL variables in `ts/packages/asdl-core/src/github-pr-feedback/args.ts`
from typed `-F` fields to raw `-f` fields:

- `threadCursor` in `reviewThreadPageArgs`
- `commentCursor` in `discussionCommentPageArgs`
- nested `commentCursor` in `reviewThreadCommentPageArgs`

The intentionally typed fields remain unchanged: `owner={owner}` and `repo={repo}`
still use `-F` for `gh` placeholder expansion, and numeric `number` still uses
`-F` for GraphQL integer conversion. The implementation preserves opaque cursor
strings literally rather than rejecting `@`-prefixed values.

Evidence considered: local branch diff against Graphite parent
`remove-pr-address-gateway-barrels-bin-only`; installed `gh help api` still
documents `-F` `@` file-read semantics and `-f` raw string fields; stale
cursor-flag search found no cursor expected arrays paired with `-F`; focused
`@asdl/core` check/test passed; broader TypeScript gates passed (`just
ts-format-check`, `just ts-lint`, `just ts-check`, `just ts-test`, `just
ts-guard`). PR evidence was unavailable and not required for the local branch
evidence.

## Objective Impact

The last parked ownership decision for this Objective is resolved by the narrow
shared-primitive fix. The Objective's original durable findings now all have a
final disposition: the in-package re-export cleanup is complete, the silent
comment-drop finding is already resolved in shared parser ground truth, and the
relocated cursor file-read primitive is fixed with focused regression coverage.

The Objective is closure-ready and has been closed as completed.

## Follow-Ups

- Do not broaden this Objective into a general `asdl-core/github-pr-feedback`
  audit. Any future shared GitHub primitive hardening should get its own focused
  Objective or be tracked under the relevant primitive owner.
