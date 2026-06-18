# @asdl/pr-address

Transitional TypeScript package for the `pr-address` standalone CLI.

`pr-address` is now a tiny read-only feedback downloader. The old addressing workflow engine — payload sessions, classification, planning, resolver payloads, GitHub mutation orchestration, checkpoints, finalization, and detail lookup — is retired and deleted from the current CLI.

## Retained contract

The retained foundation is:

- `pr-address exec download-feedback [--pr-number <number>] --format json`
- minimal branch-to-PR lookup plumbing for `/pr:download-stack-feedback` while that Pi command still shells out to this package

The `download-feedback` result includes Markdown intended for session/editor prefill. It is triage-only and must not mutate GitHub.

## Distribution

`pr-address` is distributed as a machine-level PATH shim that runs this package's sources directly; nothing is bundled or published:

- **Install**: `just install-pr-address` renders the shared TypeScript source CLI shim template to `~/.local/bin/pr-address`, baking in the installing checkout's path as the canonical fallback.
- **Dispatch**: inside an asdl checkout (any worktree), the shim runs that checkout's `ts/packages/pr-address/src/cli.ts`, so each worktree exercises its own code. Everywhere else it runs the baked canonical checkout's sources.
- **Requirements**: `node` (Node 24+, matching the workspace `engines` floor) and `pnpm install` having been run in the checkout's `ts/` directory (`just ts-install`).

## Local usage

```bash
node ts/packages/pr-address/src/cli.ts --help
pr-address exec download-feedback --pr-number <pr-number> --format json
```

## Validation

```bash
pnpm --dir ts --filter @asdl/pr-address run check
pnpm --dir ts --filter @asdl/pr-address run test
```

Broader workspace validation:

```bash
pnpm --dir ts run check
pnpm --dir ts run test
```
