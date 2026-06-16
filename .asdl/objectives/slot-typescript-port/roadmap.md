# Roadmap

## Work

- [x] Inventory the current public `slot` contract.
  - Evidence sources: package `README.md`, group registration (`cli/slot/group.py`,
    `cli/slot/gt/group.py`), the outcome dataclasses (`lifecycle/outcomes.py`), the pure core
    (`inventory.py`, `naming.py`, `checkout_planning.py`, `repo_context.py`), shell integration
    (`shell_integration.py`, `cli/slot/shell.py`, `cli/slot/completion.py`), clipboard
    (`gateway/clipboard.py`, `gateway/real_clipboard.py`), gt commands (`cli/slot/gt/*`,
    `cli/slot/gt/exec/*`), `pyproject.toml` entry points, and the scenario/unit/integration tests.
  - Record the durable/incidental classification in `slot-contract-inventory.md`: 17 commands and
    flags, `--format json` envelopes, exit codes, `git worktree` source-of-truth model, `slot-NN`
    naming, 1..99 bounds, lowest-available allocation, `~/.slots` paths, cd-directive protocol,
    rc-block install bytes/markers, clipboard tri-state, gt plumbing boundary, and likely-incidental
    Python/Click/Rich details.
  - Policy: read-only inventory and checked-in Objective/doc updates are directly executable.
  - Evidence: `slot-contract-inventory.md` plus a Semantic Update.

- [x] Author the `prework/` downstream-execution suite.
  - Produce `prework/README.md` and the seven specs (architecture & module map; pure-core & naming;
    worktree lifecycle; gt & gateways; shell & clipboard integration; ts-scaffold & cutover; PR
    slicing & next-session plan), each with `file:line` evidence or PR execution guidance and a TS
    test checklist distilled from the Python tests.
  - Resolve the objective's Open Questions into the README's resolved-decisions list where codebase
    evidence settles them (standalone-only, cd-directive verbatim, rc-block marker parity, clipboard
    reasons, shim distribution).
  - Policy: read-only analysis and checked-in docs are directly executable.
  - Evidence: `prework/` suite, `prework/07-pr-slicing-and-next-session-plan.md`, plus Semantic Updates.

- [x] Scaffold `ts/packages/slot` and port the pure core + first read-only operation (`list`).
  - Create `package.json` (`@asdl/slot`, bin `slot`, deps `@asdl/clinkr` + `@asdl/core` + `zod`),
    `tsconfig.json`, `cli.ts`, `context.ts`, and the gateway interfaces with in-memory fakes,
    modeled on `ts/packages/brmem` and `ts/packages/areg`.
  - Port the pure core (naming, inventory derivation + selectors, repo-context path resolution) and
    `list`/`ls` end-to-end with a fake git gateway and scenario tests covering human + JSON output,
    `assigned`/`available`/`operation` rows, and empty-pool behavior.
  - Policy: package scaffold, gateway interfaces, and the first operation are directly executable
    after preview. Ask before any change to `slot-NN` naming, `~/.slots` paths, or pool bounds.
  - Evidence: scaffolded package, pure-core unit tests, `list` scenario tests, and a Semantic Update.

- [x] Port pool lifecycle: `init` and `resize`.
  - Preserve 1..99 bounds and `invalid_size`, `pool_already_initialized` refusal, gap-filling grow
    order, shrink-from-highest, and the multi-offender `resize_unsafe` refusal (assigned / dirty /
    operation-in-progress), plus `~/.slots` metadata-dir creation.
  - Policy: directly executable after preview with fake + throwaway-repo git gateways. Ask before
    changing bounds, allocation order, or safety refusals.
  - Evidence: scenario + real-git tests for init/resize grow/shrink/refusal, and a Semantic Update.

- [ ] Port allocation/movement: `checkout`/`co` and `claim`.
  - Preserve `checkout` plan semantics (`ReuseAssignment`, `BranchInMainWorktree`, `BranchInUse`,
    `AssignToSlot`, `PoolFull`), `-b NEW [BASE]` creation, `--current` redirect planning
    (reflog-previous / trunk / detach strategies), `pool_full`/`branch_in_use`/`branch_missing`/
    `base_missing`/`branch_exists` error types, dirty/detached refusals, and the
    `cd_command`/clipboard fields. Preserve `claim` source-slot detach + main-worktree behavior.
  - Policy: directly executable after preview. Ask before changing redirect strategy or error types.
  - Evidence: scenario + real-git tests including `--current` redirect branches, and a Semantic
    Update.

- [ ] Port release: `free` and `gc`.
  - Preserve `free` multi-selector resolution (`-n`/`-w`/`-b`/`-c`/`--all`), dedup-in-order,
    `--dry-run`, `-y/--yes` (required in JSON when `--all`), partial-failure messaging, and the
    `--all` PR-close + local-branch-delete cleanup. Preserve `gc` sweep classification
    (`freed`/`would_free`/`kept_open_pr`/`kept_no_pr`/`skipped_*`/`error`), `--force`, `--dry-run`,
    `--delete-branches`, and cleanup-error counting. Use the fake PR gateway.
  - Policy: directly executable after preview with fakes. Ask before changing cleanup or
    confirmation semantics. PR operations run only against fakes during validation.
  - Evidence: scenario tests for free/gc including `--all`/dry-run/cleanup, and a Semantic Update.

- [ ] Port the Graphite subgroup: `slot gt up|down|free-stack` and hidden `slot gt exec
      stack-branches|stack-map-branches`.
  - Reuse-or-checkout navigation for `up`/`down`; `free-stack` stack collection excluding current and
    trunk, with `--downstack`; `on_trunk`/`no_slots` noop reasons; `gt_*` error types and the
    `gt_untracked_branch` path. Drive Graphite only through `GtGateway` plumbing
    (`parent_of`/`children_of`/`stack`/`trunk`); never parse human `gt` output. Emit the exec JSON
    shapes for stack-branches / stack-map-branches.
  - Policy: directly executable after preview behind the `slot gt` Graphite-named boundary. Ask
    before broadening the Graphite dependency beyond `slot gt`.
  - Evidence: scenario tests with a fake GtGateway for up/down/free-stack/exec, and a Semantic Update.

- [ ] Port the OS-coupled surfaces: `slot shell show|install`, `slot completion show|install`,
      parent-shell `cd` directive, and clipboard. (Novel-risk slice.)
  - Preserve the `$SLOT_CD_DIRECTIVE_FILE` protocol and `inactive`/`written`/`failed` states; the
    "never cd in `--format json` / `--json-schema`" rule; zsh/bash detection from `$SHELL`; the
    marker blocks (`# >>> slot shell integration >>>`, `# >>> slot completion >>>`); idempotent
    `already_installed` detection; trailing-newline handling; and the clipboard tri-state with
    `backend_missing`/`subprocess_error` reasons.
  - Tests MUST redirect HOME / rc paths and the directive file to a fake; never touch the operator's
    real rc file. Include a deliberate, documented real-shell parity check (install the wrapper in a
    throwaway rc, run a navigation command, confirm the shell `cd`s).
  - Policy: steer-first slice. Preview required; ask before changing the env-var name, marker
    strings, or the JSON-mode cd suppression rule.
  - Evidence: fake-driven scenario tests for show/install/cd-directive/clipboard plus a real-shell
    parity note, and a Semantic Update.

- [ ] Cut over public docs, wrapper, and distribution to the TypeScript default.
  - Make the standalone TypeScript `slot` CLI the default surface; add `just install-slot`
    (`_install-ts-shim "slot" "ts/packages/slot/src/cli.ts" ...`), route `install-tools` through it,
    and remove the editable-uv-tool install of `packages/asdl-slots`; remove any stale uv tool/script
    as `handoff`/`areg` did. Update the package `README.md` / docs to name the TypeScript path.
  - Policy: docs, wrapper behavior/tests, and local-checkout behavior are directly executable after
    preview. npm/PyPI publishing and checkout-free bundling are out of scope unless newly accepted.
  - Evidence: shim recipe, wrapper tests (enclosing-checkout/canonical/missing-dep/no-checkout),
    `install-tools` routing, docs refresh, manual rendered-shim smoke, and a Semantic Update.

- [ ] Retire the Python fallback and delete `packages/asdl-slots` from active paths.
  - Gate on full 17-command parity, worktree-state parity, shell-integration parity (incl. real-shell
    check), run-from-source distribution evidence, and docs naming the TypeScript CLI as the sole
    surface. Remove the console script + `asdl.plugins` entry wiring, scrub workspace/config/test
    references, and record the post-deletion rollback reference commit.
  - Policy: the final gated deletion is directly executable once the gates are evidenced; otherwise
    ask before broad deletion. Validate with full `just`, not just the TS package.
  - Evidence: deletion diff, scrubbed references, rollback commit hash, full-repo validation, and a
    Semantic Update.

- [ ] Feed lessons into the umbrella porting playbook and reconcile the migration ledger.
  - Record reusable worktree-pool and shell-integration/OS-coupling lessons (the first such port) for
    later capability ports; recommend any second-consumer-proven seam to `ts-cli-foundation`. Update
    the umbrella ledger/roadmap to mark `slot` TS-default and reconcile any stale sibling rows.
  - Policy: directly executable once repeated evidence exists; do not generalize from a single slice.
  - Evidence: playbook + ledger edits and an umbrella Semantic Update.

## Parked

- The `asdl slot` plugin surface (`cli/plugin.py`, `pyproject.toml` `asdl.plugins`) — default to
  standalone-only per the `areg` precedent (no TS `asdl.plugins` analog); revisit only if a live
  consumer of `asdl slot` is found.
- Non-macOS clipboard backends and non-zsh/non-bash shells — out of scope beyond current Python
  behavior (graceful clipboard failure; zsh/bash only).
- Extracting a shared TypeScript git-worktree or shell-integration gateway into `@asdl/core` — keep
  slot plumbing package-local until a second consumer proves the seam, then coordinate with
  `ts-cli-foundation`.
- npm registry publishing / checkout-free bundled distribution of `slot` — not required under the
  accepted run-from-source shim model.
- Any redesign of the `~/.slots` layout, `slot-NN` naming, pool bounds, allocation order, or the
  `$SLOT_CD_DIRECTIVE_FILE` protocol — frozen while the installed shell wrapper depends on them.
