# Inventory Baseline: Current Handoff Surfaces and Storage Contract

## Summary

This update records the **current (pre-migration) public and internal Handoff surfaces** in this repo, plus the **storage-sensitive contracts** that must remain compatible while migrating toward `@sdl/handoff` Capability APIs and eventual `sdl handoff ...` parity.

### Public user-facing surfaces (today)

**Pi slash commands (project-local extension)**

- Discovery adapter: `.pi/extensions/handoff.ts` → `ts/packages/hosts/pi/src/handoff/registration.ts`.
- Registered commands (plus description/renderer wiring):
  - `/handoff:create` (`handoff:create`) — create workflow prompt + storage instructions (no direct write in code).
  - `/handoff:pickup` (`handoff:pickup`) — list/select/read/summarize; stops after summary.
  - `/handoff:list` (`handoff:list`) — list inventory (custom list renderer).
  - `/ccc:handoff-tab` (`ccc:handoff-tab`) — create + cmux tab launch (WAIVED parity; cmux/UI primitive).
  - `/handoff:self` (`handoff:self`) — create + session replacement rendezvous (WAIVED parity; Pi session primitive).

Evidence:

- Command registration: `ts/packages/hosts/pi/src/handoff/registration.ts`.
- Slash surfaces mapped for skill replacement: `ts/packages/hosts/pi/src/commands/surfaces.ts`.

**Standalone TypeScript CLI (installed binary/shim)**

- `handoff` binary is provided by `@sdl/handoff`:
  - `ts/packages/handoff/package.json` → `"bin": { "handoff": "./src/cli.ts" }`.
  - Entry: `ts/packages/handoff/src/cli.ts`.
  - Leaves: `handoff list`, `handoff delete`, `handoff gc`.
- Shim install surface:
  - `justfile` target `install-handoff` installs a source shim to `~/.local/bin/handoff`.

Evidence:

- Shim: `justfile` (`install-handoff: (_install-ts-shim "handoff" "ts/packages/handoff/src/cli.ts" ...)`).
- CLI help shape tests: `ts/packages/handoff/test/scenario/cli-shape.test.ts`.

**Skills (portable “non-Pi harness” workflow surfaces)**

- `skills/handoff-create/SKILL.md` — create via `brmem` storage contract.
- `skills/handoff-pickup/SKILL.md` — list/pickup via `handoff list --format json` + `brmem get`.
- `skills/handoff/SKILL.md` — umbrella lifecycle/admin guidance; documents `handoff delete` and `handoff gc` as deterministic admin surfaces.

**Docs (repo-owned durable explanation of surfaces/contracts)**

- `docs/pi/handoff-artifacts.md` — canonical user model + current surface list.
- `docs/pi/README.md` — project-local extension inventory, including `.pi/extensions/handoff.ts`.

### Consumers and boundaries (today)

**Pi → CLI boundary (critical for compatibility)**

- Pi’s pickup/list implementation shells out to the standalone `handoff` CLI for inventory:
  - `ts/packages/hosts/pi/src/handoff/pickup-list.ts` executes:
    - `handoff list --branch <branch> --format json` (branch mode)
    - `handoff list --all --format json` (all-branches mode)
- Pi reads artifact bodies directly from Branch Memory via `brmem get`:
  - `ts/packages/hosts/pi/src/handoff/pickup-list.ts` executes:
    - `brmem get <key> --namespace handoff --branch <branch>`

**Pi create boundary**

- Pi create does *not* call `handoff` CLI (no `handoff create` leaf exists today). It prompts the model to run `brmem check` + `brmem put` directly.
  - Prompt and fallback recipe: `ts/packages/hosts/pi/src/handoff/create.ts` + `shared.ts`.

**Other Pi “handoff launch” consumers**

These reuse the same “create a handoff, verify it exists, then do a Pi-native session action” flow:

- `/ccc:handoff-tab`: `ts/packages/hosts/pi/src/handoff/tab.ts` (cmux focused tab launch).
- `/handoff:self`: `ts/packages/hosts/pi/src/handoff/self.ts` (session replacement rendezvous).
- `/claude:handoff`: `ts/packages/hosts/pi/src/claude/handoff-command.ts` (launch Claude Code; WAIVED parity).

## Objective Impact

- The roadmap inventory row is satisfied: we have a concrete map of current public surfaces (Pi, CLI, skills, docs), their consumers, and storage-sensitive compatibility constraints.
- No runtime behavior changed in this slice; this is durable evidence for follow-on migration work.

## Follow-Ups

- When introducing `@sdl/handoff/api` or `sdl handoff ...` leaves, preserve the storage contract and CLI/Pi compatibility constraints below.
- Before removing or bypassing the standalone `handoff` binary, migrate (or re-point) Pi’s inventory boundary currently implemented as `pi.exec("handoff", ["list", ...])` in `ts/packages/hosts/pi/src/handoff/pickup-list.ts`.
- Keep `just install-handoff` / shim references intact until parity exists and call sites have been re-inventoried.

---

## Storage-sensitive compatibility constraints (do not change during migration)

### Storage identity contract

Source of truth: `ts/packages/handoff/src/identity.ts` (re-exported as `@sdl/handoff/identity`).

- Branch Memory namespace: `handoff` (`HANDOFF_NAMESPACE`).
- Key suffix: `.md` (`HANDOFF_KEY_SUFFIX`).
- Key shape: flat `<semantic-slug>.md` (no `/`).
- Slug validation (`parseFlatHandoffSlug`):
  - trims must be exact (no leading/trailing whitespace)
  - rejects `.md`-suffixed slugs (so `handoff delete alpha.md` must keep failing)
  - rejects `/`
  - enforces lowercase `a-z0-9` words with single interior `-` only

### `handoff list` semantics and output shape

Source of truth: `ts/packages/handoff/src/operations/list.ts` + `artifact-storage.ts`.

- Branch resolution:
  - Defaults to current branch; refuses detached HEAD without explicit `--branch` or `--all`.
- Inventory filtering:
  - Only includes keys recognized by `isHandoffKey(...)` (suffix `.md` + flat slug parse).
- Branch-state classification:
  - Uses local Git branch presence (`active` vs `deleted`) via `git.localBranchPresence(...)`.
- `--all` lists across branches but *excludes* deleted local branches unless `--include-deleted` is set.
- JSON result schema (current):
  - `scope` (`branch` | `all-branches`)
  - `branch` (string | null)
  - `include_deleted` (boolean)
  - `handoffs` (array of summaries with `branch`, `branch_state`, `slug`, `key`, `entry_locator`, `updated_at`).

Pi compatibility note:

- Pi parses `handoff list --format json` output in `ts/packages/hosts/pi/src/handoff/pickup-list.ts`.
- Parser accepts either `data.handoffs` (current) **or** legacy `data.entries` / top-level payload shapes.
- Any future replacement for the standalone CLI must preserve a parseable JSON structure containing (at minimum) `branch` and `key` for each item.

### `handoff delete` contract

Source of truth: `ts/packages/handoff/src/operations/delete.ts` + `artifact-storage.ts`.

- Deletes exactly one artifact by **slug** (not key), validating via `handoffKeyFromSlug(...)`.
- Confirmation:
  - interactive confirm by default
  - non-interactive requires `--yes` / `-y`.
- Branch defaults to current branch; detached HEAD requires `--branch`.

### `handoff gc` contract

Source of truth: `ts/packages/handoff/src/operations/gc.ts` + `artifact-storage.ts`.

- Candidate set: handoffs whose **local branch is deleted** (`branch_state === "deleted"`).
- Does not delete git branches, remotes, Graphite state, or non-handoff Branch Memory entries.
- Confirmation:
  - supports `--dry-run` preview
  - non-interactive requires `--force` / `-f`.

## Evidence searches executed (for future re-checks)

- `rg -n "(/handoff:|handoff:create|handoff:pickup|handoff:list|handoff:self)" ts/packages/hosts/pi docs skills .pi`
- `rg -n "@sdl/handoff(\\b|/)" ts/packages`
- `rg -n "\\bhandoff (list|delete|gc|create|pickup)\\b" ts/packages/handoff ts/packages/hosts/pi docs skills justfile*`
- `rg -n "\\bhandoff\\b" justfile docs/pi/handoff-artifacts.md ts/packages/handoff/test/scenario/cli-shape.test.ts`
