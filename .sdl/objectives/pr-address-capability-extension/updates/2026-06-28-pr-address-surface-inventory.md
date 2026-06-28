# PR Address Surface Inventory

## Summary

The initial PR Address inventory is complete. Current PR Address is a standalone TypeScript package and PATH shim, not an SDL grouped command face: `ts/packages/pr-address/package.json` exports only `./api` and installs the `pr-address` binary at `./src/cli.ts`; `just install-pr-address` renders the machine-level shim. No `sdl pr-address` extension manifest exists under `.sdl/extensions` or package metadata today.

Current standalone `pr-address exec` operations are:

- Download / stack plumbing: `download-feedback`, `map-branch-prs`.
- Read primitives: `pr-details`, `branch-pr`, `open-prs`, `pr-reviews`, `pr-review-threads`, `pr-discussion-comments`, `pr-checks`.
- GitHub mutation primitives: `reply-review-thread`, `resolve-review-thread`.

The command surface is a hidden Clinkr `exec` subgroup built from `EXEC_OPERATIONS` in `src/exec-commands.ts`. Every operation uses the machine envelope documented by the skill (`exit_code: 0` success with `data`, `exit_code: 1` negative/validation with optional data, `exit_code: 2` invalid/failure), with per-operation result schemas in `src/operation-schemas/collection.ts`. The important output shapes are:

- `download-feedback`: `{ found, target, counts, markdown }`, where `markdown` is LM/editor triage context and `counts` covers included/excluded review threads, reviews, and discussion comments.
- `map-branch-prs`: `{ branch_prs, missing_branches, ambiguous_branches, summary }` over a JSON branch list input.
- PR lookup/read primitives: `pr-details` and `branch-pr` return `{ found, pr, miss }`; `open-prs` returns `{ prs }`; reviews/threads/comments return arrays under `reviews`, `review_threads`, and `discussion_comments`.
- `pr-checks`: `{ found, target, counts, checks }`, including check buckets and optional `counts.has_more`.
- Mutation primitives: `reply-review-thread` returns `{ thread_id, comment }`; `resolve-review-thread` returns `{ thread_id, is_resolved }`.

The `@sdl/pr-address/api` Capability API currently re-exports PR-feedback DTOs and check/status DTOs from `@sdl/core/github-pr-feedback` and `@sdl/core/github-pr-status`, and owns the `GithubPrFeedbackGateway` interface. The real adapter remains `RealGithubPrFeedbackGateway` in `@sdl/core/github-pr-feedback`, wired through `src/context.ts`; PR Address tests consume `@sdl/pr-address/api` through the in-memory fake gateway. Direct lower-core imports found outside PR Address are neutral status consumers in `@sdl/worktree-status` and core tests, not PR-feedback consumers.

Existing PR Address domain-core seams are already present but narrow:

- `src/core/feedback-snapshot.ts` gateway-injects parallel reads of reviews, review threads, and discussion comments, and filters empty silenceable reviews.
- `src/core/feedback-summary.ts` identifies automation-like discussion comments from bot authors and known markers.
- `src/map-branch-prs.ts` has reusable branch-to-open-PR mapping logic (`mapBranchesToOpenPrs`) but still depends on the exec context shape.
- `src/primitive-results.ts` normalizes gateway DTOs to command JSON shapes, including PR checks.

Pi consumers remain shell-out based:

- `.pi/extensions/pr.ts` registers both the host PR extension and the extracted preview tool.
- `ts/packages/hosts/pi/src/pr/extension.ts` owns `/pr:download-feedback` and `/pr:download-stack-feedback`. The single-PR command shells out through `downloadPrFeedback`; the stack command calls `sdl slot gt exec stack-branches --downstack`, then `pr-address exec map-branch-prs`, then `pr-address exec download-feedback` once per mapped PR. Pi owns status text, editor prefill, stack Markdown assembly, and notifications.
- `ts/packages/hosts/pi/src/pr/feedback-download.ts` is the shared Pi shell-out adapter for `pr-address exec download-feedback --format json`, with a local loose schema for the download result.
- `ts/packages/hosts/pi/src/pr/feedback-watch/**` owns `/pr:watch-feedback` session state, dirty-tree pausing, polling timers, prompt injection, event/session state, REST fingerprint fast-paths, and status rendering. It still uses `downloadPrFeedback` for heavy snapshots and direct `gh`/REST calls for current user login, head OID, check summary, and lightweight feedback fingerprints.
- `ts/packages/local-pi-tools/pr-previews/**` owns `/pr:preview-feedback` and `/pr:preview-checks` read-only modal UI. It shells out to `pr-address exec download-feedback`, `pr-address exec pr-review-threads`, and `pr-address exec pr-checks`; check-log loading and summarization remain preview/UI behavior over `gh` and Pi model calls.

Skills and docs currently teach the standalone CLI contract. `skills/pr-address/SKILL.md`, `references/cli-reference.md`, and `references/cli-collection.md` list the retained operation families and explicitly state that initial triage downloads do not authorize edits or GitHub mutations. ADR 0015 allows the two hidden `exec` GitHub writes to rely on required operation arguments rather than an additional confirmation flag. ADR 0016 keeps PR-feedback seam ownership in `@sdl/pr-address/api`, lower real GitHub mechanics in `@sdl/core/github-pr-feedback`, neutral status rollup in `@sdl/core/github-pr-status`, and rejects a generic GitHub capability.

External GitHub boundaries are now clear:

- Read-only GitHub operations: PR lookup/list, reviews, review threads, discussion comments, checks, `download-feedback`, branch-to-PR mapping, Pi watch REST fingerprints, head OID/current login reads, and preview check-log reads.
- Write-capable GitHub operations: only `pr-address exec reply-review-thread` and `pr-address exec resolve-review-thread` in the current PR Address package. The skill and downloaded Markdown require human direction, current-state inspection, implementation/verification, and validation before using those mutations.

## Objective Impact

This completes the first roadmap slice. The next slices should use this inventory as the compatibility baseline before changing API exports, moving domain behavior, introducing an SDL command face, or cutting Pi shell-outs over to in-process seams.

Important constraints for later work:

- Preserve the standalone operation names, envelope semantics, and JSON shapes until a deliberate command-face/API cutover records parity and call-site updates.
- Treat `download-feedback`, `map-branch-prs`, `pr-review-threads`, and `pr-checks` as the highest-impact compatibility surfaces because Pi commands and local preview tools already parse their data schemas.
- Keep Pi presentation/session residue in Pi: editor prefill, stack-prompt assembly, modal UI, watch state, dirty-tree/idle gating, notifications, prompt injection, model-based log summaries, and local session event storage.
- Candidate PR Address-owned seams for the next implementation slices are: a consumer-driven `@sdl/pr-address/api` classification of current re-exports; a cleaner gateway-injected branch-to-PR mapping core that no longer depends on exec context; feedback snapshot/selection/Markdown summary construction; check/status result normalization; and possibly watch fingerprint primitives if they prove reusable outside Pi presentation.
- Do not add a generic GitHub capability. Keep ADR 0016's split: PR-feedback seam in PR Address, lower real GitHub mechanics and neutral status/identity in core.

## Follow-Ups

- Rebaseline `@sdl/pr-address/api` export by export: stable Capability API vs command-private vs lower-infra-only.
- Decide whether the next code slice should first extract branch-to-PR mapping away from `PrAddressExecContext` or classify API exports; both are now grounded by concrete Pi consumers.
- When command-face work starts, inventory-driven affected call sites are: `skills/pr-address/**`, `.pi/extensions/pr.ts`, `ts/packages/hosts/pi/src/pr/extension.ts`, `ts/packages/hosts/pi/src/pr/feedback-download.ts`, `ts/packages/hosts/pi/src/pr/feedback-watch/**`, `ts/packages/local-pi-tools/pr-previews/**`, `ts/packages/pr-address/README.md`, `justfile install-pr-address`, and docs/ADR references that name the standalone CLI.