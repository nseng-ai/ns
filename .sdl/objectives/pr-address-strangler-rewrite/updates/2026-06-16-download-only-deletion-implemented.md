# Download-only deletion sequence implemented

Implemented the deletion sequence that retires the old `pr-address` addressing workflow in favor of read-only download surfaces.

Landed state:

- Active stack-address bootstrap guidance now marks stack-address as retired and points stack feedback users to `/pr:download-stack-feedback`.
- `/code:pr-feedback-watch` now calls `pr-address exec download-feedback` and injects downloaded Markdown for triage. It no longer calls `prepare-run`, depends on payload artifacts, uses JSON-pointer detail lookup, or instructs agents to resolve/reply through `pr-address` mutation helpers.
- `@asdl/pr-address` hidden exec surface exposes only `download-feedback` and `map-branch-prs`.
- Retired workflow modules, tests, golden fixtures, payload-store support, compact output support, and mutation-capable gateway methods were deleted.
- Retained downloader schema/help/tests pass for `download-feedback` and `map-branch-prs`.

Validation run:

- `pnpm --dir ts --filter @asdl/pr-address run check`
- `pnpm --dir ts --filter @asdl/pr-address run test`
- `pnpm --dir ts --filter @asdl/pi-extensions run check`
- `pnpm --dir ts exec vitest run --config vitest.config.ts packages/pi-extensions/test/pr-feedback-watch.test.ts packages/pi-extensions/test/pr-download-feedback.test.ts`

Remaining historical mentions of stack-address and retired commands are Objective/update provenance, tests asserting retired commands are unreachable, or historical retrospective content.
