# slot TypeScript Port — Prework

This directory is downstream-execution prework for the **slot-typescript-port** objective
(`../objective.md`, `../roadmap.md`). It captures the verified, code-referenced contracts of the
Python `packages/asdl-slots` source and the TS target conventions (`ts/packages/brmem` and
`ts/packages/areg` as reference), so a downstream agent can implement each roadmap slice without
re-reverse-engineering.

Every claim cites `packages/asdl-slots/src/asdl_slots/...` with `file:line`. The two highest-risk
facts — the parent-shell cd-directive protocol and the rc-block install bytes/markers — were
re-verified against `shell_integration.py`, `cli/slot/shell.py`, and `cli/slot/completion.py`.

## Documents

| Doc                                      | Covers                                                                                                      | Roadmap slice(s) |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------- |
| `01-architecture-and-module-map.md`      | Python→TS module map, target file tree, slice ordering & dependencies, resolved decisions, conventions      | all              |
| `02-pure-core-and-naming-spec.md`        | naming, inventory derivation + selectors, allocation/redirect planning, repo-context path resolution        | 3, 5             |
| `03-worktree-lifecycle-spec.md`          | init/resize/checkout/claim/free/gc planning + outcomes, the git-worktree gateway methods, safety refusals   | 4, 5, 6          |
| `04-gt-and-gateways-spec.md`             | `slot gt up/down/free-stack` + `gt exec`, the Graphite plumbing boundary, the full gateway/fake split       | 7                |
| `05-shell-clipboard-integration-spec.md` | cd-directive protocol, zsh/bash rc-block install bytes/markers, clipboard tri-state — the novel-risk slice  | 8                |
| `06-ts-scaffold-and-cutover.md`          | package.json/tsconfig/cli.ts scaffold, clinkr+asdl-core wiring, `just install-slot` shim, Python retirement | 3, 9, 10         |

## How to use

1. Read `01-architecture-and-module-map.md` first — it is the map and the slice plan.
2. Before any TS implementation, load the `typescript-style` and `typescript-fake-driven-testing`
   skills (required by repo `AGENTS.md`).
3. For the slice you are executing, read its spec doc above. Each spec ends with a **TS test
   checklist** distilled from the existing Python tests — port those cases.
4. Treat the Python source as the parity oracle for **observable behavior** (CLI shape, JSON
   envelopes, exit codes, worktree/`~/.slots` state, the cd-directive and rc-block byte contracts),
   **not** as a structure to mimic. The specs flag exactly which bytes must match vs. which are free
   to be re-authored idiomatically.

## Resolved decisions (were objective "Open Questions")

Settled by codebase evidence; see `01-architecture-and-module-map.md §Decisions` for reasoning and
`file:line` evidence.

- **Standalone-only, no plugin.** Ship a standalone `slot` CLI only. There is **no TS analog** of
  Python's `asdl.plugins` entry point (the `areg` port resolved this for the whole workspace). The
  `asdl slot` plugin surface (`cli/plugin.py`, `pyproject.toml:14-15`) stays parked; confirm no live
  consumer before retiring it.
- **cd-directive protocol kept verbatim.** The env var name `SLOT_CD_DIRECTIVE_FILE`
  (`shell_integration.py:11`) and the single-line destination-file contract are kept byte-for-byte:
  the installed parent-shell wrapper depends on them, so they are a cross-process wire contract, not
  an internal detail.
- **rc-block markers kept verbatim; inner script re-authorable.** The begin/end marker strings
  (`# >>> slot shell integration >>>` / `# >>> slot completion >>>`, `shell.py:18-19`,
  `completion.py:17-18`) and the idempotency/`already_installed`/newline behavior are contract. The
  inner wrapper body and the completion activation line are reproduced faithfully (the wrapper is the
  thing that makes `cd` work) but may be re-authored if a scenario test proves equivalent behavior.
- **Clipboard reasons preserved.** The `backend_missing` / `subprocess_error` reason tags and the
  `copied`/`skipped`/`failure` tri-state (`gateway/clipboard.py:19`, `real_clipboard.py:33-43`) are
  preserved in the JSON envelope; implement over an injected process runner, not a hardcoded
  `pbcopy` call.
- **Graphite only behind `slot gt`.** `slot gt` / `slot gt exec` may use `GtGateway`
  (`parent_of`/`children_of`/`stack`/`trunk`); every plain `slot` command stays on plain git. Never
  parse human `gt` output for topology (repo `AGENTS.md`).
- **Distribution: run-from-source shim.** `just install-slot` via `_install-ts-shim "slot"
  "ts/packages/slot/src/cli.ts" ...`, replacing the current editable-uv-tool install in
  `install-tools` (justfile ~line 122) and removing the stale uv tool. No npm publish.
- **Zod `^4.4.3`, `@asdl/clinkr` + `@asdl/core` `workspace:*`** — uniform across all TS packages
  (`ts/packages/brmem/package.json:18-22`).
