# 05 — Shell & Clipboard Integration Spec (novel-risk slice)

The first OS-coupled surface ported in this migration. Three cross-process/host contracts: the
parent-shell **cd-directive protocol**, the **rc-block install** for `slot shell` / `slot
completion`, and the **clipboard tri-state**. Getting any byte of the first two wrong silently breaks
`cd` for users. Slice: roadmap row 8 — but land `cd-directive.ts` earlier (row 3/5) because every
navigation command writes the directive (see `01 §Dependency note`).

Python source: `shell_integration.py`, `cli/slot/shell.py`, `cli/slot/completion.py`,
`gateway/clipboard.py`, `gateway/real_clipboard.py`.

---

## A. cd-directive protocol (`shell_integration.py` → `shell/cd-directive.ts`)

The mechanism by which a CLI subprocess tells its parent shell where to `cd`. **Cross-process wire
contract — keep verbatim.**

- Env var name: `SLOT_CD_DIRECTIVE_FILE` (`shell_integration.py:11`). Keep this exact string.
- `CdDirectiveResult{status: "inactive"|"written"|"failed", path: Path|null, error?: string}`
  (`shell_integration.py:12-19`).
- `activeCdDirectivePath(env?)` (`:22-27`): read `env[SLOT_CD_DIRECTIVE_FILE]` (default
  `process.env`); unset **or empty string** → `null` (inactive).
- `writeCdDirectiveIfActive(destination, { enabled=true, env? })` (`:30-51`):
  1. `directivePath = activeCdDirectivePath(env)`; if `!enabled || directivePath === null` →
     `{status:"inactive", path: directivePath}`.
  2. if the **parent directory** of `directivePath` does not exist →
     `{status:"failed", path, error: "parent directory does not exist: <parent>"}` (`:40-45`).
  3. write `String(destination)` to the file as UTF-8; on `OSError`/write error →
     `{status:"failed", path, error: <message>}`; else `{status:"written", path}` (`:47-51`).
- The destination written is the **bare worktree path string** (not `cd <path>`); the wrapper does the
  `cd`. (`navigation.build_navigation_result` passes `worktree_path`, `navigation.py:85-86`.)
- **Suppression rule:** navigation passes `enabled = not is_machine_mode(ctx)` (`up.py:89`), so
  `--format json` / `--json-schema` never write a directive. Contract — reproduce with the TS clinkr
  machine-mode check.

Inject `env` and the filesystem (or a write function) so tests never touch a real directive file
outside a tmp dir.

---

## B. Parent-shell wrapper (`cli/slot/shell.py` → `shell/install.ts` + `operations/shell.ts`)

### The wrapper script (the thing that makes `cd` work)

`_render_wrapper_script` (`shell.py:40-59`) renders this exact `slot()` shell function (same for
zsh/bash). The TS port reproduces it faithfully; it may be re-authored only if a scenario test proves
identical behavior (objective Open Question — default: keep as-is):

```sh
slot() {
  local _slot_cd_directive_file
  local _slot_status
  local _slot_destination

  _slot_cd_directive_file="$(mktemp "${TMPDIR:-/tmp}/slot-cd.XXXXXX")" || return 1
  SLOT_CD_DIRECTIVE_FILE="$_slot_cd_directive_file" command slot "$@"
  _slot_status=$?

  if [ $_slot_status -eq 0 ] && [ -s "$_slot_cd_directive_file" ]; then
    IFS= read -r _slot_destination < "$_slot_cd_directive_file"
    rm -f "$_slot_cd_directive_file"
    cd -- "$_slot_destination"
    return $?
  fi

  rm -f "$_slot_cd_directive_file"
  return $_slot_status
}
```

Behavioral invariants this encodes (must hold in any re-author): mktemp a directive file under
`$TMPDIR`/`/tmp`; export `SLOT_CD_DIRECTIVE_FILE`; run `command slot "$@"` (bypassing the function);
only `cd` when exit status is 0 **and** the file is non-empty; always clean up the temp file.

### Markers & rc mutation

- Markers (`shell.py:18-19`): begin `# >>> slot shell integration >>>`, end
  `# <<< slot shell integration <<<`. **Keep verbatim** — idempotency keys on the begin marker.
- `_marker_block` (`shell.py:62-63`): `\n{BEGIN}\n{wrapper}\n{END}\n`.
- Shell detect `_detect_shell` (`shell.py:22-27`): basename of `$SHELL`; if `zsh`/`bash` use it, else
  default `zsh`. Supported = `("zsh","bash")`.
- rc path (`shell.py:30-33`): `~/.zshrc` for zsh, else `~/.bashrc`.
- `unsupported_shell` error when an explicit `--shell` is not zsh/bash (`shell.py:36-37,99-103`).

### Operations

- `shell show` (`shell.py:89-104`): resolve shell, validate, return
  `ShellShowResult{shell, script: wrapper}`; human renderer echoes the script (`shell.py:85-86`).
- `shell install` (`shell.py:139-182`): resolve+validate shell; read existing rc text (or `""`); if
  the begin marker is already present → `ShellInstallResult{shell, rc_path, already_installed:true}`
  (no write); else `mkdir -p` the rc parent, prepend a leading `\n` if the existing file doesn't end
  in newline (`shell.py:171-174`), append the marker block, return `already_installed:false`.

---

## C. Completion (`cli/slot/completion.py` → `shell/completion.ts` + `operations/completion.ts`)

Same detect/rc/idempotency/newline machinery as the shell wrapper, but a different payload and
**different markers**:

- Activation line (`completion.py:29-30`): `eval "$(_SLOT_COMPLETE={shell}_source slot)"`. Keep the
  `_SLOT_COMPLETE` env-var name and `{shell}_source` form verbatim — this is Click/clinkr's completion
  protocol. (The TS port must emit a completion activation line that the TS clinkr framework actually
  honors; if clinkr's completion mechanism differs from Click's `_SLOT_COMPLETE`, resolve in this
  slice and record the divergence — this is the one place the byte contract may legitimately change
  because it is framework-coupled, not consumer-coupled.)
- Markers (`completion.py:17-18`): `# >>> slot completion >>>` / `# <<< slot completion <<<` —
  distinct from the shell-integration markers so both blocks coexist.
- `completion show` (`completion.py:63-77`): `CompletionShowResult{shell, script: activation_line}`.
- `completion install` (`completion.py:109-149`): identical install logic to `shell install` with the
  completion markers and activation line.

> Decision flag: the shell **wrapper** bytes are framework-agnostic and kept verbatim; the
> **completion activation line** is framework-coupled (`_SLOT_COMPLETE` is Click-specific). Confirm
> the TS clinkr completion contract during this slice and record whether the line is preserved or
> adapted. This is the single most likely intentional divergence in the port.

---

## D. Clipboard (`gateway/clipboard.py`, `real_clipboard.py` → `gateways/clipboard.ts`)

- Result union (`clipboard.py:14-35`): `ClipboardCopySuccess` | `ClipboardCopyFailure{reason, detail}`
  where `reason ∈ {"backend_missing","subprocess_error"}` (`clipboard.py:19`). Keep the reason tags.
- Real impl (`real_clipboard.py:24-44`): shell `pbcopy` with the text on stdin;
  `FileNotFoundError` → `backend_missing` (detail "`pbcopy` not found on PATH (clipboard requires
  macOS)."); non-zero exit → `subprocess_error` (detail "`pbcopy` exited with code N: <stderr>").
- TS: implement over an **injected process runner** so the fake returns scripted success/failure and
  the real adapter spawns `pbcopy`. Clipboard failure is non-fatal — the command still prints the
  `cd` command (`navigation.py:127-134`). The tri-state surfaces in JSON as
  `clipboard_copied`/`clipboard_skipped`/`clipboard_failure_reason`/`clipboard_failure_detail`
  (`navigation.py:24-34`).

---

## Test policy (elevated blast radius)

`slot shell install` / `slot completion install` mutate the developer's real `~/.zshrc` / `~/.bashrc`.
**Tests MUST redirect HOME / the rc path and the directive file to a tmp dir** (inject the rc-path
resolver and `env`/HOME). Never append to the operator's real rc file during validation. The runner
policy in `objective.md` makes this slice steer-first.

### Manual real-shell parity check (required, documented in the slice's Semantic Update)

In a throwaway HOME: `slot shell install --shell zsh`; `source` the rc; run `slot checkout <branch>`;
confirm the interactive shell actually `cd`s into the slot worktree; confirm `slot list --format json`
does **not** cd. Record the transcript in the Semantic Update.

## TS test checklist (port from `test_shell_integration.py` + shell/completion scenario files)

- cd-directive: inactive when env unset/empty; inactive when `enabled=false`; failed when parent dir
  missing; failed on write error; written returns path and file contains the bare destination;
  suppressed in machine mode.
- shell show: renders the exact wrapper for zsh and bash; `--shell` override; `unsupported_shell`.
- shell install: fresh install appends marker block; idempotent second call → `already_installed`;
  leading-newline normalization when rc lacks a trailing newline; creates rc parent dir; writes to
  the redirected rc path only.
- completion show/install: activation line content; distinct markers coexist with the shell block;
  idempotency; record any framework-driven divergence of the activation line.
- clipboard: success; `backend_missing`; `subprocess_error`; non-fatal (cd still printed);
  `--no-clipboard` → `clipboard_skipped`.
