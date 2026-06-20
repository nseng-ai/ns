# XDG Base Directory Specification

Reference for where user-facing programs should read and write files, and the
environment-variable norms around them. This is a distillation of the
[freedesktop.org XDG Base Directory Specification](https://specifications.freedesktop.org/basedir/latest/)
plus surrounding ecosystem conventions, written so an agent or contributor can
apply it without re-fetching the spec.

## Why it exists

The spec standardizes *where* programs put their files so they stop dumping
dotfiles directly into `$HOME`. Instead of `~/.myapp`, a compliant program uses
`~/.config/myapp`, `~/.local/share/myapp`, `~/.cache/myapp`, and so on. It
originated as a Linux/freedesktop convention and is now widely adopted by
cross-platform CLIs and toolkits.

## The variables

Two kinds of variable exist:

- **`*_HOME`** — a single base directory the program **writes** to.
- **`*_DIRS`** — colon-separated, preference-ordered search paths the program
  **reads** from (system-provided fallbacks). First entry is most important.

| Variable          | Default when unset/empty           | Purpose                                                       |
| ----------------- | ---------------------------------- | ------------------------------------------------------------- |
| `XDG_CONFIG_HOME` | `$HOME/.config`                    | User-specific **config** files                                |
| `XDG_DATA_HOME`   | `$HOME/.local/share`               | User-specific **data** files the app needs to keep            |
| `XDG_STATE_HOME`  | `$HOME/.local/state`               | **State**: logs, history, recently-used, persistent app state |
| `XDG_CACHE_HOME`  | `$HOME/.cache`                     | **Non-essential** cached data (safe to delete)                |
| `XDG_RUNTIME_DIR` | *(no default; set by the session)* | Runtime files: sockets, pipes, FIFOs; session-bound           |
| `XDG_CONFIG_DIRS` | `/etc/xdg`                         | System config search paths (read-only fallbacks)              |
| `XDG_DATA_DIRS`   | `/usr/local/share/:/usr/share/`    | System data search paths (read-only fallbacks)                |

There is **no `XDG_STATE_DIRS` and no `XDG_CACHE_DIRS`** — cache and state are
inherently per-user, so there is no system-wide search-path analogue.

## The config / data / state / cache decision

Choosing which of the four `*_HOME` directories a file belongs in is the part
that matters most in practice:

- **config** → user-editable settings; the things a user would hand-tune or
  version-control. Reproducible intent.
- **data** → files the app itself needs to function that are neither cache nor
  user-editable config (installed plugins, generated keys, app-owned databases).
- **state** → persists but is not portable and not precious: logs, command
  history, last-window-position, undo history. Loss is annoying, not fatal.
- **cache** → regenerable. Deleting it must only cost time, never data.

Rule of thumb — *would the user back it up?* config/data → yes; state → maybe;
cache → never.

## The hard rules (commonly gotten wrong)

1. **Absolute paths only.** If a variable holds a relative path, the
   implementation **must treat it as invalid and ignore it**, falling back to the
   default. Do not resolve it against `$HOME`.
2. **Empty means unset.** "Not set *or empty*" both mean "use the default."
   Always check both.
3. **`*_DIRS` are colon-separated and preference-ordered.** First entry wins.
   When reading, check the `*_HOME` directory first, then walk the `*_DIRS`
   entries left-to-right; the user directory always overrides system directories.
4. **Create-on-write with `0700`.** When writing and the target directory does
   not exist, create it with mode `0700`. If it already exists, **do not** change
   its permissions.
5. **Skip unreadable entries gracefully.** If a file in one search directory is
   inaccessible, skip it and continue — do not abort the whole lookup.

## `XDG_RUNTIME_DIR` is special

It has stricter requirements than the other variables:

- Owned by the user, mode **`0700`**, on a **local** filesystem, not shared.
- Created at login and removed at logout — lifetime is bound to the user session.
- For **small** IPC objects (sockets/pipes), not large files.
- Files may be **periodically cleaned up**; to survive, bump the access time at
  least every ~6 hours or set the sticky bit.
- Has **no fallback default.** If unset, warn and pick a replacement directory
  with the same ownership/permission properties (commonly a `0700` directory
  under `/tmp`).

## Environment-variable naming norms

The spec does not dictate per-app variable names, but the surrounding ecosystem
conventions are worth following:

- **App-specific overrides:** screaming snake case, app-name-prefixed —
  `MYAPP_CONFIG`, `MYAPP_CACHE_DIR`. Prefix everything to avoid collisions.
- **Precedence apps are expected to honor:** explicit CLI flag → app-specific env
  var → XDG variable → XDG default. Most-specific wins.
- **Respect ambient standards** rather than reinventing them: `NO_COLOR`,
  `PAGER`, `EDITOR`/`VISUAL`, `TERM`.
- Do not read `XDG_*` and *also* write a legacy `~/.myapp` dotfile — commit to
  the XDG layout. A common courtesy is to migrate an old `~/.myapp` into
  `~/.config/myapp` on first run.

## Implementation checklist

- Resolve each variable as: *unset-or-empty → default; relative → ignore →
  default; else use it.*
- Never hardcode `~/.config` — read `XDG_CONFIG_HOME` first.
- `mkdir -p` your subdirectory with `0700` lazily on write, not at startup.
- Nest under your app name: `$XDG_CONFIG_HOME/<app>/config.toml`, not loose files
  in the base directory.
- The spec's defaults are Linux-centric. On macOS/Windows, prefer a library that
  maps these onto OS-native equivalents (`platformdirs` in Python,
  `dirs`/`directories` in Rust) over rolling your own.

## Relevance to this repo

ASDL's design principle of **git-native storage** means durable domain state
lives in branch refs, branches, and GitHub issues/PRs — explicitly **not** in
hidden databases or ad-hoc state files. So the XDG `*_HOME` directories are not
the home for durable project state here.

Where XDG legitimately applies is transient, per-machine concerns: CLI caches,
local per-machine configuration for the TypeScript CLIs, or scratch state. For
those, prefer `XDG_CACHE_HOME` (regenerable) or `XDG_STATE_HOME` (local,
non-precious) over `XDG_DATA_HOME`, and keep that boundary explicit.

## Sources

- [XDG Base Directory Specification (canonical, freedesktop.org)](https://specifications.freedesktop.org/basedir/latest/)
- [XDG Base Directory — ArchWiki](https://wiki.archlinux.org/title/XDG_Base_Directory)
- [XDG/Base Directories — Gentoo Wiki](https://wiki.gentoo.org/wiki/XDG/Base_Directories)
