# Branch Memory Storage Inventory

This inventory supports the `branch-memory-storage-abstraction` Objective. It classifies current Branch Memory callers by reusable storage mechanics versus workflow-owned policy. The immediate scope is TypeScript-first; Python is inventoried only as existing evidence and should not receive a parallel abstraction in this Objective slice.

## Summary

The strongest TypeScript duplication is not Branch Memory domain modeling. It is a thin CLI-storage adapter shape repeated by higher-level workflows:

- run `brmem` with cwd, timeout, and unavailable-command handling;
- interpret `check` as present / absent / error;
- run `put --format json`, parse machine envelopes, and validate returned `namespace`, `key`, `branch`, and `source_file` against the request;
- parse `list --format json` entries and `get --format json` content where callers need typed storage data;
- attach consistent command-display evidence to failures.

Namespace ownership, collision policy, user-facing vocabulary, branch creation, prompt assembly, preview rendering, handoff selection, and worktree-status presentation remain workflow-specific and should not move into a neutral storage abstraction.

## Current callers and mechanics

| Area                                | Files                                                                                                                                                           | Branch Memory operations                                                                                       | Neutral mechanics observed                                                                                                                                                                              | Workflow policy that must stay local                                                                                                        | Migration candidacy                                                                                                                                     |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@asdl/brmem` Branch Memory System  | `ts/packages/brmem/src/gateway.ts`, `ts/packages/brmem/src/operations/*.ts`, `ts/packages/brmem/src/real-git-gateway.ts`, `ts/packages/brmem/src/ref-layout.ts` | Native `currentBranch`, `list`, `get`, `check`, `put`, `delete`, `copy`, `export`, prompt resolution           | Canonical gateway result types, ref layout, validation, CLI JSON schemas                                                                                                                                | Owns storage format, Git refs, CLI surface, content limits, namespace/key/branch validation                                                 | Source of truth; do not wrap internally for this Objective                                                                                              |
| Existing neutral TS command helper  | `ts/packages/asdl-core/src/brmem-cli.ts`                                                                                                                        | Candidate resolution, command execution, unavailable diagnostics, `put` envelope parsing                       | `runAvailableBrmemCommand`, `brmemCommandFailure`, `parseBrmemPutData`, command formatting                                                                                                              | Does not know namespaces, keys, collision policy, or list/get/check result shapes                                                           | Extend here, rather than adding a new package, if a storage adapter is introduced                                                                       |
| Branch-context attachment gateway   | `ts/packages/branch-context/src/brmem-gateway.ts`, `attach.ts`, `attached-plan.ts`, `branch-context-creation.ts`, `existing-branch-reuse.ts`                    | `check`, `put`, `list`, `get`, `delete` in namespace `branch-context`                                          | Present/absent/error mapping for `check`; `put` JSON parse and expected-field validation; `list`/`get` machine-envelope parsing; command failure normalization; in-memory fake mirrors storage behavior | Attached-plan key semantics, branch-context namespace, plan loading prompt, reuse rules, partial-failure wording, branch creation order     | Best first migration candidate. Keep `BranchContextBrmemGateway` as the domain seam, but implement its real adapter with shared neutral storage helpers |
| CCC dispatch prompt payload storage | `ts/packages/ccc/src/cmux/dispatch-prompt.ts`                                                                                                                   | `check` and `put` in namespace `ccc-dispatch`; raw `get` command embedded in cmux launch shell                 | Duplicates branch-context's `check` present/absent/error mapping, `put` parse/expected validation, `expectedMismatches`, and failure wrapping                                                           | Dispatch namespace/key, branch creation and Graphite tracking, temp payload content, no-overwrite collision policy, launch command shape    | Best second migration candidate. Shared helper should reduce duplicated storage mechanics without moving CCC orchestration downstack                    |
| CCC worktree-status observability   | `ts/packages/ccc/src/worktree-status.ts`; watcher in `ts/packages/pi-extensions/src/worktree-status.ts`                                                         | `brmem list --format json` for current branch, all namespaces                                                  | Candidate execution, machine-envelope parsing, list-entry shape extraction                                                                                                                              | Footer/status presentation, namespace exclusions, top-level-key summarization, Graphite/worktree composition                                | Partial candidate only: can consume a shared `listEntries`, but formatting and filtering stay CCC-owned                                                 |
| Handoff Pi extension surface        | `ts/packages/pi-extensions/src/handoff/shared.ts`, `handoff.ts`, `handoff/launch-flow.ts`, `handoff/tab.ts`, `claude/handoff-command.ts`                        | `check` for existence, direct `get` for pickup, prompt/instructions for `put`; list delegates to `handoff` CLI | Existing `checkHandoffExists` repeats `check` result interpretation; `readHandoff` direct exec repeats command failure wrapping                                                                         | Handoff artifact vocabulary, slug/key derivation, create/pick-up/list UX, launch tools, all-branches list behavior delegated to handoff CLI | Later TS cleanup candidate. Do not make handoff public semantics storage-first                                                                          |
| Python handoff CLI gateway          | `packages/asdl-handoff/src/asdl_handoff/cli/handoff/brmem_gateway.py`, `inventory.py`, `list.py`, `delete.py`, `gc.py`                                          | `list`, `check`, `delete`; Git metadata for updated timestamp; fake gateway in tests                           | Duplicates command discovery, JSON parsing, key/branch/namespace validation, ref layout, error typing                                                                                                   | Python handoff CLI owns Handoff Artifact inventory, deletion, garbage collection, branch-state grouping, updated-at metadata                | Inventory only for this slice. Do not build a parallel Python abstraction now                                                                           |

## Repeated neutral shapes worth abstracting in TypeScript

### `check` as presence

Repeated shape:

1. Run `brmem check <key> --namespace <namespace> --branch <branch> --format json`.
2. Treat `exit 0` as present.
3. Treat `exit 1` as absent/missing.
4. Treat killed, unavailable, malformed, or other nonzero results as errors with display-command evidence.

Current examples: branch-context `attachmentPresence`, CCC dispatch prompt `checkDispatchPromptPayload`, handoff `checkHandoffExists`.

### `put` with expected-field validation

Repeated shape:

1. Run `brmem put <key> --namespace <namespace> --branch <branch> --file <source> --format json`.
2. Parse the machine envelope.
3. Require `namespace`, `key`, `branch`, `ref_name`, `commit`, and `source_file`.
4. Verify returned `namespace`, `key`, `branch`, and `source_file` match the request.
5. Return storage evidence or a typed failure with display-command evidence.

Current examples: branch-context `attachPlan`, CCC dispatch prompt `putDispatchPromptPayload`.

### Typed `list` and `get`

Repeated or near-repeated shape:

- `list` callers need `namespace`, `key`, `branch`, and `ref_name` entries from `data.entries`.
- `get --format json` callers need `namespace`, `key`, `branch`, `content`, and `ref_name`.
- Some callers intentionally use raw `brmem get` without `--format json` when the content is destined for shell/Pi payload injection.

Current examples: branch-context `listAttachedPlans` and `getAttachedPlan`, CCC worktree-status list parsing, Pi handoff raw `readHandoff`.

## Non-neutral policy boundaries

Do not put these into a shared storage abstraction:

- namespace constants (`branch-context`, `handoff`, `ccc-dispatch`) or key-shape rules such as `plan.md`, `<handoff-slug>.md`, or `prompt.md`;
- whether a collision is fatal, retryable, selectable, or user-facing;
- branch creation or Graphite tracking order before storage;
- prompt body composition, attached-plan rendering, handoff artifact wording, or cmux launch command construction;
- worktree-status display rules such as hiding `objectives-archive`, grouping by top-level key, or composing with Graphite facts;
- Python handoff inventory behavior and garbage collection.

## Recommended next implementation shape

If the Objective proceeds beyond inventory, keep the abstraction deliberately small and TypeScript-only:

- Extend `ts/packages/asdl-core/src/brmem-cli.ts` with neutral CLI-storage helpers such as:
  - `checkBrmemEntry({ gateway, cwd, namespace, key, branch, ... }) -> present | absent | error`;
  - `putBrmemEntryFromFile({ gateway, cwd, namespace, key, branch, sourceFile, ... }) -> BrmemPutData | error`, including expected-field validation;
  - optionally `listBrmemEntries` and `getBrmemEntryContent` if needed by the first migrations.
- Keep higher-level gateway interfaces in their owner packages. For example, `BranchContextBrmemGateway` should remain branch-context-shaped even if `RealBranchContextBrmemGateway` delegates to neutral helpers.
- First migrate branch-context and CCC dispatch prompt because they share the clearest duplicated `check`/`put` mechanics.
- Consider worktree-status and handoff Pi helpers only after the first migration proves the shared shape is smaller than the current local code.

## Preliminary decision

A small TypeScript storage-helper extension appears justified, but only for CLI mechanics. A namespace-neutral product abstraction over Branch Memory artifacts is not justified by this inventory. The abstraction should make duplicated command mechanics boring while leaving branch-context, handoff, CCC dispatch, and worktree-status semantics in their current owner packages.
