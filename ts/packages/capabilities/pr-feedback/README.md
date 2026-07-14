# @nseng-ai/pr-feedback

TypeScript package for the Address Capability API and `ns address exec ...` command face: PR feedback report download plus shared PR feedback primitives.

The old addressing workflow engine — payload sessions, classification, planning, resolver payloads, batch mutation orchestration, checkpoints, finalization, and detail lookup — is retired and deleted from the current CLI.

## Retained contract

The retained foundation is:

- `ns address exec download-feedback [--pr-number <number>] --format json` for a Markdown feedback report.
- `ns address exec map-branch-prs --format json` as minimal branch-to-PR lookup plumbing for `/pr:download-stack-feedback`.
- `ns address exec branch-pr-checks --branches-json '{"branches":[...]}' --format json` as batched branch-to-PR-checks plumbing: one GitHub GraphQL request resolves every branch's open PR and its normalized checks.
- Read primitives: `pr-details`, `branch-pr`, `open-prs`, `pr-reviews`, `pr-review-threads`, `pr-discussion-comments`, and `pr-checks`.
- Mutation primitives: `reply-review-thread`, `resolve-review-thread`, and `close-review-threads`.

The `download-feedback` result includes Markdown intended for session/editor viewing. Downloading feedback must not mutate GitHub. After human direction, current-state inspection, implementation or verification, and appropriate validation, review-thread mutations should use the primitive commands instead of raw `gh api graphql`.

## Capability API

`@nseng-ai/pr-feedback/api` is the curated in-process Capability API for PR-feedback consumers. Consumers that handle PR lookup, review, discussion-comment, review-thread, review-thread mutation, or Address check payloads should import the gateway and DTO vocabulary from this subpath instead of the kit `@nseng-ai/capability-kit/github/pr-feedback` contract, Pi modules, command operation schemas, or private source paths.

Current export classification:

- **Stable Address Capability API:** `PrAddressGithubGateway`; PR lookup/review/discussion/review-thread DTOs; review-thread reply/resolve DTOs; feedback failure/options/operation types. These are owned by Address as the projected PR-feedback seam over the kit's canonical `GithubPrFeedbackGateway`.
- **Stable through the Address seam:** `GithubStatusChecks`, `GithubStatusCheckEntry`, `GithubCheckTally`, `GithubCheckBucket`, `GithubStatusCheckKind`. Import these from `@nseng-ai/pr-feedback/api` when consuming `getPrChecks`/`pr-checks` payloads. The generic status normalization mechanics remain neutral infra in `@nseng-ai/capability-kit/github/pr-status`.
- **Not Capability API:** `GithubPrFeedbackGateway`, `RealGithubPrFeedbackGateway`, GraphQL args/queries/schemas/normalizers, command schemas, Clinkr/exec wrappers, Pi presentation/session helpers. These remain kit contract, real-adapter, command-face, or Presentation Host implementation details.

ADR 0016 keeps PR Address as the capability-facing seam: reusable GitHub backend mechanics may live in `@nseng-ai/capability-kit/github`, while seam consumers import only the Address Capability API.

## Distribution

Address operations are mounted into the repo-local ns extension command face as `ns address exec ...`; nothing is bundled or published:

- **Install**: `just install-tools` installs the `ns` shim.
- **Dispatch**: inside an ns checkout (any worktree), `ns address exec ...` loads `.ns/extensions/address` and invokes this package's operation handlers.
- **Requirements**: `node` (Node 24+, matching the workspace `engines` floor) and `pnpm install` having been run in the checkout's `ts/` directory (`just ts-install`).

## Local usage

```bash
ns address exec download-feedback --pr-number <pr-number> --format json
ns address exec pr-review-threads --pr-number <pr-number> --include-resolved --format json
ns address exec pr-checks [--pr-number <pr-number>] --format json
ns address exec reply-review-thread --thread-id <THREAD_ID> --body "Fixed in <commit/branch>." --format json
ns address exec resolve-review-thread --thread-id <THREAD_ID> --format json
ns address exec close-review-threads --thread-ids-json '{"threadIds":["<THREAD_ID>","<THREAD_ID>"]}' --body "Fixed and validated." --format json
printf '%s' '{"threadIds":["<THREAD_ID>"]}' | ns address exec close-review-threads --format json
```

## Validation

```bash
pnpm --dir ts --filter @nseng-ai/pr-feedback run check
pnpm --dir ts --filter @nseng-ai/pr-feedback run test
```

Broader workspace validation:

```bash
pnpm --dir ts run check
pnpm --dir ts run test
```
