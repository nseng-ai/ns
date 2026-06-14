# Handoff TypeScript Implementation Reference

This reference preserves concrete implementation context gathered before Objective creation. Treat it as guidance, not a substitute for re-reading current files before editing.

## Proposed Graphite Stack

Use Graphite for branch/PR workflow. Suggested stack:

```text
handoff-ts/objective-and-inventory
handoff-ts/clinkr-markdown-renderer
handoff-ts/scaffold-and-list
handoff-ts/delete-operation
handoff-ts/gc-operation
handoff-ts/public-shim-cutover
handoff-ts/delete-python-package
handoff-ts/objective-closeout
```

Use `gt create <branch> -m "<message>"` to create each branch, `gt modify -m "<message>"` to amend, and `gt submit --no-interactive` only after explicit user approval.

## Proposed TypeScript Package Shape

```text
ts/packages/handoff/
  package.json
  tsconfig.json
  README.md
  CONTEXT.md
  scripts/handoff-shim
  src/
    cli.ts
    context.ts
    contracts.ts
    identity.ts
    inventory.ts
    brmem-gateway.ts
    real-brmem-cli-gateway.ts
    fake-brmem-gateway.ts
    operations/
      list.ts
      delete.ts
      gc.ts
      shared.ts
    index.ts
  test/
    scenario/
      cli-shape.test.ts
      list-operation.test.ts
      delete-operation.test.ts
      gc-operation.test.ts
    gateways/
      fake-brmem-gateway.test.ts
      real-brmem-cli-gateway.test.ts
    wrapper/
      handoff-shim.test.ts
    support/
      run-scenario.ts
      temp-git-repo.ts
```

Package metadata should mirror the brmem package:

```json
{
  "name": "@asdl/handoff",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "files": ["src"],
  "bin": {
    "handoff": "./src/cli.ts"
  },
  "scripts": {
    "check": "tsc --noEmit -p tsconfig.json",
    "test": "cd ../.. && vitest run --config vitest.config.ts packages/handoff/test"
  },
  "dependencies": {
    "@asdl/brmem": "workspace:*",
    "@asdl/clinkr": "workspace:*",
    "@asdl/core": "workspace:*",
    "zod": "^4.4.3"
  }
}
```

`tsconfig.json`:

```json
{
  "extends": "../../tsconfig.json",
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

## CLI Skeleton

`src/cli.ts` should follow `ts/packages/brmem/src/cli.ts`:

```ts
#!/usr/bin/env node

import process from "node:process";

import { ClinkrGroup, resolveIo } from "@asdl/clinkr";
import { isDirectCliInvocation } from "@asdl/core/cli-entry";

import { createRealHandoffContext, type HandoffCliContext } from "./context.ts";

export const VERSION = "0.1.0";

export interface CliDeps {
  context?: HandoffCliContext | undefined;
  cwd?: string | undefined;
  env?: NodeJS.ProcessEnv | undefined;
  stdout?: ((text: string) => void) | undefined;
  stderr?: ((text: string) => void) | undefined;
  stdin?: (() => Promise<string>) | undefined;
}

export function buildCli(): ClinkrGroup<HandoffCliContext> {
  const root = new ClinkrGroup<HandoffCliContext>({
    name: "handoff",
    description: "Work with directed handoff artifacts.",
    version: VERSION,
    runtimeInfo,
  });
  // Register list/delete/gc commands.
  return root;
}

export async function runCli(args: readonly string[], deps: CliDeps = {}): Promise<number> {
  const io = resolveIo({ stdout: deps.stdout, stderr: deps.stderr });
  const cwd = deps.cwd ?? process.cwd();
  const env = deps.env ?? process.env;
  const context = deps.context ?? createRealHandoffContext({ cwd, env });
  return await buildCli().run(args, { context, io });
}

function runtimeInfo(): string {
  return "runtime: typescript\nentry_point: @asdl/handoff bin handoff -> ts/packages/handoff/src/cli.ts\n";
}

if (import.meta.main || isDirectCliInvocation(import.meta.url, process.argv[1])) {
  process.exitCode = await runCli(process.argv.slice(2));
}
```

Adjust imports and dependencies to actual package conventions when implemented.

## Context and Gateways

Suggested context:

```ts
export interface HandoffCliContext {
  cwd: string;
  env: NodeJS.ProcessEnv;
  git: GitGateway;
  brmem: HandoffBrmemGateway;
  stdin: () => Promise<string>;
}
```

Use `RealGitGateway` from `@asdl/core/git` for ordinary branch facts:

- `currentBranch({ cwd })`
- `localBranchPresence({ cwd, branch })`
- `validateBranchRef({ cwd, branch })` if needed

Use package-local Handoff gateway:

```ts
export interface HandoffEntryRef {
  namespace: string;
  key: string;
  branch: string;
  entryLocator: string;
}

export interface HandoffEntryDiagnostic {
  headSha: string;
  headDate: string;
  blobSha: string;
  sizeBytes: number;
}

export interface HandoffErrorInfo {
  code: string;
  message: string;
  displayCommand?: string;
}

export type HandoffResult<T> = { type: "ok"; value: T } | { type: "error"; error: HandoffErrorInfo };
export type HandoffOptionalResult<T> =
  | { type: "found"; value: T }
  | { type: "missing" }
  | { type: "error"; error: HandoffErrorInfo };

export interface HandoffBrmemGateway {
  listEntries(options: { namespace: string; branch?: string | undefined }): Promise<HandoffResult<readonly HandoffEntryRef[]>>;
  check(options: { namespace: string; key: string; branch: string }): Promise<HandoffOptionalResult<HandoffEntryDiagnostic>>;
  delete(options: { namespace: string; key: string; branch: string }): Promise<HandoffResult<{ commit: string }>>;
  entryUpdatedAt(options: { namespace: string; key: string; branch: string }): Promise<HandoffOptionalResult<string>>;
}
```

Real adapter responsibilities:

- call `runAvailableBrmemCommand` for public `brmem list`, `brmem check`, and `brmem delete`;
- parse Python-parity machine envelopes safely;
- map `brmem check` exit `1` to missing;
- use public `@asdl/brmem` helpers for ref layout and validation where available;
- run narrow read-only git commands for per-entry updated timestamp if needed.

Fake adapter responsibilities:

- seed entries through constructor state;
- model active state with deterministic commit/timestamp sequence;
- implement same gateway interface;
- expose state inspection only where scenario tests need to verify deletion/no deletion.

## Identity Helpers

Create `src/identity.ts` with public constants and helpers:

```ts
export const HANDOFF_NAMESPACE = "handoff";
export const HANDOFF_KEY_SUFFIX = ".md";

export function isHandoffKey(key: string): boolean;
export function handoffSlugFromKey(key: string): string;
export function handoffKeyFromSlug(slug: string): HandoffResult<string>;
```

Rules:

- `isHandoffKey` requires suffix `.md`, no `/`, non-empty slug, and Branch Memory key validation success.
- `handoffKeyFromSlug` fails with `invalid_handoff_slug` if slug empty, ends `.md`, contains `/`, or generated key fails Branch Memory validation.

## Inventory Helpers

Create `src/inventory.ts` with:

```ts
export type BranchState = "active" | "deleted";

export interface HandoffSummary {
  branch: string;
  branch_state: BranchState;
  slug: string;
  key: string;
  entry_locator: string;
  updated_at: string;
}

export async function collectHandoffSummaries(...): Promise<ClinkrExit<never> | readonly HandoffSummary[]>;
```

Preserve filtering/sorting from Python:

- only namespace `handoff`;
- only valid flat `.md` keys;
- dedupe by `(branch, key)`;
- skip deleted branches before timestamp loading unless `include_deleted`;
- fail if required timestamp unavailable for included entry;
- sort branch ascending, updated descending, slug ascending tie-breaker.

## Operation Details

### `list`

Zod request schema should use snake_case output keys where they are public. The option property can be named `all` so the flag is `--all`.

Expected request fields:

```ts
branch?: string;
all: boolean;
include_deleted: boolean;
```

Clinkr option mapping:

```ts
options: {
  all: { flag: "--all", description: "List handoffs across every active branch." },
  include_deleted: { flag: "--include-deleted", description: "Include handoffs whose local branch no longer exists." }
}
```

Result:

```ts
scope: "branch" | "all-branches";
branch: string | null;
include_deleted: boolean;
handoffs: HandoffSummary[];
```

### `delete`

Request:

```ts
slug: string;
branch?: string;
force: boolean;
```

Need a way to read confirmation from stdin. `CliDeps.stdin` can default to `readStdin` or a line reader helper. For tests, inject deterministic stdin text.

Implementation phases:

1. Validate slug and branch.
2. Resolve branch.
3. Build entry locator with public brmem ref helper.
4. Check exists.
5. Confirm unless force.
6. Delete.
7. Return result.

### `gc`

Request:

```ts
dry_run: boolean;
force: boolean;
```

Implementation phases:

1. Reject `dry_run && force`.
2. Load all handoff summaries with `include_deleted: true`.
3. Build preview entries.
4. If dry-run or no candidates, return preview.
5. If force, delete candidates.
6. Else render preview to stderr, prompt, and delete or cancel.

## Clinkr Markdown Hook Details

If not already implemented, `@asdl/clinkr` should change as follows:

- `ClinkrCommandSpec` gets optional `renderMarkdown?: (data: T) => string`.
- registered rendered execution stores `renderMarkdown`.
- format parser maps `json` to JSON, `markdown`/`md` to markdown, everything else human.
- `emitExit` supports markdown or group dispatch handles markdown by selecting `renderMarkdown ?? renderHuman`.
- Failure behavior remains unchanged.

Keep this change minimal and tested. Do not redesign Clinkr envelopes or raw command behavior.

## Shim Template

Create `ts/packages/handoff/scripts/handoff-shim` modeled on brmem:

```bash
#!/usr/bin/env bash
# handoff — runs the asdl handoff TypeScript CLI from source.
set -euo pipefail

canonical_checkout="@@ASDL_CANONICAL_CHECKOUT@@"
cli_rel_path="ts/packages/handoff/src/cli.ts"

run_checkout() {
  local checkout="$1"
  shift
  if [[ ! -d "$checkout/ts/node_modules" ]]; then
    echo "handoff: $checkout has no ts/node_modules; run 'just ts-install' there first" >&2
    exit 2
  fi
  exec node "$checkout/$cli_rel_path" "$@"
}

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -n "$repo_root" && -f "$repo_root/$cli_rel_path" ]]; then
  run_checkout "$repo_root" "$@"
fi

if [[ -f "$canonical_checkout/$cli_rel_path" ]]; then
  run_checkout "$canonical_checkout" "$@"
fi

echo "handoff: no asdl checkout found (cwd is not inside an asdl checkout and the canonical checkout '$canonical_checkout' is missing $cli_rel_path); reinstall from an asdl checkout with: just install-handoff or just install-tools" >&2
exit 2
```

Add wrapper tests analogous to brmem's.

## Root Config Deletion Checklist

When deleting Python `packages/asdl-handoff`, update all of these:

- `pyproject.toml`
  - workspace members
  - uv sources
  - optional dependencies `plugins`
  - dev dependency group
  - Ruff src
  - Ruff known-first-party
  - pytest testpaths
- `uv.lock`
- `justfile`
  - `install-tools`
  - `publish`
- `tests/scenario/test_plugins.py`
  - remove handoff plugin smoke tests/imports, or replace context-on-root assertion with another active plugin if needed
- `CONTEXT-MAP.md`
- any docs/skills still pointing to Python handoff

Check with:

```bash
rg "asdl_handoff|asdl-handoff|packages/asdl-handoff"
```

Expected remaining hits after deletion should be only Objective history/rollback references, if any.

## Stop Conditions

Stop and ask the user before continuing if any of these occur:

1. Inventory finds active user-facing or agent-facing instructions that require `asdl handoff` instead of standalone `handoff`.
2. Implementing markdown parity would require broad Clinkr output redesign rather than a small renderer hook.
3. Real `brmem` CLI behavior no longer exposes enough data to implement Handoff Summary `updated_at` correctly, and package-local git plumbing cannot recover it safely.
4. TypeScript implementation would need to add `handoff create` or `handoff pickup` CLI commands to preserve current Pi/skill behavior.
5. Deleting Python handoff would break another Python package at runtime beyond root plugin smoke/tests/config, indicating hidden coupling not captured in this Objective.
