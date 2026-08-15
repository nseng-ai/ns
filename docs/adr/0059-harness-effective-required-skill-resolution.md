# ADR 0059: Harness-Effective Required Skill Resolution

## Status

Accepted

Refines ADR 0058's runtime Skill-Backed Command contract. Supersedes only ADR 0048's repo-backed source-authority clause for portable and global Pi commands. ADR 0048's fail-closed safety rules, deferred content loading, cause-preserving errors, and lifecycle separation remain in force. Explicitly repository-authoritative workflows remain repository-backed.

## Context

Pi resolves skills from several sources before it constructs the system prompt. Its effective skill inventory already embodies the harness's discovery, precedence, project selection, and user-level installation policy. The command inventory is not that authority: `/skill:*` commands are an invocation surface, may be hidden or absent, and encode command names rather than the exact effective skill source.

ADR 0048 correctly required Skill-Backed Commands to fail closed and rejected substituting weaker prompt prose. Its repo-backed rule was also correct for workflows whose contract deliberately names the checked-out repository as authority. Applying that rule to portable or globally installed commands, however, ignores Pi's selected project or user winner and prevents the same command from using the skill source Pi placed in its system prompt.

Runtime resolution must not recreate installation, precedence, containment, or symlink policy. ADR 0058 keeps skill acquisition and lifecycle outside ns. Pi's effective inventory is therefore the narrow runtime authority for commands that require the harness-effective skill.

## Decision

Portable and global Pi Skill-Backed Commands resolve a required skill by exact `name` match in `ExtensionCommandContext.getSystemPromptOptions().skills`.

Resolution has two phases:

1. Capture exactly one effective source record containing its `name`, exact `filePath`, and exact `baseDir` before command-specific work that depends on the required skill.
2. Read and expand that captured source only when the model path needs the instructions.

A missing or undefined skill inventory, no exact match, or more than one exact match is a broken runtime invariant. The command fails with `Could not load required skill "<name>"`, preserving the underlying failure as `cause`, and starts no model turn. Duplicate names fail rather than choosing by array order.

Expansion preserves Pi's `filePath` and `baseDir` verbatim. It does not derive a replacement base directory, constrain the path to the current working directory or repository, resolve symlinks, perform containment checks, or consult `/skill:*` commands. A captured source remains authoritative for the deferred read even if a later inventory call would return a different winner.

Content reads, frontmatter parsing, and block construction remain deferred. Existing malformed-frontmatter and cause-chaining behavior remains unchanged.

Explicit repository-authority APIs remain separately named and retain ADR 0048's repository lookup, precedence, Git-root containment, and symlink safety behavior. Callers choose repository authority deliberately; portable/global helpers do not silently fall back to it.

This runtime use of an effective skill does not install, update, remove, reconcile, or claim lifecycle ownership of that skill.

## Acceptance examples

- A project skill selected by Pi wins over another installed source, and a portable command expands the exact selected `filePath` with its exact `baseDir`.
- A user-level skill outside the command's current repository is accepted when Pi includes it in the effective inventory.
- A missing or undefined `skills` field fails with `Could not load required skill "objective"` and preserves a cause.
- Two effective records named `objective` fail as an invariant instead of selecting the first.
- A source is captured, the host inventory changes, and deferred expansion still reads the captured path.
- An unreadable file or malformed frontmatter fails before prompt delivery and preserves the underlying error as `cause`.
- No `/skill:objective` command is required.
- A workflow that explicitly requires the checked-out repository continues to use the distinctly named repository-authority helpers and their safety checks.

## Consequences

- Portable and global Pi commands follow the same effective source and precedence that Pi uses for its system prompt.
- Command visibility and skill source authority are no longer conflated.
- Narrow host types must expose `getSystemPromptOptions()` and only the effective skill fields required by runtime expansion.
- Deferred reads remain deterministic because source resolution returns a captured value rather than a live inventory handle.
- Harness-selected paths may be outside the current repository; trust and path policy remain Pi's responsibility for this contract.
- Repository-authoritative workflows retain their stronger repository lookup and safety policy under explicitly named APIs.
- Skill lifecycle remains external to ns as required by ADR 0058.

## Considered options

### Continue resolving through `/skill:*` commands

Rejected. Command inventory is an invocation surface, not Pi's effective source inventory, and hidden or disabled command exposure must not make an otherwise effective skill unavailable.

### Re-run effective resolution when content is loaded

Rejected. Inventory precedence may change between preparation and model delivery. Capturing the selected source makes deferred loading deterministic.

### Apply repository containment and symlink checks to effective sources

Rejected. Pi has already selected the source, including project and user-level winners. Reapplying repository policy would reject valid effective sources and create a second resolver.

### Replace all repository-authoritative APIs

Rejected. Some workflows intentionally require checked-out repository instructions and their associated safety policy. Their authority remains explicit and distinct.

### Fall back from effective resolution to repository lookup

Rejected. Silent fallback mixes authorities, obscures installation or inventory defects, and violates fail-closed behavior.
