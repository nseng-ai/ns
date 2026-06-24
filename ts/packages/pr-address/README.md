# @sdl/pr-address

Transitional TypeScript package for the `pr-address` standalone CLI: LM-ready PR feedback download plus shared PR feedback primitives.

The old addressing workflow engine — payload sessions, classification, planning, resolver payloads, batch mutation orchestration, checkpoints, finalization, and detail lookup — is retired and deleted from the current CLI.

## Retained contract

The retained foundation is:

- `pr-address exec download-feedback [--pr-number <number>] --format json` for Markdown triage context.
- `pr-address exec map-branch-prs --format json` as minimal branch-to-PR lookup plumbing for `/pr:download-stack-feedback`.
- Read primitives: `pr-details`, `branch-pr`, `open-prs`, `pr-reviews`, `pr-review-threads`, `pr-discussion-comments`, and `pr-checks`.
- Mutation primitives: `reply-review-thread` and `resolve-review-thread`.

The `download-feedback` result includes Markdown intended for session/editor prefill. It is triage-only and must not mutate GitHub. After human direction, current-state inspection, implementation or verification, and appropriate validation, review-thread mutations should use the primitive commands instead of raw `gh api graphql`.

## Distribution

`pr-address` is distributed as a machine-level PATH shim that runs this package's sources directly; nothing is bundled or published:

- **Install**: `just install-pr-address` renders the shared TypeScript source CLI shim template to `~/.local/bin/pr-address`, baking in the installing checkout's path as the canonical fallback.
- **Dispatch**: inside an sdl checkout (any worktree), the shim runs that checkout's `ts/packages/pr-address/src/cli.ts`, so each worktree exercises its own code. Everywhere else it runs the baked canonical checkout's sources.
- **Requirements**: `node` (Node 24+, matching the workspace `engines` floor) and `pnpm install` having been run in the checkout's `ts/` directory (`just ts-install`).

## Local usage

```bash
node ts/packages/pr-address/src/cli.ts --help
pr-address exec download-feedback --pr-number <pr-number> --format json
pr-address exec pr-review-threads --pr-number <pr-number> --include-resolved --format json
pr-address exec pr-checks [--pr-number <pr-number>] --format json
pr-address exec reply-review-thread --thread-id <THREAD_ID> --body "Fixed in <commit/branch>." --format json
pr-address exec resolve-review-thread --thread-id <THREAD_ID> --format json
```

## Validation

```bash
pnpm --dir ts --filter @sdl/pr-address run check
pnpm --dir ts --filter @sdl/pr-address run test
```

Broader workspace validation:

```bash
pnpm --dir ts run check
pnpm --dir ts run test
```
