# Full list rendering slice completed

## Summary

The TypeScript `objective` package now implements full/default `objective list` rendering with package-local branch attribution.

The slice extended the existing list operation so non-minimal, non-names output includes local branch attribution, full JSON `updated_branches_included` and `updated_branches_truncated` fields, per-record `updated_branches`, human/Markdown updated-branch rendering, branch ordering and truncation behavior, and structured git-failure surfaces for attribution failures. Minimal and names-only modes continue omitting branch attribution fields, and dirty markers remain render-only rather than JSON data.

Parent-side validation passed:

- `pnpm --dir ts --filter @asdl/objective run check`
- `pnpm --dir ts --filter @asdl/objective run test`
- `pnpm --dir ts run check`
- `git diff --check`

## Objective Impact

The roadmap row for full `objective list` branch attribution and human/Markdown rendering is now complete. The TypeScript implementation now covers both the selection-critical minimal list shape and the richer default user-facing list shape without extracting shared git helpers into `@asdl/core`.

The branch attribution seam remains package-local as planned. The implementation uses fake-backed semantic git facts for testing and conservative real git commands at the package edge.

## Follow-Ups

- Continue with the archive/unarchive state-movement slice.
- Keep unavailable repo/trunk and attribution behavior under review during caller/install cutover, because the current stack has not yet switched the standalone `objective` shim away from Python.
- Continue deferring shared git attribution extraction unless another port proves the same seam is needed.
