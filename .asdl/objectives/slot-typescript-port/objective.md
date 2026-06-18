# Port slot to TypeScript

## Thesis

`slot` (the worktree-pool manager: `asdl-slots` standalone CLI plus the `asdl slot` plugin) should
become TypeScript-backed by default as the next production vertical slice of the asdl toolkit
migration, applying the reusable porting playbook refined from the `pr-address`, `brmem`, `handoff`,
and `areg` cutovers. The port should preserve the existing public CLI, `--format json` envelope,
exit-code, and worktree/filesystem-state contracts while replacing the Python implementation with
idiomatic, testable TypeScript.

`slot` differs from every prior port in one decisive way that shapes this slice: it is the first
capability whose durable contract includes **OS-level integration and host filesystem state**, not
just git refs and in-repo files. Its correctness surface spans `git worktree` lifecycle semantics, a
host `~/.slots/repos/<name>/worktrees/` metadata tree, a **parent-shell `cd` directive protocol** (an
installed zsh/bash wrapper that reads a file named by `$SLOT_CD_DIRECTIVE_FILE`), idempotent rc-file
mutation for `slot shell install` / `slot completion install`, and a clipboard side effect. Those
make **worktree-state fidelity and shell-integration parity**, not GitHub mutation safety or git-ref
storage, the central correctness concern.

`slot` also has the largest command surface ported so far — 17 user-facing commands across `slot`,
`slot gt`, the hidden `slot gt exec`, `slot shell`, and `slot completion` — and the deepest pure
core (inventory derivation, slot naming, allocation planning, redirect planning). The Python source
keeps that core almost entirely pure over a `GitGateway` (`packages/asdl-slots/src/asdl_slots/
checkout_planning.py`, `inventory.py`, `naming.py`), which is a strong asset: the TypeScript port can
reproduce the planners as pure functions and concentrate risk at the git, clipboard, storage, and
shell-integration seams.

`slot gt` is a legitimately Graphite-named contract. Per repo `AGENTS.md` ("`slot gt` is the
canonical opt-in Graphite command group … Its name is the contract"), `slot gt` and `slot gt exec`
may depend on Graphite; every plain `slot` command MUST stay on plain git only.

The new implementation lives in a standalone `ts/packages/slot` package exposing the CLI built
through `@asdl/clinkr`, mirroring the deliberate self-containment of the Python package and the
shape of `ts/packages/brmem` and `ts/packages/areg`. Compatibility is anchored on public CLI shape,
JSON envelopes, exit codes, worktree/`~/.slots` state semantics, and the shell-integration byte
contracts — not on every Python runtime/Click accident. When the inventory identifies behavior
caused by Python Clinkr internals rather than user-visible semantics, the TypeScript port may
intentionally diverge if the rationale is explicit, scenario-tested, and recorded in a Semantic
Update.

## Scope

- The standalone `slot` CLI in both local-checkout and installed contexts, and the standalone-only
  boundary decision (see Open Questions for the `asdl slot` plugin entry point at
  `packages/asdl-slots/src/asdl_slots/cli/plugin.py`).
- The full user-facing operation set across five groups:
  - Pool lifecycle: `init` (`--size`), `resize` (`--size`), `list`/`ls`.
  - Allocation/movement: `checkout`/`co` (`[BRANCH] | --current | -b NEW [BASE]`, `--no-clipboard`),
    `claim` (`BRANCH`, `--no-clipboard`), `goto` (`-n/--num | -w/--wt`, `--no-clipboard`).
  - Release: `free` (`-n`, `-w`, `-b`, `-c/--current`, `--all`, `--dry-run`, `-y/--yes`),
    `gc` (`--dry-run`, `-f/--force`, `--delete-branches`).
  - Graphite (`slot gt`): `up`, `down`, `free-stack` (`--downstack`); hidden `slot gt exec`:
    `stack-branches` (`--downstack`), `stack-map-branches` (`--recent-limit`).
  - Shell integration: `slot shell show|install` (`--shell`), `slot completion show|install`
    (`--shell`).
- The worktree-pool domain model: `git worktree list` as the **sole source of truth** (no parallel
  metadata store); `slot-NN` zero-padded naming (`naming.py`); 1..99 pool bounds (`pool.py`);
  lowest-numbered clean detached allocation (`inventory.lowest_available`, `checkout_planning.py`);
  derived `assigned`/`available` status and in-progress `operation` detection via branch occupancies.
- The host filesystem contract: `~/.slots/repos/<repo_name>/worktrees/<slot-NN>` path layout and
  stable-across-worktrees `repo_name` derivation (`repo_context.py`).
- The parent-shell `cd` directive protocol: `$SLOT_CD_DIRECTIVE_FILE` env var, written destination
  file, `inactive`/`written`/`failed` states (`shell_integration.py`), and the rule that
  `--format json` / `--json-schema` never trigger a parent-shell cd.
- Idempotent rc-file mutation for `slot shell install` and `slot completion install`: marker blocks
  (`# >>> slot shell integration >>>` / `# >>> slot completion >>>`), zsh/bash detection from
  `$SHELL`, `already_installed` detection, and the rendered wrapper/activation bytes
  (`cli/slot/shell.py`, `cli/slot/completion.py`).
- The clipboard side effect and its tri-state result (`copied`/`skipped`/`failure` with
  `backend_missing`/`subprocess_error` reasons) over a `ClipboardGateway` (`gateway/clipboard.py`).
- Gateway boundaries with in-memory fakes: git worktree operations (`GitGateway`), Graphite plumbing
  (`GtGateway`, for `slot gt` only), clipboard, `~/.slots` storage, and the PR gateway used by
  `free --all` / `gc` (`asdl_core.gh.pr_gateway.PRGateway`).
- Scenario, fake-driven, and parity evidence sufficient to preserve stable behavior, plus a manual
  real-shell parity check for the shell-integration slice.
- Run-from-source wrapper distribution for installed usage following the accepted shim model: a
  `just install-slot` shim that runs the checkout's TypeScript CLI, allowed to require an asdl
  checkout with `ts/node_modules`.
- Short, explicit Python fallback retirement after TypeScript default behavior is proven, ending in
  deletion of `packages/asdl-slots` from active paths.

## Non-Goals

- No user-facing `slot` workflow or command-surface redesign by default; breaking contract changes
  require explicit approval and compatibility rationale.
- No blind module-for-module port of the Python package; reproduce the pure planners and the durable
  contracts, not the Click/Clinkr internals.
- No change to the `~/.slots` path layout, `slot-NN` naming, pool bounds (1..99), allocation order,
  or the `$SLOT_CD_DIRECTIVE_FILE` protocol while a downstream consumer (the installed shell wrapper)
  depends on them; any change requires an explicit compatibility decision.
- No new persisted metadata store; `git worktree list` remains the single source of truth.
- No on-demand slot creation; capacity changes stay explicit (`init` / `resize`).
- No Windows / non-zsh-non-bash shell support, and no non-macOS clipboard backend, beyond what the
  Python CLI offers today (zsh/bash rc integration; `pbcopy` with graceful failure elsewhere).
- No extraction of a shared TypeScript git-worktree or shell-integration gateway into `@asdl/core`
  until a second consumer proves the seam; keep slot-specific plumbing package-local.
- No requirement to migrate the `asdl` Python plugin surface onto TS, and no requirement that a TS
  `asdl.plugins` analog exist (the `areg` port resolved that no TS plugin analog exists).
- No npm registry publish requirement for cutover.
- No long-term Python fallback after cutover criteria are met.

## Completion Criteria

- The current public `slot` CLI, `--format json` envelopes, exit codes, worktree/`~/.slots` state
  semantics, shell-integration byte contracts, and safety guarantees are inventoried and classified
  as durable contract versus incidental Python behavior before the implementation is designed
  (`slot-contract-inventory.md`, `prework/`).
- A TypeScript implementation in `ts/packages/slot` becomes the default for public `slot` invocation
  in local-checkout and installed contexts, exposing the CLI built through `@asdl/clinkr`.
- All 17 commands preserve their flags, human output, `--format json` envelopes, exit codes, and
  abort behaviors, or change them only with explicit compatibility rationale and tests.
- The worktree-pool semantics match the Python contract: `git worktree list` as sole source of truth,
  `slot-NN` naming, 1..99 bounds, lowest-available allocation, `assigned`/`available`/`operation`
  derivation, and `~/.slots/repos/<name>/worktrees/` paths.
- The parent-shell `cd` directive protocol and the `slot shell`/`slot completion` rc-block install
  behavior reach user-facing parity: an installed wrapper from either implementation drives the same
  `cd`, and `--format json` / `--json-schema` never trigger a parent-shell cd. Whether rendered bytes
  are byte-identical or idiomatically re-authored is resolved in `prework/05` and recorded.
- The clipboard tri-state (`copied`/`skipped`/`failure` with stable reasons) matches the Python
  contract, with graceful failure off macOS.
- Fake-driven unit and scenario tests cover the migration; the git, clipboard, storage, and PR
  gateways have fakes, and the git gateway has real-adapter coverage in a throwaway repo. The
  shell-integration slice additionally has a documented manual real-shell parity check.
- Public docs (the package `README.md`, any skill/wrapper docs) and distribution instructions point
  to the TypeScript path: local-checkout execution plus the accepted run-from-source `just
  install-slot` shim, with `install-tools` routing through it.
- Python fallback has a short explicit retirement phase ending in deletion of `packages/asdl-slots`
  from active paths once parity and distribution evidence exist; rollback after deletion is recorded
  explicitly (in-repo pre-deletion commit and/or a frozen external artifact).
- Lessons (especially the first OS-coupled/shell-integration port) and any reusable seam are fed back
  to the umbrella playbook and migration ledger; the umbrella `slot` row and any stale sibling rows
  are reconciled.

## Definition of Progress

Progress is keepable when it moves `slot` toward TypeScript-default behavior while preserving or
explicitly reclassifying public, worktree-state, and shell-integration contracts.

Keepable progress should do at least one of the following:

- Port a coherent operation slice to TypeScript with the smallest local git/clipboard/storage/shell
  seams that slice needs.
- Add or strengthen fake-driven unit, scenario, real-git-in-throwaway-repo, or real-shell parity
  evidence for preserved behavior.
- Reduce active Python fallback scope after TypeScript parity for the affected surface is proven.
- Clarify public-contract, worktree-state, shell-integration, distribution, or wrapper decisions in
  checked-in docs or Objective updates.
- Feed a proven, repeated worktree-pool or shell-integration seam into the umbrella playbook.

Do not keep changes that:

- Alter the `~/.slots` layout, `slot-NN` naming, pool bounds, allocation order, or the
  `$SLOT_CD_DIRECTIVE_FILE` protocol without an explicit compatibility decision and tests.
- Change public CLI, JSON-envelope, or exit-code behavior without explicit rationale and tests.
- Make a plain `slot` command depend on Graphite, or parse human-facing `gt` display output for
  topology (use `gt parent/children/stack` plumbing — repo `AGENTS.md`).
- Extract a shared git-worktree/shell gateway into `@asdl/core` before a second consumer proves it.
- Remove the Python fallback for a surface before equivalent TypeScript behavior, docs, and
  invocation paths are covered.

## Runner Policy

This Objective is execution-friendly for `objective-next` across every non-parked roadmap row under
the boundaries below. A runner may preview a single coherent slice, then execute it after user
confirmation without needing a new policy change.

- Direct execution is allowed when the slice is confined to repository files and local validation:
  TypeScript package code, tests, wrappers, checked-in docs, Objective files, and fixtures, including
  real-git probes that create/list/remove worktrees in a local throwaway test repository.
- Direct execution should prefer vertical operation slices over framework-first work, starting from
  the pure core (inventory/naming/planning) and the git-worktree gateway seam, then a first read-only
  operation (`list`), then mutations on proven seams.
- Steer or ask first when a slice would intentionally change public contracts, the `~/.slots` layout,
  `slot-NN` naming, pool bounds, allocation order, the cd-directive protocol, the rc-block install
  bytes/markers, clipboard semantics, JSON-envelope or exit-code semantics, wrapper/installed
  behavior, or fallback-retirement timing.
- The shell-integration slice has elevated blast radius because `slot shell install` / `slot
  completion install` mutate the developer's real `~/.zshrc` / `~/.bashrc`. Tests MUST drive a fake
  or redirected HOME/rc path; never append to the operator's real rc file during validation. A
  real-shell parity check is performed deliberately and described in its Semantic Update.
- Ask before deleting `packages/asdl-slots` or other broad Python areas, extracting a shared gateway
  into `@asdl/core`, or changing the `slot gt` Graphite boundary.
- No external write-capable actions are in scope except the GitHub PR reads/closes that `free --all`
  and `gc` already perform; those must run only against fakes during validation. No npm/PyPI
  publishing, no writes to refs/worktrees outside a local throwaway test repository.
- Validation before keeping work should be targeted to the slice first (`pnpm --dir ts run check` /
  `pnpm --dir ts/packages/slot run test`), then broaden to package/workspace checks when the slice
  touches shared wrappers, distribution, or workspace config; deletion rows broaden to full `just`.
- Work may be left as a normal repository diff containing code, tests, docs, and Objective updates.
  Do not leave stray worktrees, `~/.slots` entries outside throwaway repos, rc-file edits to the
  operator's shell, or unstated compatibility changes.
- Roadmap row-level `Policy:` notes refine these defaults for that row; they do not create hidden
  state or a task queue.

## Assumptions and Risks

Assumptions:

- Stable `slot` contracts can be preserved through `--format json` envelope checks, scenario tests,
  exit-code assertions, real-git worktree probes in throwaway repos, fake-backed shell/completion rc
  install tests, and a manual real-shell parity check for the cd-directive and rc-block behavior.
- The strongest current public-contract sources are the package `README.md`, source group
  registration (`packages/asdl-slots/src/asdl_slots/cli/slot/group.py`), the outcome dataclasses
  (`lifecycle/outcomes.py`), the pure core (`inventory.py`, `naming.py`, `checkout_planning.py`,
  `repo_context.py`), the shell-integration modules (`shell_integration.py`, `cli/slot/shell.py`,
  `cli/slot/completion.py`), and the package's scenario/unit/integration tests (~479 test functions).
  Treat these as stronger compatibility evidence than partial prose when sources disagree.
- The Python core is already gateway-pure, so the TypeScript port can reproduce the planners as pure
  functions and isolate I/O behind a small set of gateways modeled on `ts/packages/areg`'s
  fake/real split.
- The current TypeScript workspace is the right home: pnpm workspaces, Node ESM, strict TypeScript,
  Vitest, and command shells built through `@asdl/clinkr`.
- The run-from-source shim accepted for prior ports is an adequate installed model for `slot`;
  checkout-free bundling and npm publish are not required for cutover. (Note: `slot` is currently
  installed as an *editable uv tool* by `install-tools`, unlike the already-shimmed siblings — the
  cutover replaces that uv tool with a `just install-slot` TS shim; justfile lines ~120–126.)
- No installed skill currently shells out to `slot` (the hidden `slot gt exec stack-branches` /
  `stack-map-branches` commands are skill-ready JSON surfaces but have no current skill consumer), so
  the cutover's consumer-migration surface is small. Confirm during inventory.

Risks:

- **Shell-integration parity is the central, novel migration risk.** The parent-shell wrapper reads
  `$SLOT_CD_DIRECTIVE_FILE`, navigation commands write the destination only when that env var is set
  and the command is human-format, and `slot shell install` / `slot completion install` append
  idempotent marker blocks to the user's real rc file. The fake-backed TypeScript shell/completion
  slice de-risks env-var naming, marker/idempotency behavior, redirected rc writes, and JSON-mode cd
  suppression; the deliberate real-shell parity check is still required before this risk is fully
  retired.
- `git worktree` semantics are load-bearing and easy to approximate incorrectly: detached-worktree
  creation, removal, dirty detection (`has_uncommitted_changes`), and in-progress operation detection
  via branch occupancies (rebasing/bisecting) all drive `assigned`/`available`/`operation` status and
  the safety refusals in `free`, `gc`, and `resize` shrink. Follow-up `gc --delete-branches`
  performance work reduced repeated PR and worktree-marker probes, and slot-local gateway command
  diagnostics now make future git/gh subprocess fanout observable without polluting JSON stdout.
- The command surface is the largest ported so far (17 commands, multi-selector `free`, `--current`
  redirect planning with reflog/trunk/detach strategies in `checkout_planning.plan_current_wt_redirect`).
  Each carries exit-code and abort-path contracts that need explicit tests.
- `slot gt` must depend on Graphite only through plumbing (`gt parent_of`/`children_of`/`stack`/
  `trunk`), never by parsing human `gt` output, and plain `slot` must never touch Graphite. The
  Graphite metadata remediation centralized private `.graphite_metadata.db` parsing and topology
  walking in `@asdl/core/graphite-metadata` for the slot and ccc Graphite-named consumers, reducing
  copy-drift from the earlier slot-local reader. The remaining accepted risk is Graphite private DB
  schema drift, which is now guarded in one shared parser with consumer-specific fail-open/fail-closed
  adapters.
- Some Python tests or fixtures may encode accidental implementation behavior (Click/Clinkr rendering,
  Rich markup) rather than durable contract; each slice must distinguish the two before pinning a
  fixture.
- `slot` is installed differently from its shimmed siblings (editable uv tool), so the distribution
  cutover touches `install-tools` and must remove the uv tool cleanly, mirroring how `handoff`/`areg`
  removed stale `.venv` scripts.
- Deleting `packages/asdl-slots` touches the Python workspace, the `asdl.plugins` entry point, and a
  shared test surface; broaden validation to full `just` on the deletion row and record a rollback
  reference commit.

## Open Questions

- Standalone-only vs. `asdl slot` plugin: the Python package registers an `asdl.plugins` entry point
  (`pyproject.toml`), but the `areg` port resolved that **no TypeScript `asdl.plugins` analog exists**
  and shipped standalone-only. Default to standalone-only and park the plugin surface; confirm no live
  consumer depends on `asdl slot` before retiring it.
- cd-directive protocol fidelity: keep the `$SLOT_CD_DIRECTIVE_FILE` env-var name and single-line
  destination-file contract verbatim (the installed wrapper depends on it), or redesign? Default:
  keep verbatim while a shell wrapper consumes it; resolve in `prework/05`.
- rc-block byte parity: the TypeScript shell wrapper preserves the user-visible marker/idempotency
  contract, while completion activation intentionally uses package-local static completion scripts
  instead of Python's Click `_SLOT_COMPLETE` activation because `@asdl/clinkr` does not implement that
  protocol. Keep the real-shell parity check pending before treating this decision as cutover-ready.
- Clipboard fallback semantics: preserve the `backend_missing` / `subprocess_error` reason tags and
  the `copied`/`skipped`/`failure` tri-state in the JSON envelope verbatim. Confirm whether any
  consumer branches on the reason tag.
- Distribution: shim name `slot` via `just install-slot`, replacing the current editable-uv-tool
  install in `install-tools`; confirm the `ts-install` precondition and the stale-uv-tool removal
  step.
- `slot gt exec stack-map-branches` consumer: it is designed for a stack-map skill/agent but has no
  current wired consumer; confirm during inventory whether to port it at full fidelity now or park it.

## Closure

Pending. This section will record completion once the roadmap rows are done: the standalone
TypeScript `slot` CLI as the sole active surface for all 17 commands, run-from-source shim installed
by `just install-slot` / `install-tools`, deletion of `packages/asdl-slots` from active paths with a
recorded rollback reference, verified parent-shell `cd` / rc-block / clipboard parity, and umbrella
playbook + ledger feedback.
