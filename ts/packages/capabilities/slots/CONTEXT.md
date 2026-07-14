# @nseng-ai/slots

This context captures Slot language for the Git-worktree-backed slot pool and the boundary between Slot command usage, in-process Capability API composition, ns-owned shell integration, and Graphite-aware slot helpers.

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
*Avoid*: current working directory alone, ns host context, cmux workspace context

**Slot Checkout Target**:
The canonical result shape describing where a branch was placed or already lives, including branch name, slot/worktree path, parent-shell `cd` command, and checkout-state notes.
*Avoid*: cmux-capability checkout DTO, parsed CLI JSON, display text

The `ns slot ...` command surface — the user- and agent-facing commands mounted as `ns slot ...`, including lifecycle commands, human output, machine-readable output, and command-only Graphite helpers — is an ordinary architectural layer, not a defined term.

**Slot Capability API**:
The curated `@nseng-ai/slots/api` surface for downstream in-process consumers that need Slot behavior without invoking the CLI or importing private modules.
*Avoid*: command output parsing, `@nseng-ai/slots/src/...` import, package-root convenience import, `ctx`-passing API

**Checkout Side-Effect Policy**:
The rule that **Slot Capability API** checkout side effects are explicit opt-ins, while safe in-process defaults do not copy to the clipboard or write parent-shell navigation directives.
*Avoid*: hidden navigation side effect, JSON command moving the shell, treating `--no-clipboard` as a no-`cd` option

**Parent-Shell Navigation**:
A human-output command behavior where successful navigation commands can ask the installed ns shell wrapper to move the caller's shell after the child process exits.
*Avoid*: child process `cd`, Capability API navigation, standalone Slot shell wrapper

**Shell Directive**:
A short-lived file-based signal that carries the destination path from an ns child process to the installed ns shell wrapper.
*Avoid*: clipboard command, rc-file marker, general command output

**Slot Shell Mount**:
The compatibility `ns slot shell ...` command group that exposes the same ns-owned parent-shell integration as `ns shell ...` from within the Slot command tree.
*Avoid*: Slot-owned shell installer, separate `slot()` wrapper, `@nseng-ai/slots/shell-support`
**Slot Graphite Command Group**:
The `ns slot gt ...` command surface for Graphite-aware Slot navigation, stack release, and hidden skill/agent helpers.
*Avoid*: Graphite support package, Slot Capability API by default, cmux-capability landing policy

**Slot Graphite Exec Helper**:
A hidden command-face helper under `ns slot gt exec ...` that emits structured Graphite/Slot facts for skills or agents while staying outside the **Slot Capability API** until an in-process consumer proves the need.
*Avoid*: public human command, Capability API promotion, parsing `gt` display output

**Slot Provisioning**:
The Slot feature that copies declared gitignored files (for example `.env.local`) from the **Provision Store** into slot worktrees — filling gaps after placement and on `ns slot provision apply`, never overwriting except via `--force`.
*Avoid*: dotfile sync, secret manager, git-tracked copying, worktree template

**Provision Declaration**:
The `[slots] provision` array of exact repo-relative file paths in `ns.toml` that names which files **Slot Provisioning** manages; the git-native half of the contract.
*Avoid*: glob list, manifest, provision store index

**Provision Store**:
The per-repo, machine-local directory under the slots state root (`repos/<repoName>/provision/default/`) holding the content of declared provisioned files; populated only by the deliberate `ns slot provision import` step.
*Avoid*: hidden database, cache, git storage, backup
