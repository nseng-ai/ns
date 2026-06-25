# @sdl/slot

This context captures Slot language for the Git-worktree-backed slot pool and the boundary between Slot command usage, in-process Capability API composition, SDL-owned shell integration, and Graphite-aware slot helpers.

## Language

**Slot**:
A managed Git worktree in a repository-local numbered pool, used to place or enter one branch without taking over the repository's main checkout.
*Avoid*: cmux workspace, shell session, branch, hidden checkout

**Slot Pool**:
The set of numbered **Slots** initialized for a repository checkout.
*Avoid*: worktree registry, cmux workspace set, temporary directory cache

**Slot Record**:
The inventory row for one numbered **Slot**, including its slot name, worktree path, and current assignment facts.
*Avoid*: workspace record, branch record, metadata-only row

**Slot Inventory**:
The derived view of the **Slot Pool** that tells which **Slot Records** are available, assigned, occupied, or cleanup candidates.
*Avoid*: hidden database, task list, Graphite stack map

**Slot Repo Context**:
The resolved repository facts that let Slot relate the current checkout, the main worktree, managed slot worktrees, and slot metadata for one repository.
*Avoid*: current working directory alone, SDL host context, cmux workspace context

**Slot Checkout Target**:
The canonical result shape describing where a branch was placed or already lives, including branch name, slot/worktree path, parent-shell `cd` command, and checkout-state notes.
*Avoid*: CCC checkout DTO, parsed CLI JSON, display text

**Slot Command Face**:
The user- and agent-facing command surface mounted as `sdl slot ...`, including lifecycle commands, human output, machine-readable output, and command-only Graphite helpers.
*Avoid*: standalone `slot` executable, top-level slot shim, Capability API, private source import

**Slot Capability API**:
The curated `@sdl/slot/api` surface for downstream in-process consumers that need Slot behavior without invoking the CLI or importing private modules.
*Avoid*: command output parsing, `@sdl/slot/src/...` import, package-root convenience import, `ctx`-passing API

**Checkout Side-Effect Policy**:
The rule that **Slot Capability API** checkout side effects are explicit opt-ins, while safe in-process defaults do not copy to the clipboard or write parent-shell navigation directives.
*Avoid*: hidden navigation side effect, JSON command moving the shell, treating `--no-clipboard` as a no-`cd` option

**Parent-Shell Navigation**:
A human-output command behavior where successful navigation commands can ask the installed SDL shell wrapper to move the caller's shell after the child process exits.
*Avoid*: child process `cd`, Capability API navigation, standalone Slot shell wrapper

**Shell Directive**:
A short-lived file-based signal that carries the destination path from an SDL child process to the installed SDL shell wrapper.
*Avoid*: clipboard command, rc-file marker, general command output

**Slot Shell Mount**:
The compatibility `sdl slot shell ...` command group that exposes the same SDL-owned parent-shell integration as `sdl shell ...` from within the Slot command tree.
*Avoid*: Slot-owned shell installer, separate `slot()` wrapper, `@sdl/slot/shell-support`

**Slot Graphite Command Group**:
The `sdl slot gt ...` command surface for Graphite-aware Slot navigation, stack release, and hidden skill/agent helpers.
*Avoid*: Graphite support package, Slot Capability API by default, CCC landing policy

**Slot Graphite Exec Helper**:
A hidden command-face helper under `sdl slot gt exec ...` that emits structured Graphite/Slot facts for skills or agents while staying outside the **Slot Capability API** until an in-process consumer proves the need.
*Avoid*: public human command, Capability API promotion, parsing `gt` display output
