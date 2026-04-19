# Clinkr Migration

Status: in progress

Tracks the incremental migration of `@clinkr_operation` commands onto the new
clinkr registration API introduced in [#149] and first adopted in [#150]. See
`docs/clinkr-redesign-spec.md` for the design rationale and `twerk_core.clinkr`
for the implementation.

[#149]: https://github.com/schrockn/twerk/pull/149
[#150]: https://github.com/schrockn/twerk/pull/150

## What "migrated" means

A command is considered migrated when **all** of the following hold:

1. Its operation returns `ClinkrExit[T]` (from `twerk_core.clinkr.exit`)
   instead of `T | ClinkrCommandError`.
2. Error paths go through `ClinkrExit.fail(error_type=..., message=...,
   exit_code=...)`. Probe-style "found nothing, but that's a valid answer"
   paths go through `ClinkrExit.negative(result, exit_code=...)`. Success paths
   go through `ClinkrExit.ok(result)`.
3. The operation is registered on its `ClinkrGroup` via
   `add_format_operation(group, op, add_legacy_json_alias=True)` from
   `twerk_core.clinkr.format_flag`, rather than being listed in
   `ClinkrGroup(operations=[...])`.
4. Scenario tests cover `--format json` for success, negative (where
   applicable), and error outcomes with the expected exit codes.

`add_legacy_json_alias=True` is a temporary bridge that keeps the existing
`<group> json <cmd>` subtree working during migration. Per the redesign spec it
will be removed once every command is migrated.

## Status checklist

### `twerk-core` — `brmem` group

- [x] `brmem check` — #150
- [x] `brmem branch check` — #149
- [x] `brmem put`
- [ ] `brmem get`
- [ ] `brmem list`

### `twerk-slots` — `slot` group

- [ ] `slot list`
- [ ] `slot goto`
- [ ] `slot gc`
- [ ] `slot free`
- [ ] `slot checkout`

### `twerk-pr-address` — `pr-address` group

- [ ] `pr-address add-issue-comment`
- [ ] `pr-address add-reaction`
- [ ] `pr-address add-review-thread-reply`
- [ ] `pr-address get-discussion-comments`
- [ ] `pr-address get-feedback`
- [ ] `pr-address get-pr-for-branch`
- [ ] `pr-address get-review-comments`
- [ ] `pr-address get-reviews`
- [ ] `pr-address prepare-run`
- [ ] `pr-address reply-to-discussion`
- [ ] `pr-address reply-to-review`
- [ ] `pr-address resolve-thread`
- [ ] `pr-address resolve-thread-with-reply`
- [ ] `pr-address unresolve-thread`

### `twerk-objectives` — `objective` group

- [ ] `objective list`

### `twerk-reviewer` — `reviewer` group

- No operations registered yet; nothing to migrate.

## Planning a single-command migration

Before writing code, produce a short plan that answers the questions in this
section. PR #149 (the framework + a probe-style command) and PR #150 (a
pure-adoption migration) are the two worked examples to cross-reference.

### 1. Pick the reference PR

- **Pure adoption** (no new framework work, just swap `add_check_operation` /
  default registration for `add_format_operation`): model the diff on #150.
- **Framework change needed** (the command's exit semantics don't fit what
  `add_format_operation` and `ClinkrExit` already support): model the diff on
  #149, and expect to extend clinkr before migrating the command.

The vast majority of remaining migrations should be pure adoption.

### 2. Classify each return path

Read the operation top-to-bottom and label every `return` with one of:

- **ok** — success with a normal result payload. Becomes `ClinkrExit.ok(result)`,
  exit code 0.
- **negative** — a valid "not found" / "absent" / "no-op" answer that a shell
  caller should be able to distinguish from a crash (grep-style). Becomes
  `ClinkrExit.negative(result, exit_code=1)`. Only use this when the command
  genuinely has a meaningful probe semantic; most action commands don't.
- **fail** — input was invalid, a precondition was violated, or an external
  call errored. Becomes `ClinkrExit.fail(error_type=..., message=...,
  exit_code=2)`. Keep `error_type` and `message` identical to what the current
  `ClinkrCommandError` returns so JSON consumers aren't broken.

Decide the exit codes up front and write them into the plan. The convention
established by the two migrated commands is:

| Outcome  | Exit code |
| -------- | --------- |
| ok       | 0         |
| negative | 1         |
| fail     | 2         |

For commands with no negative case (e.g. most `pr-address` actions), fail
stays at 2 and there is no exit code 1.

### 3. Plan the result-dataclass changes

- If the command has a negative case, the result dataclass needs a human
  message for the `text` format. `add_format_operation` looks for an
  `absent_message: str | None` attribute on the result and prints it to stderr
  when `exit_code != 0`. Add that field if it isn't there. See `check.py` in
  both #149 and #150.
- Do **not** put process metadata (exit codes, success flags) onto the domain
  dataclass. That's what `ClinkrExit` is for.
- Leave `to_json_dict` alone unless you're also changing the serialized shape
  (you probably aren't — migration is not a schema change).

### 4. Plan the `__init__.py` edit

The group registration changes from:

```python
group = ClinkrGroup(operations=[run_foo, ...])
```

to:

```python
group = ClinkrGroup(operations=[...other ops...])
add_format_operation(group, run_foo, add_legacy_json_alias=True)
```

Import `add_format_operation` from `twerk_core.clinkr.format_flag`. Keep
`add_legacy_json_alias=True` for now so the `<group> json <cmd>` path keeps
working.

### 5. Plan the test additions

In the package's scenario test file (e.g.
`packages/twerk-core/tests/scenario/test_brmem_cli.py`), add one test per
`ClinkrExit` variant the operation can produce, invoking through the
standalone `cli_group` fixture with `--format json`:

- `test_<cmd>_format_json_ok` — asserts exit code 0 and the success payload.
- `test_<cmd>_format_json_negative_exits_one` — asserts exit code 1 and the
  payload still serializes (only for commands with a negative case).
- `test_<cmd>_format_json_<error>_exits_two` — asserts exit code 2 and the
  `{"success": false, "error_type": ..., "message": ...}` envelope, one per
  distinct `error_type`.

The `--format text` path is already covered by existing tests; don't duplicate
those.

### 6. Sanity checks before writing code

- Does the operation actually have a probe semantic, or is every non-ok path
  really a failure? When in doubt, default to `fail` with exit 2.
- Is any caller (scripts, other CLIs, skills) relying on the current exit
  codes? If yes, document the new codes in the PR description and keep the
  legacy alias on.
- Are there new `ClinkrCommandError` variants that don't map cleanly to a
  single `error_type`? Normalize them in the plan rather than inventing new
  ones on the fly.

### 7. Deliverables

A migration PR should contain, in order:

1. The operation source file: return type changed to `ClinkrExit[T]`, every
   return path rewritten per the classification in step 2.
2. The group `__init__.py`: `add_format_operation(..., add_legacy_json_alias=True)`.
3. New scenario tests for `--format json` covering every `ClinkrExit` variant.
4. No changes to result-dataclass JSON shape, no changes to `text`-format
   output, no changes to the legacy `json <cmd>` output. The migration is
   observable only via `--format json` and exit codes.

Check the box in the status checklist above and link the PR.
