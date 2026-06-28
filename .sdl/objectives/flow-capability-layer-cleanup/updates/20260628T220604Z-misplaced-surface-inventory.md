# Misplaced Surface Inventory

## Summary

The first roadmap slice inventoried current imports, exports, manifests, and guard/module-loader edges for the Flow submit/autobranch cleanup target. The current misplaced surfaces are:

- `@sdl/core/submit` is a neutral-infra export for Flow-owned PR-description and submit-facing seams. It exports PR-description policy (`DEFAULT_PR_DESCRIPTION_SYSTEM_PROMPT`, generated-region markers, prompt/model envs, diff truncation, lockfile filtering, prompt hashing, output validation, `preparePrDescription`, `resolvePrDescriptionGeneration`, and orchestration), Flow-facing `GithubPrGateway` / `RealGithubPrGateway`, submit metadata types (`PrewrittenPrMetadata`, `PrCommitMessage`), and submit-specific result aliases (`ErrorInfo`, `GatewayResult`, `err`, `ok`, `commandFailure`).
- `@sdl/graphite/submit` is a neutral-infra export for Flow submit orchestration. It exports submit/restack/current-PR preflight behavior, PR metadata prewrite, submit failure transcript/presentation shaping, PR-description generation over submitted links, and `gt submit` formatting. Its low-level pieces that may remain Graphite-neutral are parser/protocol helpers such as PR URL extraction, `gt log --stack` / parent parsing, branch-info inspection mechanics, and `gt modify` command execution primitives after Flow policy is separated.
- `@sdl/autobranch` is still declared as `neutral-infra` even though its exported surfaces are Flow/CCC workflow policy: dirty-worktree autobranch preparation/transaction/flow, latest-commit autobranch preparation/transaction/flow, branch slug prompting, Graphite branch-name selection, upstream eligibility checks, recovery/cleanup formatting, and command-output failure shaping.
- CCC still imports `@sdl/autobranch/*` directly from `ts/packages/ccc/src/autoslot.ts`, `ts/packages/ccc/src/autobranch/flow.ts`, and `ts/packages/ccc/src/cli.ts`; Flow command code imports `@sdl/autobranch/*` from `ts/packages/capabilities/flow/src/commands/autobranch.ts`, `branch-latest-commit.ts`, and result-block types. This confirms the next seam should let CCC consume Flow-owned in-process behavior without direct autobranch package imports.
- The jiti module loader preserves stale source-checkout aliases for `@sdl/core/submit`, `@sdl/graphite/submit`, `@sdl/autobranch/dirty-worktree`, and `@sdl/autobranch/latest-commit` in `ts/packages/kernel/src/sdk/module-loader.ts`.
- Package manifests preserve stale ownership: `@sdl/core`, `@sdl/graphite`, and `@sdl/autobranch` are `neutral-infra`; `sdl-flow`, `@sdl/ccc`, and `@sdl/kernel` depend on `@sdl/autobranch`; `sdl-flow` depends on `@sdl/core`, `@sdl/graphite`, and `@sdl/capability-kit`.
- Style-guard evidence shows `@sdl/autobranch` remains a named extension-graph package in `ts/packages/infra/core/test/support/typescript-style-guard/config.ts`. The former autobranch/pi/kernel cycle is now rejected by adversarial tests rather than deferred, so later changes should remove/reclassify autobranch's graph/tier treatment instead of preserving an obsolete cycle allowlist.

Classification:

- **Flow policy / move up to Flow ownership:** PR-description generation policy and generated-region semantics; prompt/model env handling; submit/regenerate orchestration; submit/restack/preflight/failure transcript behavior; PR metadata prewrite policy; autobranch dirty-worktree and latest-commit flows; branch slug derivation; checkpoint-message preparation and commit flow integration; user-facing refusal/failure shaping.
- **Capability Kit substrate / move to `@sdl/capability-kit`:** capability-oriented `ErrorInfo` / `GatewayResult` aliases and `commandFailure`-style command-to-gateway-error helpers when used by capability gateways. `@sdl/core/result` can remain generic for standalone tools.
- **Neutral protocol/mechanics candidates / split carefully:** low-level GitHub CLI PR view/diff/edit mechanics, Graphite command execution, Graphite stack/branch/status/metadata parsers, PR URL extraction, and Git command primitives. These should stay in neutral infra only where they are policy-free protocol mechanics, not Flow submit/autobranch decisions.
- **Compatibility/stale-edge cleanup targets:** `@sdl/core/submit` export map, `@sdl/graphite/submit` export map, `@sdl/autobranch` package/tier, `sdl-flow`/CCC/kernel manifest edges, kernel jiti aliases, and tests importing stale subpaths.

## Objective Impact

This completes the inventory/classification roadmap row and de-risks the next design row. The inventory supports designing a curated Flow Capability API that covers CCC-needed autobranch behavior first while keeping command entrypoints separate from in-process Flow consumption. It also confirms the submit/PR-description and autobranch moves should be split from reusable substrate work: move shared result/error helpers to Capability Kit, but do not blindly move all gateways below the SDK.

## Follow-Ups

- Design the Flow Capability API seam for CCC, likely starting with autobranch/autoslot consumption because CCC has direct `@sdl/autobranch/*` imports today.
- During submit moves, decide which low-level GitHub PR mechanics remain neutral versus which seam/policy types move into Flow.
- During Graphite submit moves, separate policyful submit/restack/prewrite orchestration from policy-free Graphite parsers and command helpers.
- Remove or reclassify package manifests, export maps, jiti aliases, and style-guard/package-tier expectations as each stale edge disappears.
