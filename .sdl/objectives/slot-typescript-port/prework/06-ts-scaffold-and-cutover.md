# 06 — TS Scaffold & Cutover Spec

How to scaffold `ts/packages/slot`, wire it through `@asdl/clinkr` + `@asdl/core`, distribute it as a
run-from-source shim, and retire the Python package. Slices: roadmap rows 3 (scaffold), 9 (cutover),
10 (retire). Reference packages: `ts/packages/brmem`, `ts/packages/areg`.

## package.json (model on `ts/packages/brmem/package.json`)

```json
{
  "name": "@asdl/slot",
  "version": "0.1.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "files": ["src"],
  "bin": { "slot": "./src/cli.ts" },
  "scripts": {
    "check": "tsc --noEmit -p tsconfig.json",
    "test": "cd ../.. && vitest run --config vitest.config.ts packages/slot/test"
  },
  "dependencies": {
    "@asdl/clinkr": "workspace:*",
    "@asdl/core": "workspace:*",
    "zod": "^4.4.3"
  }
}
```

`tsconfig.json`: copy a sibling package's (brmem/areg) verbatim — strict, ESM, NodeNext.

## cli.ts (model on `ts/packages/brmem/src/cli.ts:1-40`)

- `#!/usr/bin/env node` shebang.
- Import `{ ClinkrGroup, resolveIo }` from `@asdl/clinkr`, `{ isDirectCliInvocation }` from
  `@asdl/core/cli-entry`.
- `buildCli(): ClinkrGroup<SlotCliContext>` builds the root group `{ name:"slot", description:"Manage
  the pool of Git-worktree-backed slots.", version:VERSION, runtimeInfo }`, registers the eight
  top-level commands plus the `gt`, `shell`, and `completion` subgroups (mirror
  `cli/slot/group.py:17-35` and `gt/group.py:10-25`); the `gt exec` subgroup is hidden.
- Each command: `root.command({ name, description, requestSchema, resultSchema, run, render, hidden? })`
  wired to the operation module's exported schemas + `run*`/`render*` (mirror brmem's per-op imports).
- Guard the entrypoint with `isDirectCliInvocation` so the file is import-safe for tests.

## Context wiring (`context.ts`)

`SlotCliContext { repo, git, gt?, storage, clipboard, pr, slotsRoot }` mirroring
`SlotsCliContext` (`context.py:20-27`). A `createRealSlotContext({ cwd, env })` resolves the repo via
`discoverRepoOrSentinel` and constructs real gateways; a test helper builds a context over fakes. The
**gt gateway is constructed only for the `slot gt` context path** (mirror `cli/slot/gt/context.py`),
preserving the Graphite boundary (`04`).

## CLI surface parity checks

- `slot --version` and `-h`/`--help` (clinkr surface), plus per-command `--json-schema` and
  `--format json|human`.
- Hidden `gt exec` commands invocable but absent from top-level help.
- Scenario tests use `buildCli()` (the AGENTS.md CLI-scenario convention), not internal helpers.

## Distribution cutover (row 9)

Add a `just install-slot` recipe mirroring the sibling shims (`justfile` lines ~70-90):

```just
install-slot: (_install-ts-shim "slot" "ts/packages/slot/src/cli.ts" "just install-slot or just install-tools")
    # if a stale uv-tool/script remains, remove it (mirror handoff/areg .venv cleanup)
```

Then change `install-tools` (justfile ~line 119-124): add `install-slot` to its prerequisite list and
**remove** the line `uv tool install --force --editable .../packages/asdl-slots`. This is the one
distribution difference from siblings — `slot` was an editable uv tool, not a shim, so the cutover
must uninstall it (`uv tool uninstall asdl-slots`) and confirm `which slot` resolves to
`~/.local/bin/slot`. The shim is rendered by `ts/scripts/render-cli-shim.py` from
`ts/scripts/source-cli-shim-template` (`_install-ts-shim`, justfile ~92-101).

Wrapper tests (mirror brmem's): enclosing-checkout resolution, canonical-checkout fallback,
missing-`ts/node_modules` error, no-checkout behavior. Update the package `README.md` (and any docs)
to name the TypeScript path. Note: no installed skill currently shells out to `slot` (inventory §7),
so there is no skill cutover — confirm before deletion.

## Python retirement (row 10)

Gate on: full 17-command parity, worktree-state parity, shell-integration parity incl. the real-shell
check (`05`), distribution evidence, and docs naming the TS CLI as the sole surface. Then:

- Delete `packages/asdl-slots` from active paths (the package dir, its `pyproject.toml` console
  script, and the `asdl.plugins` `slots` entry point at `pyproject.toml:11-15`).
- Scrub workspace/config/test references (root `pyproject`/workspace members, any CI that installs the
  Python tool, `install-tools`).
- Record a rollback reference: the last pre-deletion commit hash containing `packages/asdl-slots`
  (mirror brmem `44c3e999...` / handoff `c7953b64...`).
- Validate with **full `just`**, not just the TS package (deletion touches the Python workspace and a
  shared test surface).

## Playbook feedback (row 11)

`slot` is the first OS-coupled / shell-integration / host-filesystem-state port. Feed these reusable
lessons into `.asdl/objectives/port-asdl-toolkit-to-typescript/porting-playbook.md`:

- A cross-process wire contract (the cd-directive env var + file) is a durable contract on par with a
  git-ref layout and must be kept verbatim while an installed wrapper consumes it.
- rc-file mutation needs redirected-HOME test policy and a deliberate real-shell parity check; marker
  strings are the idempotency contract.
- Distinguish framework-coupled bytes (the `_SLOT_COMPLETE` completion line) — which may legitimately
  diverge — from consumer-coupled bytes (the wrapper / cd-directive) — which may not.
- A capability installed as an editable uv tool (not yet a shim) needs an explicit uv-tool
  uninstall in the distribution cutover.

Update the umbrella migration ledger row for `slot` to TS-default and reconcile any stale sibling
rows.

## TS test checklist

- cli: `--version`, `-h`, per-command `--json-schema`/`--format`; hidden `gt exec` invocable but not
  in help; `buildCli()` scenario fixture.
- distribution: shim resolution variants; `install-tools` routes through `install-slot`; stale uv
  tool removed; `which slot` → shim.
- retirement (row 10, validated at deletion): no references to `asdl_slots` remain; full `just` green;
  rollback commit recorded.
