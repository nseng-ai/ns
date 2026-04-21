# clinkr: temporary migration code and how to rip it out

This document exists **only** while the clinkr contract redesign is in flight
(see the `clinkr-contract-redesign` memjective). It is the authoritative
checklist for the final cleanup PR that removes the temporary `legacy`
dispatch path after every clinkr operation has been migrated to
`ClinkrExit[T]`.

**When PR 7 (the cleanup slice) merges, delete this file.**

## What is temporary and why

PR 1 introduced `ClinkrExit[T]` as the universal return contract for clinkr
operations, but could not migrate every operation at once — the migration is
intentionally package-by-package (brmem → slots → objectives → reviewer →
pr-address) so each slice stays reviewable and revertible.

To let both shapes coexist during that window, dispatch branches on
`ClinkrOperationMeta.return_style`:

- `"exit"` — operation returns `ClinkrExit[T]`. New envelope (see
  `ClinkrExit.to_envelope_dict`), exit codes 0/1/2.
- `"legacy"` — operation returns `T` or `T | ClinkrCommandError`. Old
  envelope (`emit_json_success` / `emit_json_error`), exit codes 0/1 only.

Every temporary artifact is grep-able: search the repo for the string
`clinkr-contract-redesign PR 7`. Each hit is a TODO marker on code that
must be deleted or simplified.

## Preconditions for running PR 7

Before any temporary code can be removed, all of the following must be
true. Do not start PR 7 unless they hold:

1. No operation anywhere still returns `T | ClinkrCommandError` or plain
   `T`. Every `@clinkr_operation` function returns `ClinkrExit[T]`.

   Verify:
   ```bash
   rg '@clinkr_operation' -l | xargs rg -l 'ClinkrCommandError|-> [A-Z][A-Za-z]+:$'
   ```
   Must return no matches.

2. No caller relies on the legacy machine envelope (`{"success": true/false,
   "error_type": ..., "message": ..., ...data...}`). The `pr-address` skill
   and its embedded `exec json ...` commands are the known consumers; they
   are migrated in PR 6 before PR 7 runs.

   Verify:
   ```bash
   rg '"success":\s*(true|false)' -l
   rg 'emit_json_success|emit_json_error' -l
   ```
   Should show only clinkr internals that PR 7 will delete.

3. The three helpers in `twerk_core/brmem/` that return
   `T | ClinkrCommandError` have been migrated to return `ClinkrExit[T]`:
   - `resolve_branch_name` in `brmem/gateway_access.py`
   - `validate_entry_ref` and `validate_entry_filters` in
     `brmem/validation.py`

   (These are not `@clinkr_operation`-decorated, but they feed operations
   and share the same error-carrier pattern. Either migrate them or inline
   their error paths into `ClinkrExit.failure(...)` at the call site.)

4. `ClinkrCommandError` has no remaining imports outside clinkr itself:
   ```bash
   rg 'from twerk_core\.clinkr\.command import' | rg ClinkrCommandError
   ```
   Must be empty.

## What to delete in PR 7

Do the deletions in this order. Each step should leave `just check` green
before moving on.

### 1. `packages/twerk-core/src/twerk_core/clinkr/command.py`

- Delete the `ClinkrCommandError` dataclass (lines defining it).
- Delete `emit_machine_error(...)` and `emit_machine_result(...)` helpers.
- Delete the `ReturnStyle` `Literal` type alias (no longer needed with one
  style).
- Remove the `return_style: ReturnStyle = "legacy"` parameter from both
  `machine_command(...)` and `_apply_machine_command(...)`.
- Inside `_apply_machine_command`'s `wrapped_callback`:
  - Delete the `if return_style == "exit":` guard; its body becomes the
    unconditional post-call path.
  - Delete the entire legacy fallback block beginning with the
    `# TODO(clinkr-contract-redesign PR 7)` comment (the
    `isinstance(result, ClinkrCommandError)` branch and the final
    `emit_machine_result` fallthrough).
  - Delete the `contract_violation` guard (or keep it as an assertion —
    invalid once every op is statically typed to return `ClinkrExit`).

### 2. `packages/twerk-core/src/twerk_core/clinkr/operation.py`

- Delete the `from twerk_core.clinkr.command import ClinkrCommandError`
  import.
- Delete the `ReturnStyle` `Literal` alias.
- Delete the `return_style: ReturnStyle` field from
  `ClinkrOperationMeta` and the corresponding argument to the
  `ClinkrOperationMeta(...)` constructor call in `clinkr_operation`.
- Update `_extract_types_from_hints` return type to
  `tuple[type, tuple[type, ...]]` (drop the third element).
- Delete the legacy branches in `_extract_types_from_hints`:
  - The `if origin is Union or origin is types.UnionType:` block
    (beginning with the `# TODO(clinkr-contract-redesign PR 7)` comment).
  - The `if isinstance(return_hint, type) and return_hint is not
    ClinkrCommandError:` block.
  - Replace them with a single trailing `raise TypeError(...)` for any
    non-`ClinkrExit[T]` annotation.

### 3. `packages/twerk-core/src/twerk_core/clinkr/group.py`

- Delete the `from twerk_core.clinkr.command import ClinkrCommandError`
  import.
- Inside `_register_operation`'s `human_callback`:
  - Delete the `if meta.return_style == "exit":` guard; its body becomes
    the unconditional post-call path.
  - Delete the legacy fallback beginning with the
    `# TODO(clinkr-contract-redesign PR 7)` comment.
- Remove the `return_style=meta.return_style` argument from the
  `_apply_machine_command(...)` call (only one style remains).

### 3a. `packages/twerk-core/src/twerk_core/clinkr/context.py`

- Delete `_MACHINE_MODE_KEY`.
- Delete the `# TODO(clinkr-contract-redesign PR 7)` fallback in
  `set_machine_mode(...)` / `is_machine_mode(...)` that stores the machine
  signal in `root.meta` when `ctx.obj` is not a `ClinkrContextObject`.
- After the migration is complete, machine-mode state should live only in the
  immutable `ClinkrContextObject` copied onto `root.obj`.

### 4. `packages/twerk-core/src/twerk_core/clinkr/dataclass_json.py`

- Delete `emit_json_success(...)` and `emit_json_error(...)` (replaced by
  `ClinkrExit.to_envelope_dict()`).
- Delete `ERROR_SCHEMA` if no remaining caller references it (PR 7 also
  updates `build_json_schema_document` to describe the `ClinkrExit`
  envelope, so `ERROR_SCHEMA` loses its consumer).

### 5. `packages/twerk-core/src/twerk_core/clinkr/README.md`

- Rewrite the "Machine Commands" and "@clinkr_operation" sections to
  describe the `ClinkrExit[T]` envelope (`{"exit_code", "error_type",
  "message", "data"}`) and the 0/1/2 exit-code table.
- Replace the `GreetResult | ClinkrCommandError` example with
  `ClinkrExit[GreetResult]`.
- Delete this `MIGRATION.md` file — the migration is done.

### 6. Tests

- Delete `packages/twerk-core/tests/unit/clinkr/test_operation_decorator.py`'s
  legacy-style tests:
  - `test_decorator_attaches_metadata` (uses `T | ClinkrCommandError`)
  - `test_plain_return_type_no_union`
  - `test_error_only_machine_command_error_return`
    Or rewrite them against the `ClinkrExit[T]` annotation.
- Delete `packages/twerk-core/tests/unit/clinkr/test_command.py`'s tests
  that assert the legacy `{"success": ..., "error_type": ..., "message": ...}`
  envelope (they become obsolete once the envelope format changes).
- Rewrite `test_machine_command_emits_structured_error_results` and
  similar to use `ClinkrExit.failure` and assert the new envelope.

### 7. Search for stragglers

Before merging PR 7, these searches must all return zero matches:

```bash
rg 'ClinkrCommandError'
rg 'return_style'
rg 'legacy'                 # in clinkr/ only
rg 'emit_json_success|emit_json_error'
rg 'clinkr-contract-redesign PR 7'
```

If any hit remains, either it is dead code (delete it) or a consumer was
missed in PRs 2–6 (fix that consumer, then resume PR 7).

## Out of scope for PR 7

PR 7 is purely cleanup — no behavior change beyond "one envelope, one
dispatch path." These are explicitly **not** part of PR 7:

- Removing the `ClinkrGroup._json_group` parallel subtree. That is part of
  the broader `--format json` migration (PRs 2–6 of the memjective) and
  must complete before PR 7 runs.
- Merging `ClinkrExit.ok(None)` as a supported shape. Add only if an
  operation genuinely has no positive payload; otherwise leave
  `ClinkrExit.ok(data: T)` strict.
- Collapsing `ExitStatus` into a plain int. The enum carries intent; keep
  it.
