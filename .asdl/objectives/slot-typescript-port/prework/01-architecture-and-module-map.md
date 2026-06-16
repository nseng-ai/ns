# 01 — Architecture & Module Map

The map and the slice plan. Read this first. Python source under
`packages/asdl-slots/src/asdl_slots/`; TS target under `ts/packages/slot/`.

## Design stance

The Python core is already gateway-pure: planners are pure functions over a `GitGateway` and a
`SlotInventory` (`checkout_planning.py`, `inventory.py`, `naming.py`), and all I/O is behind
gateways bundled in `SlotsCliContext` (`context.py:20-27`). Reproduce that shape in TS: pure modules
for naming/inventory/planning, a thin clinkr command layer, and a small set of gateways with
in-memory fakes (model on `ts/packages/areg`'s `gateways.ts` / `fake-gateways.ts` / `real-gateways.ts`
split). Concentrate risk at four seams: git-worktree, Graphite (`slot gt` only), clipboard, and
shell-integration (cd-directive + rc-block).

## Python → TS module map

| Python (`asdl_slots/...`)                                               | TS (`ts/packages/slot/src/...`)                    | Notes                                                           |
| ----------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------- |
| `naming.py`                                                             | `naming.ts`                                        | Pure. `slot-NN` generate/extract.                               |
| `inventory.py`                                                          | `inventory.ts`                                     | Pure. `SlotRecord`/`SlotInventory`, derivation, selectors.      |
| `checkout_planning.py`                                                  | `planning.ts`                                      | Pure. checkout + `--current` redirect planners (tagged unions). |
| `repo_context.py`                                                       | `repo-context.ts`                                  | `~/.slots` path resolution; `not_in_repo` sentinel.             |
| `context.py`                                                            | `context.ts`                                       | `SlotCliContext` bundle (repo + gateways).                      |
| `errors.py`, `lifecycle/operation_state.py`                             | `errors.ts`, `operation-state.ts`                  | Error types + operation-in-progress messaging.                  |
| `lifecycle/pool.py`                                                     | `lifecycle/pool.ts`                                | init/resize plans + execution.                                  |
| `lifecycle/checkout.py`, `current_worktree_redirect.py`                 | `lifecycle/checkout.ts`                            | checkout / checkout --current execution.                        |
| `lifecycle/claim.py`                                                    | `lifecycle/claim.ts`                               | claim source-detach + main-worktree behavior.                   |
| `lifecycle/free.py`, `release*.py`                                      | `lifecycle/free.ts`                                | free planning/execution + cleanup.                              |
| `lifecycle/gc.py`                                                       | `lifecycle/gc.ts`                                  | gc sweep classification + execution.                            |
| `lifecycle/outcomes.py`                                                 | `outcomes.ts` (+ per-op Zod schemas)               | Outcome field sets become the JSON `data` Zod schemas.          |
| `gateway/clipboard.py`, `real_clipboard.py`                             | `gateways/clipboard.ts`                            | Tri-state result; real impl over injected process runner.       |
| `gateway/storage.py`, `real_storage.py`                                 | `gateways/storage.ts`                              | `~/.slots` dir presence/creation.                               |
| (git gateway is `asdl_core`)                                            | `gateways/git.ts`                                  | Package-local git-worktree gateway (see `04`).                  |
| (gt gateway is `asdl_core`)                                             | `gateways/gt.ts`                                   | Package-local Graphite plumbing, `slot gt` only (see `04`).     |
| (PR gateway is `asdl_core`)                                             | `gateways/pr.ts`                                   | Used by `free --all` / `gc` only.                               |
| `shell_integration.py`                                                  | `shell/cd-directive.ts`                            | `SLOT_CD_DIRECTIVE_FILE` protocol (see `05`).                   |
| `cli/slot/shell.py`                                                     | `shell/install.ts` + `operations/shell.ts`         | rc-block install + render (see `05`).                           |
| `cli/slot/completion.py`                                                | `shell/completion.ts` + `operations/completion.ts` | activation line + install (see `05`).                           |
| `cli/slot/{checkout,claim,free,gc,goto,init,list,resize}.py`            | `operations/<name>.ts`                             | clinkr command + request/result schema + render.                |
| `cli/slot/gt/{up,down,free_stack}.py`, `navigation.py`, `stack_walk.py` | `operations/gt/*.ts`, `gt/navigation.ts`           | `slot gt` (see `04`).                                           |
| `cli/slot/gt/exec/{stack_branches,stack_map_branches}.py`               | `operations/gt/exec/*.ts`                          | hidden `gt exec` JSON surfaces (see `04`).                      |
| `cli/slot/group.py`, `gt/group.py`                                      | `cli.ts` (`buildCli`)                              | command tree assembly through `@asdl/clinkr`.                   |
| `cli/main.py`, `cli/plugin.py`                                          | `cli.ts` entrypoint                                | Standalone-only; no plugin analog.                              |

## Target file tree (initial)

```
ts/packages/slot/
  package.json            # @asdl/slot, bin slot, deps clinkr+core+zod
  tsconfig.json
  src/
    cli.ts                # #!/usr/bin/env node; buildCli(); isDirectCliInvocation guard
    context.ts
    naming.ts
    inventory.ts
    planning.ts
    repo-context.ts
    errors.ts
    operation-state.ts
    outcomes.ts
    gateways/{git,gt,clipboard,storage,pr}.ts
    gateways/fakes/{git,gt,clipboard,storage,pr}.ts
    shell/{cd-directive,install,completion}.ts
    lifecycle/{pool,checkout,claim,free,gc}.ts
    operations/{init,list,resize,checkout,claim,goto,free,gc,shell,completion}.ts
    operations/gt/{up,down,free-stack}.ts
    operations/gt/exec/{stack-branches,stack-map-branches}.ts
  test/
    unit/        # naming, inventory, planning, repo-context, cd-directive, install-block
    scenario/    # per-command CLI behavior over fakes
    gateways/    # real git-worktree adapter in throwaway repo
```

## Slice ordering & dependencies (maps to roadmap rows)

1. **Scaffold + pure core + `list`** (row 3): package, gateways/fakes, `naming`/`inventory`/
   `repo-context`, `list` end-to-end. Unblocks everything.
2. **Pool lifecycle** (row 4): `init`/`resize` — depends on inventory + git-worktree gateway.
3. **Allocation/movement** (row 5): `checkout`/`claim`/`goto` — depends on `planning.ts`.
4. **Release** (row 6): `free`/`gc` — depends on git + PR gateway.
5. **Graphite** (row 7): `slot gt *` — depends on gt gateway; independent of rows 4–6 except shared
   free execution (`free-stack` reuses `free`).
6. **Shell + clipboard** (row 8): the novel-risk slice; depends only on cd-directive + install
   modules and is otherwise independent, but is needed by `checkout`/`claim`/`goto`/`gt up`/`gt down`
   for the cd-directive write — so land `cd-directive.ts` early (with row 1 or 3) even though the
   `shell`/`completion` install commands land in row 8.
7. **Cutover** (row 9) → **retire Python** (row 10) → **playbook feedback** (row 11).

> Dependency note: `cd-directive.ts` is consumed by every navigation command (`navigation.py:86`
> calls `write_cd_directive_if_active` inside `build_navigation_result`). Implement the directive
> *writer* in row 3/5 so navigation commands are correct; the `slot shell install` *wrapper* that
> reads it is row 8. Don't defer the writer to row 8.

## Decisions (evidence)

- **Standalone-only.** `areg` port resolved no TS `asdl.plugins` analog; `cli/main.py:8-13`
  builds a standalone clinkr group via `build_standalone_cli`. Mirror `ts/packages/areg` / `brmem`
  cli.ts shape. Park `cli/plugin.py`.
- **Pure planners reproduced as pure functions.** `checkout_planning.py` and `inventory.py` take a
  `GitGateway` and return tagged unions / records with no hidden state — direct TS translation.
- **Gateways package-local.** No extraction into `@asdl/core` until a second consumer appears
  (objective Non-Goals). The git-worktree gateway in particular is heavier than `brmem`'s and stays
  in `ts/packages/slot/src/gateways/git.ts`.
- **`asdl_core.git`/`gt`/`gh` are Python.** The TS port does not import them; it defines its own
  package-local gateway interfaces whose method sets mirror the Python ones used by slot (see `04`).

## Conventions

- Strict TS, Node ESM, `.ts` extensions in imports, `#!/usr/bin/env node` + `isDirectCliInvocation`
  guard in `cli.ts` (`ts/packages/brmem/src/cli.ts:1-8`).
- Zod boundary schemas per operation (request + result), snake_case keys where preserving the Python
  JSON envelope (consistent with the migration-debt entry on snake_case Zod keys).
- Vitest, organized `test/{unit,scenario,gateways}` (mirror `ts/packages/brmem/test`).
- Follow `typescript-style` and `typescript-fake-driven-testing` skills.
