#!/usr/bin/env python3
"""Machine migration for the ji -> ns rename, one runnable step at a time.

Run MANUALLY on the owner machine AFTER the ns cutover has merged to master.
Idempotent and re-runnable: every step is guarded so a second run skips work
that is already done.

Usage:
  uv run --no-project python migrate.py --list                 # steps in order, with status
  uv run --no-project python migrate.py <step-name>            # run exactly one step
  uv run --no-project python migrate.py <step-name> --dry-run  # print that step's mutations
  uv run --no-project python migrate.py --all [--dry-run]      # full linear run (all steps)

Recommended careful workflow: `--list`, then for each pending step in order:
`<step> --dry-run`, review, `<step>`. Finish with `smoke` in a NEW terminal.

See README.md next to this script for prerequisites, the deferred
checkout-dir rename procedure, and rollback notes.

Ground truth this tool was written against (verified 2026-07-03, read-only):
  - install command surface: `ji shell install --yes --shell zsh`
    (kernel/src/cli/index.ts buildSdlShellGroup; post-rename: `ns shell install`)
  - old zshrc sentinel markers (kernel/src/cli/shell.ts:17-18):
      # >>> ji shell integration >>>
      # <<< ji shell integration <<<
  - XDG: only ~/.local/state/{ji,sdl} exist; no ~/.config/ji, ~/.local/share/ji,
    ~/.cache/ji. The 32 live slot worktrees are still under the LEGACY sdl
    state root (~/.local/state/sdl/slots/repos/sdl-tools/worktrees/slot-NN);
    ~/.local/state/ji/slots/repos/sdl-tools/worktrees exists but is empty.
  - refs: 4 refs under refs/ji/** (flow-land-backup{,-prev}); refs/sdl/** empty.
"""

import argparse
import datetime
import os
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

# ---------------------------------------------------------------------------
# globals / helpers
# ---------------------------------------------------------------------------

_home = os.environ.get("HOME")
if not _home:
    sys.exit("HOME must be set")
HOME_DIR = Path(_home)
LOCAL_BIN = HOME_DIR / ".local" / "bin"
STATE_ROOT = HOME_DIR / ".local" / "state"
ZSHRC = HOME_DIR / ".zshrc"

# Old sentinel markers — must match kernel/src/cli/shell.ts as of the ji era.
OLD_BEGIN = "# >>> ji shell integration >>>"
OLD_END = "# <<< ji shell integration <<<"
NEW_BEGIN = "# >>> ns shell integration >>>"

OLD_SLOTS_SDL = STATE_ROOT / "sdl" / "slots"
OLD_SLOTS_JI = STATE_ROOT / "ji" / "slots"
NEW_SLOTS = STATE_ROOT / "ns" / "slots"
OLD_STATE_JI = STATE_ROOT / "ji"
NEW_STATE_NS = STATE_ROOT / "ns"

DRY_RUN = False
REPO_ROOT = Path(".")  # resolved in main()

SCRIPT_DIR = Path(__file__).resolve().parent


def say(msg: str = "") -> None:
    print(msg, flush=True)


def note(msg: str) -> None:
    print(f"  {msg}", flush=True)


def die(msg: str) -> None:
    sys.stdout.flush()
    print(f"ABORT: {msg}", file=sys.stderr, flush=True)
    sys.exit(1)


def run_cmd(argv: list) -> None:
    """Every external-command mutation goes through here. Dry-run only prints."""
    words = [str(a) for a in argv]
    display = shlex.join(words)
    if DRY_RUN:
        say(f"[dry-run] {display}")
        return
    say(f"[run] {display}")
    proc = subprocess.run(words)
    if proc.returncode != 0:
        die(f"command failed with exit {proc.returncode}: {display}")


def run_op(description: str, fn) -> None:
    """Every pure-file mutation goes through here. Dry-run only prints."""
    if DRY_RUN:
        say(f"[dry-run] {description}")
        return
    say(f"[run] {description}")
    fn()


def git_out(args: list, check: bool = True) -> str:
    proc = subprocess.run(
        ["git", "-C", str(REPO_ROOT), *[str(a) for a in args]],
        capture_output=True,
        text=True,
    )
    if check and proc.returncode != 0:
        die(f"git {' '.join(str(a) for a in args)} failed: {proc.stderr.strip()}")
    return proc.stdout


def git_rev_parse_quiet(ref: str) -> str:
    proc = subprocess.run(
        ["git", "-C", str(REPO_ROOT), "rev-parse", "--verify", "--quiet", ref],
        capture_output=True,
        text=True,
    )
    return proc.stdout.strip() if proc.returncode == 0 else ""


def resolve_repo_root() -> Path:
    # Repo root: resolve from this script's location (works pre- and post- any
    # future checkout-dir rename), then sanity-check with git.
    proc = subprocess.run(
        ["git", "-C", str(SCRIPT_DIR), "rev-parse", "--show-toplevel"],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0 or not proc.stdout.strip():
        die(f"could not resolve repo root from {SCRIPT_DIR}")
    return Path(proc.stdout.strip())


# ---------------------------------------------------------------------------
# gate — read-only rename-landed assertions, run before every mutating step
# ---------------------------------------------------------------------------


def gate() -> None:
    """On master with the rename landed. In dry-run before the rename these
    checks still gate honestly (the tool refuses to pretend)."""
    current_branch = git_out(["branch", "--show-current"]).strip()
    if current_branch != "master":
        die(f"must run on master (currently on '{current_branch or 'detached HEAD'}')")
    if not (REPO_ROOT / ".ns").is_dir():
        die(
            f"rename has not landed: {REPO_ROOT}/.ns does not exist. "
            "Do NOT run this before the ns cutover merges."
        )
    if (REPO_ROOT / ".ji").is_dir():
        die(f"rename incomplete: {REPO_ROOT}/.ji still exists alongside .ns")
    shell_ts = REPO_ROOT / "ts" / "packages" / "kernel" / "src" / "cli" / "shell.ts"
    if not shell_ts.is_file() or "ns shell integration" not in shell_ts.read_text():
        die("rename incomplete: shell.ts does not carry the 'ns shell integration' markers yet")
    justfile = REPO_ROOT / "justfile"
    if not justfile.is_file() or not any(
        line.startswith("install-tools") for line in justfile.read_text().splitlines()
    ):
        die("justfile has no install-tools recipe; refusing to continue")


# ---------------------------------------------------------------------------
# step: preflight — clean tree + pull (gate() covers the rename-landed checks)
# ---------------------------------------------------------------------------


def step_preflight() -> None:
    if git_out(["status", "--porcelain"]).strip():
        subprocess.run(["git", "-C", str(REPO_ROOT), "status", "--short"])
        die("working tree is not clean; commit/stash/clean first")

    run_cmd(["git", "-C", REPO_ROOT, "pull", "--ff-only"])

    say("preflight OK: on master, clean, .ns present, .ji gone, ns markers in shell.ts")


# ---------------------------------------------------------------------------
# step: install — fresh install + stale shim removal
# ---------------------------------------------------------------------------


def step_install() -> None:
    # Mandatory full regeneration: an incremental pnpm install can leave
    # ts/node_modules/.bin/ji alive.
    node_modules = REPO_ROOT / "ts" / "node_modules"
    run_op(f"rm -rf {node_modules}", lambda: shutil.rmtree(node_modules, ignore_errors=True))
    run_cmd(["corepack", "pnpm", "--dir", REPO_ROOT / "ts", "install"])

    # just runs from the repo root so justfile_directory() (the canonical
    # checkout baked into every shim) is the main checkout — the previously
    # installed shims were baked to a slot-worktree path, which the
    # slot-worktrees step moves.
    run_cmd(["just", "--justfile", REPO_ROOT / "justfile", "install-tools"])

    if not DRY_RUN:
        ns_shim = LOCAL_BIN / "ns"
        if not (ns_shim.exists() and os.access(ns_shim, os.X_OK)):
            die(f"just install-tools did not produce {ns_shim}")
        if (REPO_ROOT / "ts" / "node_modules" / ".bin" / "ji").exists():
            die("ts/node_modules/.bin/ji still exists after fresh install")
        if not (REPO_ROOT / "ts" / "node_modules" / ".bin" / "ns").exists():
            die("ts/node_modules/.bin/ns missing after fresh install")

    for stale in ("ji", "sdl"):
        shim = LOCAL_BIN / stale
        if shim.exists():
            say(f"removing stale shim: {shim}")
            run_op(f"rm -f {shim}", lambda s=shim: s.unlink(missing_ok=True))
        else:
            note(f"no stale shim at {shim} (already gone)")


# ---------------------------------------------------------------------------
# step: zshrc — shell integration
# ---------------------------------------------------------------------------


def step_zshrc() -> None:
    if not ZSHRC.is_file():
        die(f"{ZSHRC} does not exist")

    lines = ZSHRC.read_text().splitlines(keepends=True)
    begin_count = sum(1 for line in lines if OLD_BEGIN in line)
    end_count = sum(1 for line in lines if OLD_END in line)

    if begin_count == 0 and end_count == 0:
        note(f"no old '{OLD_BEGIN}' block in {ZSHRC} (already migrated?)")
    elif begin_count == 1 and end_count == 1:
        stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
        backup = ZSHRC.parent / f"{ZSHRC.name}.pre-ns-migration.{stamp}"
        say(f"backing up {ZSHRC} -> {backup}")
        run_op(f"cp -p {ZSHRC} {backup}", lambda: shutil.copy2(ZSHRC, backup))
        say(f"deleting old ji sentinel block from {ZSHRC}")
        if DRY_RUN:
            say(f"[dry-run] delete lines between '{OLD_BEGIN}' and '{OLD_END}' in {ZSHRC}")
        else:
            # Write-temp -> verify-marker-gone -> replace; markers anchored as
            # exact lines, matching the old sed range delete.
            kept: list = []
            skipping = False
            for line in lines:
                bare = line.rstrip("\n")
                if not skipping and bare == OLD_BEGIN:
                    skipping = True
                    continue
                if skipping:
                    if bare == OLD_END:
                        skipping = False
                    continue
                kept.append(line)
            fd, tmp_name = tempfile.mkstemp(
                prefix="zshrc-ns-migrate.", dir=os.environ.get("TMPDIR", "/tmp")
            )
            with os.fdopen(fd, "w") as tmp_rc:
                tmp_rc.write("".join(kept))
            if OLD_BEGIN in Path(tmp_name).read_text():
                os.unlink(tmp_name)
                die("sentinel block deletion failed (marker still present)")
            os.replace(tmp_name, ZSHRC)
    else:
        die(
            f"expected exactly one old sentinel block in {ZSHRC} "
            f"(found begin={begin_count} end={end_count}); fix by hand"
        )

    # Install the ns block. --yes is required non-interactively; --shell zsh
    # pins the shell explicitly.
    if NEW_BEGIN in ZSHRC.read_text():
        note(f"ns shell integration already installed in {ZSHRC}")
    else:
        run_cmd([LOCAL_BIN / "ns", "shell", "install", "--yes", "--shell", "zsh"])
        if not DRY_RUN:
            if NEW_BEGIN not in ZSHRC.read_text():
                die(f"ns shell install ran but '{NEW_BEGIN}' not found in {ZSHRC}")

    # Report (never auto-edit) any remaining JI_* env usage outside the block.
    say("scanning rc files for leftover JI_* references (manual rename only):")
    leftovers = False
    pattern = re.compile(r"JI_[A-Z]")
    for rc in (ZSHRC, HOME_DIR / ".zprofile", HOME_DIR / ".zshenv"):
        if not rc.is_file():
            continue
        for lineno, line in enumerate(rc.read_text().splitlines(), start=1):
            if pattern.search(line):
                say(f"{lineno}:{line}")
                leftovers = True
    if leftovers:
        say("  ^ rename these to NS_* by hand (this tool does not edit env lines)")
    else:
        note("none found")


# ---------------------------------------------------------------------------
# step: xdg-roots — plain-mv XDG roots (none existed at authoring time)
# ---------------------------------------------------------------------------


def step_xdg_roots() -> None:
    for src, dst in (
        (HOME_DIR / ".config" / "ji", HOME_DIR / ".config" / "ns"),
        (HOME_DIR / ".local" / "share" / "ji", HOME_DIR / ".local" / "share" / "ns"),
        (HOME_DIR / ".cache" / "ji", HOME_DIR / ".cache" / "ns"),
    ):
        if src.is_dir():
            if dst.exists():
                die(f"both {src} and {dst} exist; merge by hand first")
            run_op(f"mv {src} {dst}", lambda s=src, d=dst: shutil.move(str(s), str(d)))
        else:
            note(f"no {src} (nothing to move)")


# ---------------------------------------------------------------------------
# step: slot-worktrees — git worktree move ONLY, never raw mv
# ---------------------------------------------------------------------------


def list_worktrees() -> list:
    """Parse `git worktree list --porcelain` into (path, locked) rows."""
    rows = []
    for block in git_out(["worktree", "list", "--porcelain"]).split("\n\n"):
        path = ""
        locked = False
        for line in block.splitlines():
            if line.startswith("worktree "):
                path = line[len("worktree "):]
            if line == "locked" or line.startswith("locked "):
                locked = True
        if path:
            rows.append((Path(path), locked))
    return rows


def worktrees_under_legacy_roots() -> list:
    """(path, locked, legacy_root) for every registered worktree under either
    legacy slots root."""
    rows = []
    for path, locked in list_worktrees():
        for root in (OLD_SLOTS_SDL, OLD_SLOTS_JI):
            if path != root and path.is_relative_to(root):
                rows.append((path, locked, root))
                break
    return rows


def step_slot_worktrees() -> None:
    # Reality check (2026-07-03): the live slot worktrees never moved off the
    # sdl-era path. They live under ~/.local/state/sdl/slots/..., while
    # ~/.local/state/ji/slots/... is an empty skeleton. We therefore enumerate
    # registered worktrees and relocate ANY under either legacy slots root
    # (sdl or ji) to the ns sibling, preserving the repos/<repo>/worktrees/slot-NN
    # tail (repo dir name stays 'sdl-tools': checkout-dir rename is deferred).
    say(f"relocating slot worktrees under {OLD_SLOTS_SDL} and {OLD_SLOTS_JI} -> {NEW_SLOTS}")

    moved_any = False
    for wt_path, wt_locked, legacy_root in worktrees_under_legacy_roots():
        dest = NEW_SLOTS / wt_path.relative_to(legacy_root)

        if not wt_path.is_dir():
            note(f"SKIP {wt_path}: directory missing (consider 'git worktree prune')")
            continue
        if dest.exists():
            note(f"SKIP {wt_path}: destination {dest} already exists — resolve by hand")
            continue
        if wt_locked:
            note(f"SKIP {wt_path}: worktree is locked — unlock ('git worktree unlock') and re-run")
            continue
        run_op(f"mkdir -p {dest.parent}", lambda d=dest.parent: d.mkdir(parents=True, exist_ok=True))
        run_cmd(["git", "-C", REPO_ROOT, "worktree", "move", wt_path, dest])
        moved_any = True

    if not DRY_RUN:
        say("post-move worktree verification:")
        subprocess.run(["git", "-C", str(REPO_ROOT), "worktree", "list"])
        if worktrees_under_legacy_roots():
            die("worktrees still registered under a legacy slots root after moves")
    elif moved_any:
        note("(dry-run) would verify no worktrees remain under legacy slots roots")


# ---------------------------------------------------------------------------
# step: state-dirs — non-slot state subdirs of ~/.local/state/ji -> ns
# ---------------------------------------------------------------------------


def non_slots_state_children() -> list:
    """Non-hidden children of ~/.local/state/ji other than slots/ (slots is
    handled via git worktree move). All are cheap to carry: enriched-plan
    (durable saved plans), submit-failure-logs and pi-cli-command-extension
    (diagnostics)."""
    if not OLD_STATE_JI.is_dir():
        return []
    return sorted(
        child
        for child in OLD_STATE_JI.iterdir()
        if not child.name.startswith(".") and child.name != "slots"
    )


def step_state_dirs() -> None:
    if not OLD_STATE_JI.is_dir():
        note(f"no {OLD_STATE_JI} (already migrated?)")
        return
    run_op(f"mkdir -p {NEW_STATE_NS}", lambda: NEW_STATE_NS.mkdir(parents=True, exist_ok=True))
    for child in non_slots_state_children():
        dest = NEW_STATE_NS / child.name
        if dest.exists():
            note(f"SKIP {child}: {dest} already exists — merge by hand")
            continue
        run_op(f"mv {child} {dest}", lambda c=child, d=dest: shutil.move(str(c), str(d)))


# ---------------------------------------------------------------------------
# step: cleanup — rmdir emptied legacy skeletons; report leftover sdl data
# ---------------------------------------------------------------------------


def skeleton_dirs() -> list:
    return [
        OLD_SLOTS_JI / "repos" / "sdl-tools" / "worktrees",
        OLD_SLOTS_JI / "repos" / "sdl-tools",
        OLD_SLOTS_JI / "repos",
        OLD_SLOTS_JI,
        OLD_STATE_JI,
        OLD_SLOTS_SDL / "repos" / "sdl-tools" / "worktrees",
        OLD_SLOTS_SDL / "repos" / "sdl-tools",
        OLD_SLOTS_SDL / "repos",
        OLD_SLOTS_SDL,
    ]


def step_cleanup() -> None:
    # Remove now-empty legacy skeletons (rmdir only — refuses non-empty).
    for skel in skeleton_dirs():
        if not skel.is_dir():
            continue
        entries = sorted(child.name for child in skel.iterdir())
        # Finder litter must not block cleanup (a .DS_Store exists in the sdl
        # worktrees dir today).
        if entries == [".DS_Store"]:
            ds_store = skel / ".DS_Store"
            run_op(f"rm -f {ds_store}", lambda p=ds_store: p.unlink(missing_ok=True))
            entries = sorted(child.name for child in skel.iterdir())
        if not entries or (DRY_RUN and entries == [".DS_Store"]):
            run_op(f"rmdir {skel}", lambda s=skel: s.rmdir())
        else:
            note(f"leaving non-empty {skel} in place")

    # Legacy sdl-era state that predates the sdl->ji migration: report only.
    sdl_root = STATE_ROOT / "sdl"
    if sdl_root.is_dir():
        say(f"NOTE: legacy {sdl_root} still holds pre-ji data:")
        for name in sorted(child.name for child in sdl_root.iterdir()):
            say(f"    {name}")
        say("  Not auto-merged (ns siblings may already have same-named content,")
        say("  e.g. enriched-plan/gh--nseng-ai--sdl-tools exists in both eras).")
        say("  Merge or retire by hand when convenient.")


# ---------------------------------------------------------------------------
# step: refs — refs/ji/** -> refs/ns/**
# ---------------------------------------------------------------------------


def ji_refs() -> list:
    out = git_out(["for-each-ref", "refs/ji/**", "--format=%(refname) %(objectname)"], check=False)
    return [tuple(line.split(" ", 1)) for line in out.splitlines() if line.strip()]


def print_refs(pattern: str) -> None:
    out = git_out(["for-each-ref", pattern, "--format=  %(refname) %(objectname)"], check=False)
    for line in out.splitlines():
        say(line)


def step_refs() -> None:
    say("refs/ji/** before:")
    print_refs("refs/ji/**")

    refs = ji_refs()
    if not refs:
        note("no refs under refs/ji/** (already migrated?)")
    else:
        # Copy first, verify, delete after: update-ref -d is not reflog-recoverable
        # for these unreflogged refs, so the copy must be proven before deletion.
        for refname, sha in refs:
            suffix = refname[len("refs/ji/"):]
            target = f"refs/ns/{suffix}"
            existing = git_rev_parse_quiet(target)
            if existing:
                if existing == sha:
                    note(f"{target} already exists at same sha; deleting old {refname}")
                else:
                    note(f"SKIP {refname}: {target} exists at DIFFERENT sha ({existing}) — resolve by hand")
                    continue
            else:
                run_cmd(["git", "-C", REPO_ROOT, "update-ref", target, sha])
            if not DRY_RUN:
                if git_rev_parse_quiet(target) != sha:
                    die(f"copy verification failed for {target}")
            # old-value guard: delete only if the old ref still points at sha.
            run_cmd(["git", "-C", REPO_ROOT, "update-ref", "-d", refname, sha])

    say("refs/ns/** after:")
    print_refs("refs/ns/**")
    say("refs/ji/** remaining:")
    print_refs("refs/ji/**")


# ---------------------------------------------------------------------------
# step: smoke — manual checklist (no mutations, NEW shell required)
# ---------------------------------------------------------------------------


def step_smoke() -> None:
    say("Open a NEW terminal (so the ns() wrapper from .zshrc loads), then:")
    say("  1. ns --help                                   # CLI resolves and renders")
    say("  2. ns objective list --minimal --format md     # repo state readable")
    say("  3. ns slot cd <some-slot>  &&  pwd             # cd-directive round-trip")
    say(f"     (pwd should land under {NEW_SLOTS}/repos/sdl-tools/worktrees/;")
    say("      then 'cd -' back; this exercises NS_CD_DIRECTIVE_FILE end-to-end)")
    say(f"  4. git -C {REPO_ROOT} worktree list             # all slots under .../state/ns/")


# ---------------------------------------------------------------------------
# status probes — read-only, drive --list
# ---------------------------------------------------------------------------


def status_preflight() -> tuple:
    return "check", None  # re-runnable check, no done state


def status_install() -> tuple:
    done = (
        (LOCAL_BIN / "ns").exists()
        and not (LOCAL_BIN / "ji").exists()
        and not (LOCAL_BIN / "sdl").exists()
        and (REPO_ROOT / "ts" / "node_modules" / ".bin" / "ns").exists()
        and not (REPO_ROOT / "ts" / "node_modules" / ".bin" / "ji").exists()
    )
    return ("done" if done else "pending"), None


def status_zshrc() -> tuple:
    if not ZSHRC.is_file():
        return "pending", None
    content = ZSHRC.read_text()
    done = OLD_BEGIN not in content and NEW_BEGIN in content
    return ("done" if done else "pending"), None


def status_xdg_roots() -> tuple:
    done = not any(
        (HOME_DIR / rel).exists()
        for rel in (Path(".config/ji"), Path(".local/share/ji"), Path(".cache/ji"))
    )
    return ("done" if done else "pending"), None


def status_slot_worktrees() -> tuple:
    done = not worktrees_under_legacy_roots()
    return ("done" if done else "pending"), None


def status_state_dirs() -> tuple:
    done = not OLD_STATE_JI.is_dir() or not non_slots_state_children()
    return ("done" if done else "pending"), None


def status_cleanup() -> tuple:
    done = not OLD_STATE_JI.exists() and not OLD_SLOTS_SDL.exists()
    extra = None
    sdl_root = STATE_ROOT / "sdl"
    if sdl_root.is_dir() and any(sdl_root.iterdir()):
        extra = f"{sdl_root} still holds pre-ji data (manual merge/retire)"
    return ("done" if done else "pending"), extra


def status_refs() -> tuple:
    done = not ji_refs()
    return ("done" if done else "pending"), None


def status_smoke() -> tuple:
    return "manual", None


# ---------------------------------------------------------------------------
# step registry / CLI
# ---------------------------------------------------------------------------

STEPS = [
    ("preflight", "master + clean-tree checks, pull, rename-landed assertions", step_preflight, status_preflight),
    ("install", "fresh pnpm install + install-tools, remove stale ji/sdl shims", step_install, status_install),
    ("zshrc", "swap the ji shell-integration block for ns in ~/.zshrc", step_zshrc, status_zshrc),
    ("xdg-roots", "mv ~/.config|.local/share|.cache ji dirs to ns siblings", step_xdg_roots, status_xdg_roots),
    ("slot-worktrees", "git worktree move slot worktrees to ~/.local/state/ns/slots", step_slot_worktrees, status_slot_worktrees),
    ("state-dirs", "mv non-slots ~/.local/state/ji children to ~/.local/state/ns", step_state_dirs, status_state_dirs),
    ("cleanup", "rmdir emptied legacy skeletons; report leftover sdl-era state", step_cleanup, status_cleanup),
    ("refs", "copy-verify-delete refs/ji/** to refs/ns/**", step_refs, status_refs),
    ("smoke", "print the manual new-shell smoke checklist", step_smoke, status_smoke),
]

STEP_NAMES = [name for name, _desc, _run, _status in STEPS]


def cmd_list() -> None:
    for name, desc, _run_fn, status_fn in STEPS:
        status, extra = status_fn()
        say(f"{f'[{status}]':<10} {name:<15} {desc}")
        if extra:
            note(extra)


def run_one(index: int, name: str, run_fn) -> None:
    say(f"-- step {index}/{len(STEPS)}: {name} --")
    if name != "smoke":
        gate()
    run_fn()
    say("")


def main() -> None:
    global DRY_RUN, REPO_ROOT

    epilog = "steps (in order):\n" + "\n".join(
        f"  {name:<15} {desc}" for name, desc, _run, _status in STEPS
    ) + (
        "\n\nrecommended careful workflow: --list, then for each pending step in order:\n"
        "'<step> --dry-run', review, '<step>'; finish with 'smoke' in a NEW terminal."
    )
    parser = argparse.ArgumentParser(
        prog="migrate.py",
        description="Machine migration for the ji -> ns rename, one runnable step at a time.",
        epilog=epilog,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "step",
        nargs="?",
        choices=STEP_NAMES,
        metavar="step-name",
        help="run exactly one step (see the ordered list below)",
    )
    parser.add_argument("--list", action="store_true", help="print steps in order with status (read-only)")
    parser.add_argument("--all", action="store_true", help="run all steps in order (original one-shot behavior)")
    parser.add_argument("--dry-run", action="store_true", help="print every mutating action without executing")
    args = parser.parse_args()

    modes = sum([bool(args.list), bool(args.all), bool(args.step)])
    if modes == 0:
        parser.error("specify a step name, --list, or --all")
    if modes > 1:
        parser.error("choose exactly one of: a step name, --list, --all")

    REPO_ROOT = resolve_repo_root()

    if args.list:
        cmd_list()
        return

    DRY_RUN = args.dry_run

    say("== ji -> ns machine migration ==")
    say(f"repo root: {REPO_ROOT}")
    if DRY_RUN:
        say("(dry-run: no mutations will be performed)")
    say("")

    if args.all:
        for index, (name, _desc, run_fn, _status_fn) in enumerate(STEPS, start=1):
            run_one(index, name, run_fn)
        if DRY_RUN:
            say("== migration dry-run complete (no mutations performed) ==")
        else:
            say("== migration complete ==")
    else:
        index = STEP_NAMES.index(args.step) + 1
        _name, _desc, run_fn, _status_fn = STEPS[index - 1]
        run_one(index, args.step, run_fn)
        if DRY_RUN:
            say(f"== step '{args.step}' dry-run complete (no mutations performed) ==")
        else:
            say(f"== step '{args.step}' complete ==")


if __name__ == "__main__":
    main()
