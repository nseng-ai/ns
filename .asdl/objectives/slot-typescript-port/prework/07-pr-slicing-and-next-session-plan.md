# 07 — PR Slicing & Next-Session Plan

Purpose: make the `slot` TypeScript port easy to execute as several small Graphite PRs in a fresh
session without re-planning the branch boundaries. This file is not a new contract source; it is an
execution map over `roadmap.md`, `slot-contract-inventory.md`, and `prework/01`–`06`.

## Slicing principles

- Keep the first PR boring and foundational: package scaffold, pure core, fake gateways, and
  read-only `list`/`ls`. Every later PR should assume that shape instead of introducing a second
  architecture.
- Prefer PR boundaries that preserve one semantic invariant at a time: worktree inventory, pool
  lifecycle, navigation planning, release cleanup, Graphite plumbing, shell/clipboard integration,
  distribution cutover, Python deletion.
- Do not mix compatibility decisions with implementation churn. If a slice needs to change public
  CLI, JSON envelope, exit-code, `~/.slots`, `slot-NN`, cd-directive, rc-marker, clipboard, or
  Graphite-boundary behavior, stop and steer before coding.
- Each PR that changes implementation should add or strengthen tests in the same PR. Avoid a
  "code now, test later" split for this port because parity evidence is the migration contract.
- Each completed PR should add one Semantic Update under
  `.asdl/objectives/slot-typescript-port/updates/` summarizing the preserved contract, validation,
  and any follow-up. Do not create ceremonial updates for abandoned spikes.
- PRs may be a Graphite stack, but no PR should require the final Python deletion to be useful.
  Deletion is deliberately last and gated.

## Recommended next-session stack

This is the highest-throughput safe stack after the current prework-only branch is merged or used as
base.

### PR 1 — `slot-ts-scaffold-list`

**Roadmap row:** Scaffold `ts/packages/slot` and port the pure core + first read-only operation
(`list`).

**Scope**

- Add `ts/packages/slot/package.json`, `tsconfig.json`, `src/cli.ts`, `src/index.ts`, and
  `src/context.ts` following `prework/06`.
- Add package-local gateway interfaces and fakes sufficient for read-only inventory:
  `gateways/git.ts`, `gateways/storage.ts`, and fakes.
- Port pure `naming.ts`, `inventory.ts`, and `repo-context.ts` from `prework/02`.
- Implement `operations/list.ts` with `list` and `ls` command registration, human rendering, and
  JSON result schema.
- Add unit tests for naming/inventory/repo-context and scenario tests for `list`/`ls` over fakes.

**Explicitly out of scope**

- `init`, `resize`, checkout/claim/goto, Graphite, shell install, clipboard, distribution shims,
  Python fallback removal.
- Any change to `slot-NN` parsing/generation, pool bounds, or `~/.slots` path layout.

**Validation target**

- `pnpm --dir ts/packages/slot run test`
- `pnpm --dir ts/packages/slot run check`
- Broaden to `pnpm --dir ts run check` if workspace references or package discovery are touched.

**Evidence to record**

- Unit + scenario coverage for empty pool, assigned rows, available rows, operation rows, human
  output, JSON output, `--version`, help, and `--json-schema`.
- Semantic Update: `slot ts scaffold and list parity`.

### PR 2 — `slot-ts-pool-lifecycle`

**Roadmap row:** Port pool lifecycle: `init` and `resize`.

**Depends on:** PR 1.

**Scope**

- Add lifecycle code for `init` and `resize`, using the PR 1 inventory + git gateway seam.
- Extend the fake git/storage gateways with worktree add/remove and metadata-dir creation calls.
- Preserve 1..99 bounds, `invalid_size`, `pool_already_initialized`, gap-filling grow order,
  shrink-from-highest order, and `resize_unsafe` offender reporting.
- Add scenario tests and at least one throwaway real-git gateway test for worktree creation/removal
  semantics.

**Explicitly out of scope**

- Branch allocation/navigation and release cleanup.
- Any on-demand slot creation or metadata store beyond `git worktree list` + `~/.slots` dirs.

**Validation target**

- `pnpm --dir ts/packages/slot run test`
- `pnpm --dir ts/packages/slot run check`

**Evidence to record**

- Scenario coverage for init success, invalid size, already initialized, resize grow, resize shrink,
  dry/dirty/assigned/operation refusal cases, and real-git create/remove smoke.
- Semantic Update: `slot init resize lifecycle parity`.

### PR 3 — `slot-ts-cd-clipboard-primitives`

**Roadmap rows:** OS-coupled surfaces, but only the primitives needed by later navigation commands.

**Depends on:** PR 1. Can be developed after PR 1 in parallel with PR 2 if it avoids lifecycle code.

**Scope**

- Add `shell/cd-directive.ts` preserving `SLOT_CD_DIRECTIVE_FILE`, inactive/written/failed states,
  and JSON-mode suppression hooks.
- Add `gateways/clipboard.ts` with the copied/skipped/failure tri-state and preserved reason tags
  (`backend_missing`, `subprocess_error`) over an injected process runner.
- Add fake-driven tests for directive-file writes/failures and clipboard states.
- Optionally wire the primitive result schemas into shared outcome helpers, but do not implement
  navigation commands yet.

**Explicitly out of scope**

- `slot shell install`, `slot completion install`, real rc-file mutation, and real-shell parity.
- Checkout/claim/goto command behavior.

**Validation target**

- `pnpm --dir ts/packages/slot run test`
- `pnpm --dir ts/packages/slot run check`

**Evidence to record**

- Unit coverage proving no operator rc files or real `~/.slots` paths are touched.
- Semantic Update: `slot cd directive and clipboard primitives`.

### PR 4 — `slot-ts-checkout-claim-goto`

**Roadmap row:** Port allocation/movement: `checkout`/`co`, `claim`, and `goto`.

**Depends on:** PR 1 and preferably PR 3. Some tests may also reuse PR 2 gateway methods.

**Scope**

- Port checkout planning unions and redirect planning from `prework/02` / `prework/03`.
- Implement `checkout`/`co`, `claim`, and `goto` operation modules.
- Wire cd-directive and clipboard result fields from PR 3 into navigation outcomes.
- Preserve error types: `pool_full`, `branch_in_use`, `branch_missing`, `base_missing`,
  `branch_exists`, dirty/detached refusals, and `--current` redirect strategies.
- Add scenario tests over fakes and targeted real-git tests for branch checkout/create/detach cases.

**Explicitly out of scope**

- `free`, `gc`, Graphite navigation, shell/completion install commands, and distribution cutover.
- Changing redirect strategy or command JSON shape.

**Validation target**

- `pnpm --dir ts/packages/slot run test`
- `pnpm --dir ts/packages/slot run check`

**Evidence to record**

- Scenario coverage for reuse existing assignment, branch in main worktree, branch in use, assign to
  lowest slot, pool full, new branch creation, `--current` redirect variants, claim source detach,
  goto selectors, clipboard skipped/failure, and cd-directive inactive/written.
- Semantic Update: `slot checkout claim goto parity`.

### PR 5 — `slot-ts-release-free-gc`

**Roadmap row:** Port release: `free` and `gc`.

**Depends on:** PR 1. It can be developed before PR 4 if it keeps release helpers independent; it
may reuse PR 2 real-git gateway methods.

**Scope**

- Implement `free` selector resolution, dedup-in-order, dry-run, JSON `--all` confirmation rules,
  partial-failure messaging, PR-close/local-branch cleanup through fakes.
- Implement `gc` sweep classification and branch deletion options.
- Add a fake PR gateway; do not perform real GitHub writes in tests.

**Explicitly out of scope**

- `slot gt free-stack` (can reuse this later), real GitHub PR mutation, Python fallback removal.

**Validation target**

- `pnpm --dir ts/packages/slot run test`
- `pnpm --dir ts/packages/slot run check`

**Evidence to record**

- Scenario coverage for each selector, duplicate selectors, dry-run, `--all` with/without `--yes`,
  close/delete cleanup, kept-open-PR vs kept-no-PR, force, delete-branches, skipped/error counts.
- Semantic Update: `slot free gc release parity`.

### PR 6 — `slot-ts-gt-exec-and-navigation`

**Roadmap row:** Port the Graphite subgroup.

**Depends on:** PR 1. `gt up/down/free-stack` are easier after PR 4/5; hidden `gt exec` can be split
first if needed.

**Scope**

- Add `GtGateway` plumbing interface and fake.
- Implement hidden `slot gt exec stack-branches` and `stack-map-branches` JSON shapes first.
- Implement `slot gt up`, `slot gt down`, and `slot gt free-stack` once navigation/free helpers are
  available.
- Preserve the explicit Graphite boundary: only `slot gt` constructs/uses the `GtGateway`; plain
  `slot` commands do not import it.

**Explicitly out of scope**

- Parsing human `gt` output, broadening Graphite usage into plain `slot`, or changing stack topology
  semantics.

**Validation target**

- `pnpm --dir ts/packages/slot run test`
- `pnpm --dir ts/packages/slot run check`

**Evidence to record**

- Fake-gateway scenario coverage for up/down/free-stack/exec, including trunk/no-slot/untracked/error
  paths and `--downstack`.
- Semantic Update: `slot gt subgroup parity`.

### PR 7 — `slot-ts-shell-completion-install`

**Roadmap row:** Port OS-coupled surfaces: `slot shell show|install`, `slot completion
show|install`, parent-shell integration, and clipboard completion.

**Depends on:** PR 1 and PR 3.

**Scope**

- Implement `slot shell show|install` and `slot completion show|install`.
- Preserve marker strings, idempotent replacement/detection, zsh/bash detection from `$SHELL`, and
  trailing-newline behavior.
- Use redirected HOME/rc paths in tests. Never write the operator's real `~/.zshrc` or `~/.bashrc`.
- Perform and document the deliberate real-shell parity check in a throwaway rc file.

**Explicitly out of scope**

- Changing marker strings, env-var name, JSON-mode cd suppression, or adding new shell backends.

**Validation target**

- `pnpm --dir ts/packages/slot run test`
- `pnpm --dir ts/packages/slot run check`
- Manual real-shell parity note captured in the Semantic Update.

**Evidence to record**

- Fake-driven scenario coverage for show/install/idempotency/detection/newline behavior, plus the
  real-shell parity note.
- Semantic Update: `slot shell completion parity`.

## Later gated PRs

### PR 8 — `slot-ts-distribution-cutover`

Implement `just install-slot`, route `install-tools` through the TS shim, remove the editable uv-tool
install path, update docs, and test shim resolution. This should wait until the user-facing command
surface above is materially complete.

### PR 9 — `slot-python-retirement`

Delete `packages/asdl-slots` and scrub references only after all 17 commands, worktree-state parity,
shell-integration parity, distribution evidence, and docs are complete. Validate with full `just` and
record the rollback reference commit.

### PR 10 — `slot-porting-playbook-feedback`

Feed the proven OS-coupled and worktree-pool lessons into the umbrella playbook/ledger. Do this after
at least the shell/completion and distribution slices have real evidence; do not generalize from the
initial scaffold.

## Parallelization notes for a fresh session

- After PR 1 exists, PR 2 (`init`/`resize`), PR 3 (`cd`/clipboard primitives), PR 5 (`free`/`gc`),
  and the `gt exec` half of PR 6 can be planned independently over the same core abstractions.
- PR 4 should wait for PR 3 if possible because navigation outcome shapes include cd-directive and
  clipboard fields.
- `slot shell install`/`completion install` should remain separate from navigation even though they
  share the cd-directive protocol; it has a different blast radius and requires the real-shell check.
- Distribution and Python deletion are not throughput PRs; they are gated cleanup PRs.

## Fresh-session pickup checklist

1. Read `objective.md`, `roadmap.md`, `slot-contract-inventory.md`, and `prework/README.md`.
2. Read `prework/01`, `02`, and `06` before PR 1; read the relevant spec for later PRs.
3. Load `typescript-style` and `typescript-fake-driven-testing` before writing TypeScript.
4. Create the next Graphite branch from the current stack base using the `graphite` skill.
5. Keep each PR bounded to one slice above; stop before compatibility changes.
6. Run the slice validation target before keeping work.
7. Add one Semantic Update under this Objective for meaningful completed slice progress.
