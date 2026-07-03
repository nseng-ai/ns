# @ji/address

TypeScript package for the Address Capability API and `ji address exec ...` command face: LM-ready PR feedback download plus shared PR feedback primitives.

The old addressing workflow engine — payload sessions, classification, planning, resolver payloads, batch mutation orchestration, checkpoints, finalization, and detail lookup — is retired and deleted from the current CLI.

## Retained contract

The retained foundation is:

- `ji address exec download-feedback [--pr-number <number>] --format json` for Markdown triage context.
- `ji address exec map-branch-prs --format json` as minimal branch-to-PR lookup plumbing for `/pr:download-stack-feedback`.
- Read primitives: `pr-details`, `branch-pr`, `open-prs`, `pr-reviews`, `pr-review-threads`, `pr-discussion-comments`, and `pr-checks`.
- Mutation primitives: `reply-review-thread`, `resolve-review-thread`, and `close-review-threads`.

The `download-feedback` result includes Markdown intended for session/editor prefill. It is triage-only and must not mutate GitHub. After human direction, current-state inspection, implementation or verification, and appropriate validation, review-thread mutations should use the primitive commands instead of raw `gh api graphql`.

## Capability API

`@ji/address/api` is the curated in-process Capability API for PR-feedback consumers. Consumers that handle PR lookup, review, discussion-comment, review-thread, review-thread mutation, or Address check payloads should import the gateway and DTO vocabulary from this subpath instead of `@ji/core/github-pr-feedback`, `@ji/core/github-pr-status`, Pi modules, command operation schemas, or private source paths.

Current export classification:

- **Stable Address Capability API:** `GithubPrFeedbackGateway`; PR lookup/review/discussion/review-thread DTOs; review-thread reply/resolve DTOs; feedback failure/options/operation types. These are owned by Address as PR-feedback seam vocabulary.
- **Stable through the Address seam:** `GithubStatusChecks`, `GithubStatusCheckEntry`, `GithubCheckTally`, `GithubCheckBucket`, `GithubStatusCheckKind`. Import these from `@ji/address/api` when consuming `getPrChecks`/`pr-checks` payloads. The generic status normalization mechanics remain neutral infra in `@ji/core/github-pr-status`.
- **Not Capability API:** `RealGithubPrFeedbackGateway`, GraphQL args/queries/schemas/normalizers, command schemas, Clinkr/exec wrappers, Pi presentation/session helpers. These remain real-adapter, command-face, or Presentation Host implementation details.

ADR 0016 keeps dependency direction as `@ji/address` → `@ji/core`: lower type declarations and real GitHub mechanics may live in core, while seam consumers import only the Address Capability API.

## Distribution

Address operations are mounted into the repo-local SDL extension command face as `ji address exec ...`; nothing is bundled or published:

- **Install**: `just install-tools` installs the `ji` shim.
- **Dispatch**: inside an sdl checkout (any worktree), `ji address exec ...` loads `.ji/extensions/address` and invokes this package's operation handlers.
- **Requirements**: `node` (Node 24+, matching the workspace `engines` floor) and `pnpm install` having been run in the checkout's `ts/` directory (`just ts-install`).

## Local usage

```bash
ji address exec download-feedback --pr-number <pr-number> --format json
ji address exec pr-review-threads --pr-number <pr-number> --include-resolved --format json
ji address exec pr-checks [--pr-number <pr-number>] --format json
ji address exec reply-review-thread --thread-id <THREAD_ID> --body "Fixed in <commit/branch>." --format json
ji address exec resolve-review-thread --thread-id <THREAD_ID> --format json
ji address exec close-review-threads --thread-ids-json '{"threadIds":["<THREAD_ID>","<THREAD_ID>"]}' --body "Fixed and validated." --format json
printf '%s' '{"threadIds":["<THREAD_ID>"]}' | ji address exec close-review-threads --format json
```

## Validation

```bash
pnpm --dir ts --filter @ji/address run check
pnpm --dir ts --filter @ji/address run test
```

Broader workspace validation:

```bash
pnpm --dir ts run check
pnpm --dir ts run test
```
