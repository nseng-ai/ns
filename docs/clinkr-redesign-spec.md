# Clinkr Redesign Spec

Status: draft

## Summary

This document specifies a redesign of `twerk_core.clinkr` as a private CLI
framework for commands that work well for both humans and agents.

The redesign keeps clinkr's low-ceremony command authoring model while
changing three major pieces of the current architecture:

- Replace the `json` command subtree with a standardized `--format` flag.
- Replace split result/error/exit handling with an explicit `ClinkrExit[T]`
  return wrapper.
- Keep autodiscovery, but make it structural and package-based rather than
  reflective over arbitrary module namespaces.

Long-term backwards compatibility is not a goal. This is a private package.
However, the implementation should support temporary compatibility shims that
allow an incremental internal migration.

## Motivation

The current clinkr shape has three concrete problems:

- `packages/twerk-core/src/twerk_core/brmem/check_registration.py` exists only
  because clinkr does not model exit behavior cleanly enough for probe-style
  commands.
- Per-operation `human_renderer` hooks are too weak for commands that need to
  interleave human-facing output, confirmation, progress, and final rendering.
- The `json` subgroup bakes machine-readability into command topology instead
  of using standardized runtime flags.

The result is a framework that is convenient for small operations but not yet
factored around the right primitives for human-and-agent-friendly CLIs.

## Design Goals

- One command tree for both humans and machines.
- Human-readable output by default.
- Standardized, low-pollution output flags.
- Machine-readable output that is stable and easy to consume from shells and
  agents.
- Explicit exit semantics, including probe-style "negative but expected"
  outcomes.
- Low-ceremony command authoring with autodiscovery.
- No explicit command registration boilerplate.
- A framework-level runtime surface for interleaved output and interaction.
- Incremental internal adoption across packages and commands rather than a
  required big-bang rewrite.

## Non-Goals

- Permanent backwards compatibility with the current clinkr API or command
  layout.
- Preserving the `json` subtree.
- Switching to explicit `add_command(...)` registration.
- Turning clinkr into an MCP server abstraction.
- Supporting a large format matrix immediately. The initial scope is
  `text|json`.
- Keeping temporary migration shims after the internal migration is complete.

## Guiding Principles

- Prefer one obvious standardized flag over many command-specific flags.
- Treat machine-readable output as a real interface contract.
- Keep stdout reserved for command results; diagnostics and progress should go
  to stderr or be suppressible.
- Keep domain result objects pure; process metadata belongs in framework-owned
  wrappers, not in domain schemas.
- Prefer structural conventions over namespace reflection.
- Prefer opt-in migration layers over large flag days.

## External Prior Art

This redesign is informed by common patterns in modern CLIs:

- `gh`: human-readable default output, structured escape hatches, documented
  exit codes, prompt/debug/pager/color controls via flags and environment.
  https://cli.github.com/manual/gh_help_formatting
  https://cli.github.com/manual/gh_help_exit-codes
  https://cli.github.com/manual/gh_help_environment
- `kubectl`: one command tree, `-o/--output` for machine-oriented forms, and
  explicit scripting guidance to request stable machine output.
  https://kubernetes.io/docs/reference/kubectl/conventions/
  https://v1-34.docs.kubernetes.io/docs/reference/kubectl/
- AWS CLI: `--output json|yaml|yaml-stream|text|table|off`.
  https://docs.aws.amazon.com/cli/latest/userguide/cli-usage-output-format.html
- Azure CLI: JSON output plus `--output ...`, including `none`.
  https://learn.microsoft.com/en-us/cli/azure/format-output-azure-cli?view=azure-cli-latest
- Docker CLI: one command tree with a single formatting surface.
  https://docs.docker.com/engine/cli/formatting/
- Speakeasy's recent agent-friendly CLI guidance: non-interactive escape
  hatches, reduced noise, structured output, and agent guidance.
  https://www.speakeasy.com/blog/engineering-agent-friendly-cli

The primary product-shape conclusion is:

- Use one command tree.
- Use standardized format and interaction flags.
- Do not use a separate machine subtree.

## High-Level UX

### Command Topology

Clinkr will expose a single command tree.

Examples:

```text
brmem get docs/notes.md
brmem check docs/notes.md
brmem branch check feat/x
```

There is no `brmem json ...` form.

### Output Format

Commands will accept:

```text
--format text
--format json
```

`text` is the default. `json` is the initial machine-readable form.

The framework intentionally prefers `--format json` to `--json` in order to:

- reduce flag-surface proliferation
- leave room for future formats without adding new top-level flags
- align with the broader CLI ecosystem

### Interactivity

Commands may prompt or render rich human-oriented output in `text` mode.

Machine-oriented execution will be controlled by runtime flags rather than a
separate command subtree. The exact interaction flag surface is still open, but
the intended direction is:

- an explicit non-interactive mode
- quiet/suppressed progress in automated contexts
- stable structured output on stdout in `--format json`

## API Overview

### Operation Return Type

Operations will return a framework wrapper rather than a bare result or bare
error union.

```python
from dataclasses import dataclass
from typing import Generic, TypeVar

T = TypeVar("T")


@dataclass(frozen=True)
class ClinkrCommandError:
    error_type: str
    message: str


@dataclass(frozen=True)
class ClinkrExit(Generic[T]):
    exit_code: int
    result: T | None = None
    error: ClinkrCommandError | None = None
```

Invariants:

- exactly one of `result` or `error` is set
- `exit_code` is always explicit

Convenience constructors are expected:

```python
ClinkrExit.ok(result)
ClinkrExit.negative(result, exit_code=1)
ClinkrExit.fail(error_type="...", message="...", exit_code=1)
```

### Why `ClinkrExit[T]`

`ClinkrExit[T]` was chosen over:

- a separate decorator-level `exit_policy`
- magic `result.exit_code` properties

because it keeps process semantics explicit at the operation return site while
keeping domain result types pure.

It also cleanly models commands such as probes/checks whose non-zero exit code
is not an error payload but an expected negative result.

### Domain Result Objects

Command-specific result objects remain normal dataclasses or custom JSON
serializable types.

They do **not** carry framework process metadata such as:

- `exit_code`
- `success`
- command mode

Those concerns belong to `ClinkrExit` and the clinkr runtime, not to domain
schemas.

## Output Semantics

### Text Mode

In `--format text`:

- success results are rendered in human-oriented form
- negative-but-expected outcomes may render compact human diagnostics
- errors render as framework-owned human error messages

Text mode is the default human UX.

### JSON Mode

In `--format json`:

- stdout contains the structured final result payload or structured error
  payload
- stderr may contain diagnostics, progress, or warnings if permitted by the
  runtime policy
- the process exit code is taken from `ClinkrExit.exit_code`

For a probe command:

- found -> result payload, exit `0`
- not found -> result payload, exit `1`
- invalid request / transport failure -> error payload, exit `2` or other
  explicit code

This is a deliberate change from the current behavior where probe misses are
successful machine envelopes with exit `0`.

### JSON Payload Shape

The framework should unwrap `ClinkrExit` before serialization.

That means:

- `ClinkrExit` itself is never serialized
- domain result objects are serialized directly
- structured errors are serialized directly

This avoids polluting the machine contract with framework wrapper structure.

The exact error/result envelope shape may be revised as part of the rewrite,
but the wrapper object is not part of the user-visible schema.

## Exit Semantics

Exit behavior is no longer modeled as a separate policy object or as special
registration code.

Instead:

- each operation returns `ClinkrExit[T]`
- the framework renders the contained result or error
- the framework exits with `ClinkrExit.exit_code`

This removes the need for special one-off registration helpers such as
`brmem/check_registration.py`.

## Runtime and Interleaved Output

### Problem

`human_renderer` is insufficient because many commands need to do more than
render a final result.

Examples include:

- preview output before a confirmation prompt
- progress messages during long-running work
- warnings or hints emitted mid-command
- selective suppression of noisy output in machine-oriented execution

### Direction

Clinkr will introduce a framework-owned runtime/output surface that operations
can use during execution.

This runtime replaces the current idea that the only human-facing concern is a
final `human_renderer(result)` callback.

The exact API is still open, but it must support:

- normal human-facing informational output
- warnings
- progress/status updates
- confirmations/prompts
- final result rendering
- suppression or redirection of non-result output in machine-oriented modes

### Constraints

- The runtime must not require operations to inspect command topology to infer
  mode.
- The runtime must not require operations to check for a `json` parent command.
- Stdout in JSON mode must remain reserved for the final machine-readable
  payload.

### Final Result Rendering

There is still value in a declarative per-command final presenter for text
mode, but it should be narrow in scope:

- final text presentation of the contained domain result
- not progress
- not diagnostics
- not confirmation
- not exit handling

Whether this remains named `human_renderer` or is renamed is an implementation
detail.

## Discovery Model

### Decision

Clinkr keeps autodiscovery.

Clinkr does **not** move to explicit command registration.

### Problem With Current Discovery

The current implementation scans module namespaces for any callable carrying
clinkr metadata. This is convenient but too magical and too porous:

- imported decorated functions can be discovered accidentally
- imported decorated group factories can interfere with group discovery
- discovery is based on namespace contents rather than filesystem structure
- `discover_subcommands()` relies on stack inspection

### New Discovery Model

Autodiscovery becomes structural and package-based.

Conventions:

- one package = one CLI group
- one immediate child module = one command
- one immediate child subpackage = one subgroup

Example:

```text
brmem/
  __init__.py
  get.py
  put.py
  check.py
  list.py
  branch/
    __init__.py
    check.py
```

becomes:

```text
brmem get
brmem put
brmem check
brmem list
brmem branch check
```

### Discovery Rules

For a command module:

- import the immediate child module
- require exactly one locally-defined clinkr operation in that module
- only consider operations defined in that module, not imported into it

For a subgroup package:

- recurse into the package
- use its package docstring for help text by default

### Naming

Default names derive from filesystem/module names.

The intended default is to convert snake case to kebab case for command and
group names:

- `pr_address.py` -> `pr-address`
- `branch_memory/` -> `branch-memory`

This reduces the need for explicit display-name overrides when the desired CLI
name is hyphenated.

Explicit overrides may still exist for exceptional cases such as aliases,
hidden commands, or custom help.

### No Stack Inspection

`discover_subcommands()` should not depend on inspecting the caller frame.

Discovery should be driven by explicit package paths and filesystem structure,
not by execution context magic.

## Command Authoring Conventions

The redesign intentionally prefers conventions over registration boilerplate.

Expected authoring shape:

- package docstring supplies group help
- module docstring may supply command help
- one operation per command module
- nested packages define nested groups

Decorators remain useful for exceptional metadata, not for basic registration.

Expected examples of exceptional metadata:

- aliases
- hidden/internal commands
- explicit help overrides

## Internal / Hidden Commands

Clinkr still needs a way to support internal-only or skill-facing command
surfaces such as `pr-address exec`.

The redesign should support hidden groups or commands without forcing
machine-readable topology concerns into the public command tree.

This is primarily a visibility concern, not an output-format concern.

## Incremental Migration Plan

Although the target design is intentionally different from today's clinkr,
implementing it in one PR is not realistic. The migration should therefore be
incremental for internal consumers while still allowing the end state to be
clean.

The key requirement is:

- each dimension of the redesign should be adoptable independently

That means the framework should support a period where old and new command
shapes coexist inside the repo.

### Migration Constraints

The migration strategy should allow:

- package-by-package adoption
- command-by-command adoption within a package when useful
- short-lived compatibility adapters in the framework
- updating tests and internal callers incrementally rather than all at once

The migration strategy should avoid:

- forcing every package onto the new discovery model before any package can use
  `ClinkrExit`
- forcing every command to move to `--format` before the runtime can exist
- forcing every command to stop using `human_renderer` before a replacement
  runtime surface lands

### Expected Temporary Mixed State

During migration, it is acceptable for the repo to temporarily contain a mix
of:

- legacy commands that still use the `json` subtree
- migrated commands that expose `--format text|json`
- legacy operations returning `Result | ClinkrCommandError`
- migrated operations returning `ClinkrExit[T]`
- legacy reflective discovery in some packages
- structural discovery in migrated packages

This mixed state is an implementation tactic, not the product end state.

### Recommended Staging

One reasonable sequencing is:

1. Add the new runtime primitives in parallel with the old ones.
2. Allow package-level or group-level opt-in to the new discovery/runtime
   behavior.
3. Migrate simple commands first, especially probe-style commands that benefit
   most from `ClinkrExit`.
4. Migrate richer interactive commands once the runtime/output surface is
   ready.
5. Remove temporary shims after all internal command surfaces have moved.

### Acceptable Temporary Adapters

Examples of acceptable migration-only adapters:

- a legacy `json` command path delegating internally to the new `--format json`
  runtime
- an adapter that lifts `Result | ClinkrCommandError` into `ClinkrExit[T]`
- legacy discovery and structural discovery both supported behind explicit
  package-level entry points
- a narrowed compatibility layer for `human_renderer` while the richer runtime
  API is introduced

These adapters should be explicitly temporary and should be deleted once the
migration completes.

## Open Questions

These points are not yet fully specified by the conversation so far:

- The exact runtime/output API shape that replaces interleaved use cases for
  `human_renderer`.
- The precise JSON payload envelope for success and error outputs after
  `ClinkrExit` unwrapping.
- The initial non-interactive / quiet flag surface beyond `--format`.
- Whether schema emission remains a command flag and, if so, whether it stays
  as `--schema` or moves under a broader output/introspection surface.
- Whether command modules continue to require decorators for operation metadata
  or can infer more from file structure and names.

## Rejected Alternatives

### Explicit Command Registration

Rejected because it adds unnecessary boilerplate and works against clinkr's
goal of low-ceremony command authoring.

### Separate `json` Command Tree

Rejected because it duplicates the command surface, pollutes topology, and
forces operations to reason about mode through parent command structure.

### Decorator-Level Exit Policy Objects

Rejected because they split process semantics away from the operation's actual
return path and make probe-style behavior less obvious at the command
implementation site.

### Embedding Exit Codes in Domain Result Objects

Rejected because process metadata should not pollute domain schemas or JSON
contracts.

## Expected Outcomes

After the redesign:

- clinkr commands present one coherent command tree
- machine-oriented use is selected with `--format json`
- probe-style commands no longer need special registration helpers
- operations can interleave human-facing output through a runtime API
- autodiscovery remains low-ceremony without scanning arbitrary namespaces
- clinkr becomes a stronger substrate for private CLIs designed for humans and
  agents
