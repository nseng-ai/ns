#!/usr/bin/env bash
# machine migration for the ji -> ns rename.
#
# Run MANUALLY, ONCE, on the owner machine AFTER the ns cutover (PR-4/PR-5)
# has merged to master. Idempotent and re-runnable: every step is guarded so
# a second run skips work that is already done.
#
# Usage:
#   ./migrate.sh            # execute the migration
#   ./migrate.sh --dry-run  # print every mutating action without executing
#
# See README.md next to this script for prerequisites, the deferred
# checkout-dir rename procedure, and rollback notes.
#
# Ground truth this script was written against (verified 2026-07-03, read-only):
#   - install command surface: `ji shell install --yes --shell zsh`
#     (kernel/src/cli/index.ts buildSdlShellGroup; post-rename: `ns shell install`)
#   - old zshrc sentinel markers (kernel/src/cli/shell.ts:17-18):
#       # >>> ji shell integration >>>
#       # <<< ji shell integration <<<
#   - XDG: only ~/.local/state/{ji,sdl} exist; no ~/.config/ji, ~/.local/share/ji,
#     ~/.cache/ji. The 32 live slot worktrees are still under the LEGACY sdl
#     state root (~/.local/state/sdl/slots/repos/sdl-tools/worktrees/slot-NN);
#     ~/.local/state/ji/slots/repos/sdl-tools/worktrees exists but is empty.
#   - refs: 4 refs under refs/ji/** (flow-land-backup{,-prev}); refs/sdl/** empty.

set -euo pipefail

# ---------------------------------------------------------------------------
# args / helpers
# ---------------------------------------------------------------------------

DRY_RUN=0
for arg in "$@"; do
	case "$arg" in
		--dry-run) DRY_RUN=1 ;;
		-h | --help)
			sed -n '2,14p' "$0"
			exit 0
			;;
		*)
			echo "error: unknown argument: $arg (only --dry-run is supported)" >&2
			exit 2
			;;
	esac
done

say() { printf '%s\n' "$*"; }
note() { printf '  %s\n' "$*"; }
die() {
	printf 'ABORT: %s\n' "$*" >&2
	exit 1
}

# Every mutation goes through run(). In --dry-run mode it only prints.
run() {
	if [ "$DRY_RUN" -eq 1 ]; then
		printf '[dry-run] %s\n' "$*"
	else
		printf '[run] %s\n' "$*"
		"$@"
	fi
}

HOME_DIR="${HOME:?HOME must be set}"
LOCAL_BIN="$HOME_DIR/.local/bin"
STATE_ROOT="$HOME_DIR/.local/state"
ZSHRC="$HOME_DIR/.zshrc"

# Old sentinel markers — must match kernel/src/cli/shell.ts as of the ji era.
OLD_BEGIN='# >>> ji shell integration >>>'
OLD_END='# <<< ji shell integration <<<'
NEW_BEGIN='# >>> ns shell integration >>>'

# Repo root: resolve from this script's location (works pre- and post- any
# future checkout-dir rename), then sanity-check with git.
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null) ||
	die "could not resolve repo root from $SCRIPT_DIR"

say "== ji -> ns machine migration =="
say "repo root: $REPO_ROOT"
[ "$DRY_RUN" -eq 1 ] && say "(dry-run: no mutations will be performed)"
say ""

# ---------------------------------------------------------------------------
# step 1 — preflight
# ---------------------------------------------------------------------------

say "-- step 1: preflight --"

current_branch=$(git -C "$REPO_ROOT" branch --show-current)
[ "$current_branch" = "master" ] ||
	die "must run on master (currently on '${current_branch:-detached HEAD}')"

if [ -n "$(git -C "$REPO_ROOT" status --porcelain)" ]; then
	git -C "$REPO_ROOT" status --short
	die "working tree is not clean; commit/stash/clean first"
fi

run git -C "$REPO_ROOT" pull --ff-only

# Verify the rename actually landed. In dry-run before the rename these
# checks still gate honestly (the script refuses to pretend).
[ -d "$REPO_ROOT/.ns" ] ||
	die "rename has not landed: $REPO_ROOT/.ns does not exist. Do NOT run this before the ns cutover merges."
[ ! -d "$REPO_ROOT/.ji" ] ||
	die "rename incomplete: $REPO_ROOT/.ji still exists alongside .ns"
grep -q "ns shell integration" "$REPO_ROOT/ts/packages/kernel/src/cli/shell.ts" ||
	die "rename incomplete: shell.ts does not carry the 'ns shell integration' markers yet"
grep -q '^install-tools' "$REPO_ROOT/justfile" ||
	die "justfile has no install-tools recipe; refusing to continue"

say "preflight OK: on master, clean, .ns present, .ji gone, ns markers in shell.ts"
say ""

# ---------------------------------------------------------------------------
# step 2 — fresh install + stale shim removal
# ---------------------------------------------------------------------------

say "-- step 2: fresh install --"

# Mandatory full regeneration: an incremental pnpm install can leave
# ts/node_modules/.bin/ji alive.
run rm -rf "$REPO_ROOT/ts/node_modules"
run corepack pnpm --dir "$REPO_ROOT/ts" install

# just runs from the repo root so justfile_directory() (the canonical
# checkout baked into every shim) is the main checkout — the previously
# installed shims were baked to a slot-worktree path, which step 4 moves.
run just --justfile "$REPO_ROOT/justfile" install-tools

if [ "$DRY_RUN" -eq 0 ]; then
	[ -x "$LOCAL_BIN/ns" ] || die "just install-tools did not produce $LOCAL_BIN/ns"
	[ ! -e "$REPO_ROOT/ts/node_modules/.bin/ji" ] ||
		die "ts/node_modules/.bin/ji still exists after fresh install"
	[ -e "$REPO_ROOT/ts/node_modules/.bin/ns" ] ||
		die "ts/node_modules/.bin/ns missing after fresh install"
fi

for stale in ji sdl; do
	if [ -e "$LOCAL_BIN/$stale" ]; then
		say "removing stale shim: $LOCAL_BIN/$stale"
		run rm -f "$LOCAL_BIN/$stale"
	else
		note "no stale shim at $LOCAL_BIN/$stale (already gone)"
	fi
done
say ""

# ---------------------------------------------------------------------------
# step 3 — zshrc shell integration
# ---------------------------------------------------------------------------

say "-- step 3: zshrc shell integration --"

[ -f "$ZSHRC" ] || die "$ZSHRC does not exist"

begin_count=$(grep -cF "$OLD_BEGIN" "$ZSHRC" || true)
end_count=$(grep -cF "$OLD_END" "$ZSHRC" || true)

if [ "$begin_count" -eq 0 ] && [ "$end_count" -eq 0 ]; then
	note "no old '$OLD_BEGIN' block in $ZSHRC (already migrated?)"
elif [ "$begin_count" -eq 1 ] && [ "$end_count" -eq 1 ]; then
	backup="$ZSHRC.pre-ns-migration.$(date +%Y%m%d-%H%M%S)"
	say "backing up $ZSHRC -> $backup"
	run cp -p "$ZSHRC" "$backup"
	say "deleting old ji sentinel block from $ZSHRC"
	if [ "$DRY_RUN" -eq 1 ]; then
		printf '[dry-run] sed delete lines between %s and %s in %s\n' \
			"'$OLD_BEGIN'" "'$OLD_END'" "$ZSHRC"
	else
		tmp_rc=$(mktemp "${TMPDIR:-/tmp}/zshrc-ns-migrate.XXXXXX")
		# Markers contain no BRE-special characters; anchor them exactly.
		sed "/^$OLD_BEGIN\$/,/^$OLD_END\$/d" "$ZSHRC" >"$tmp_rc"
		if grep -qF "$OLD_BEGIN" "$tmp_rc"; then
			rm -f "$tmp_rc"
			die "sentinel block deletion failed (marker still present)"
		fi
		mv "$tmp_rc" "$ZSHRC"
	fi
else
	die "expected exactly one old sentinel block in $ZSHRC (found begin=$begin_count end=$end_count); fix by hand"
fi

# Install the ns block. --yes is required non-interactively; -s zsh pins the
# shell explicitly. (Surface verified: `<tool> shell install [-s|--shell] [-y|--yes]`.)
if grep -qF "$NEW_BEGIN" "$ZSHRC"; then
	note "ns shell integration already installed in $ZSHRC"
else
	run "$LOCAL_BIN/ns" shell install --yes --shell zsh
	if [ "$DRY_RUN" -eq 0 ]; then
		grep -qF "$NEW_BEGIN" "$ZSHRC" ||
			die "ns shell install ran but '$NEW_BEGIN' not found in $ZSHRC"
	fi
fi

# Report (never auto-edit) any remaining JI_* env usage outside the block.
say "scanning rc files for leftover JI_* references (manual rename only):"
leftovers=0
for rc in "$ZSHRC" "$HOME_DIR/.zprofile" "$HOME_DIR/.zshenv"; do
	[ -f "$rc" ] || continue
	if grep -n 'JI_[A-Z]' "$rc"; then
		leftovers=1
	fi
done
if [ "$leftovers" -eq 1 ]; then
	say "  ^ rename these to NS_* by hand (this script does not edit env lines)"
else
	note "none found"
fi
say ""

# ---------------------------------------------------------------------------
# step 4 — XDG directories
# ---------------------------------------------------------------------------

say "-- step 4: XDG directories --"

# 4a. plain-mv XDG roots (none existed at authoring time; guarded anyway).
for pair in \
	"$HOME_DIR/.config/ji:$HOME_DIR/.config/ns" \
	"$HOME_DIR/.local/share/ji:$HOME_DIR/.local/share/ns" \
	"$HOME_DIR/.cache/ji:$HOME_DIR/.cache/ns"; do
	src=${pair%%:*}
	dst=${pair##*:}
	if [ -d "$src" ]; then
		[ -e "$dst" ] && die "both $src and $dst exist; merge by hand first"
		run mv "$src" "$dst"
	else
		note "no $src (nothing to move)"
	fi
done

# 4b. slot worktrees — git worktree move ONLY, never raw mv.
#
# Reality check (2026-07-03): the live slot worktrees never moved off the
# sdl-era path. They live under ~/.local/state/sdl/slots/..., while
# ~/.local/state/ji/slots/... is an empty skeleton. We therefore enumerate
# registered worktrees and relocate ANY under either legacy slots root
# (sdl or ji) to the ns sibling, preserving the repos/<repo>/worktrees/slot-NN
# tail (repo dir name stays 'sdl-tools': checkout-dir rename is deferred).
OLD_SLOTS_SDL="$STATE_ROOT/sdl/slots"
OLD_SLOTS_JI="$STATE_ROOT/ji/slots"
NEW_SLOTS="$STATE_ROOT/ns/slots"

say "relocating slot worktrees under $OLD_SLOTS_SDL and $OLD_SLOTS_JI -> $NEW_SLOTS"

# Parse `worktree list --porcelain` into "path<TAB>locked?" lines (bash-3.2
# safe: no mapfile). Blocks are separated by blank lines.
worktree_rows=$(
	git -C "$REPO_ROOT" worktree list --porcelain |
		awk -v RS='' '{
			path = ""; locked = "no"
			n = split($0, lines, "\n")
			for (i = 1; i <= n; i++) {
				if (index(lines[i], "worktree ") == 1) path = substr(lines[i], 10)
				if (lines[i] == "locked" || index(lines[i], "locked ") == 1) locked = "yes"
			}
			if (path != "") printf "%s\t%s\n", path, locked
		}'
)

moved_any=0
while IFS="$(printf '\t')" read -r wt_path wt_locked; do
	[ -n "$wt_path" ] || continue
	case "$wt_path" in
		"$OLD_SLOTS_SDL"/* | "$OLD_SLOTS_JI"/*) ;;
		*) continue ;;
	esac
	tail=${wt_path#"$OLD_SLOTS_SDL"/}
	[ "$tail" = "$wt_path" ] && tail=${wt_path#"$OLD_SLOTS_JI"/}
	dest="$NEW_SLOTS/$tail"

	if [ ! -d "$wt_path" ]; then
		note "SKIP $wt_path: directory missing (consider 'git worktree prune')"
		continue
	fi
	if [ -e "$dest" ]; then
		note "SKIP $wt_path: destination $dest already exists — resolve by hand"
		continue
	fi
	if [ "$wt_locked" = "yes" ]; then
		note "SKIP $wt_path: worktree is locked — unlock ('git worktree unlock') and re-run"
		continue
	fi
	run mkdir -p "$(dirname "$dest")"
	run git -C "$REPO_ROOT" worktree move "$wt_path" "$dest"
	moved_any=1
done <<EOF_WT
$worktree_rows
EOF_WT

if [ "$DRY_RUN" -eq 0 ]; then
	say "post-move worktree verification:"
	git -C "$REPO_ROOT" worktree list
	if git -C "$REPO_ROOT" worktree list --porcelain |
		grep -E "^worktree ($OLD_SLOTS_SDL|$OLD_SLOTS_JI)/" >/dev/null; then
		die "worktrees still registered under a legacy slots root after moves"
	fi
elif [ "$moved_any" -eq 1 ]; then
	note "(dry-run) would verify no worktrees remain under legacy slots roots"
fi

# 4c. non-slot state subdirs of ~/.local/state/ji -> ~/.local/state/ns.
# All are cheap to carry: enriched-plan (durable saved plans),
# submit-failure-logs and pi-cli-command-extension (diagnostics).
OLD_STATE_JI="$STATE_ROOT/ji"
NEW_STATE_NS="$STATE_ROOT/ns"

if [ -d "$OLD_STATE_JI" ]; then
	run mkdir -p "$NEW_STATE_NS"
	for child in "$OLD_STATE_JI"/*; do
		[ -e "$child" ] || continue
		name=$(basename "$child")
		[ "$name" = "slots" ] && continue # handled via git worktree move above
		if [ -e "$NEW_STATE_NS/$name" ]; then
			note "SKIP $child: $NEW_STATE_NS/$name already exists — merge by hand"
			continue
		fi
		run mv "$child" "$NEW_STATE_NS/$name"
	done
else
	note "no $OLD_STATE_JI (already migrated?)"
fi

# 4d. remove now-empty legacy skeletons (rmdir only — refuses non-empty).
for skel in \
	"$OLD_SLOTS_JI/repos/sdl-tools/worktrees" "$OLD_SLOTS_JI/repos/sdl-tools" \
	"$OLD_SLOTS_JI/repos" "$OLD_SLOTS_JI" "$OLD_STATE_JI" \
	"$OLD_SLOTS_SDL/repos/sdl-tools/worktrees" "$OLD_SLOTS_SDL/repos/sdl-tools" \
	"$OLD_SLOTS_SDL/repos" "$OLD_SLOTS_SDL"; do
	if [ -d "$skel" ]; then
		# Finder litter must not block cleanup (a .DS_Store exists in the sdl
		# worktrees dir today).
		if [ "$(ls -A "$skel")" = ".DS_Store" ]; then
			run rm -f "$skel/.DS_Store"
		fi
		if [ -z "$(ls -A "$skel")" ] || { [ "$DRY_RUN" -eq 1 ] && [ "$(ls -A "$skel")" = ".DS_Store" ]; }; then
			run rmdir "$skel"
		else
			note "leaving non-empty $skel in place"
		fi
	fi
done

# 4e. legacy sdl-era state that predates the sdl->ji migration: report only.
if [ -d "$STATE_ROOT/sdl" ]; then
	say "NOTE: legacy $STATE_ROOT/sdl still holds pre-ji data:"
	ls -A "$STATE_ROOT/sdl" | sed 's/^/    /'
	say "  Not auto-merged (ns siblings may already have same-named content,"
	say "  e.g. enriched-plan/gh--nseng-ai--sdl-tools exists in both eras)."
	say "  Merge or retire by hand when convenient."
fi
say ""

# ---------------------------------------------------------------------------
# step 5 — git refs: refs/ji/** -> refs/ns/**
# ---------------------------------------------------------------------------

say "-- step 5: git refs --"

say "refs/ji/** before:"
git -C "$REPO_ROOT" for-each-ref 'refs/ji/**' --format='  %(refname) %(objectname)' ||
	true
if [ -z "$(git -C "$REPO_ROOT" for-each-ref 'refs/ji/**')" ]; then
	note "no refs under refs/ji/** (already migrated?)"
else
	# Copy first, verify, delete after: update-ref -d is not reflog-recoverable
	# for these unreflogged refs, so the copy must be proven before deletion.
	git -C "$REPO_ROOT" for-each-ref 'refs/ji/**' --format='%(refname) %(objectname)' |
		while read -r refname sha; do
			suffix=${refname#refs/ji/}
			target="refs/ns/$suffix"
			existing=$(git -C "$REPO_ROOT" rev-parse --verify --quiet "$target" || true)
			if [ -n "$existing" ]; then
				if [ "$existing" = "$sha" ]; then
					note "$target already exists at same sha; deleting old $refname"
				else
					note "SKIP $refname: $target exists at DIFFERENT sha ($existing) — resolve by hand"
					continue
				fi
			else
				run git -C "$REPO_ROOT" update-ref "$target" "$sha"
			fi
			if [ "$DRY_RUN" -eq 0 ]; then
				copied=$(git -C "$REPO_ROOT" rev-parse --verify --quiet "$target" || true)
				[ "$copied" = "$sha" ] || die "copy verification failed for $target"
			fi
			# old-value guard: delete only if the old ref still points at $sha.
			run git -C "$REPO_ROOT" update-ref -d "$refname" "$sha"
		done
fi

say "refs/ns/** after:"
git -C "$REPO_ROOT" for-each-ref 'refs/ns/**' --format='  %(refname) %(objectname)' || true
say "refs/ji/** remaining:"
git -C "$REPO_ROOT" for-each-ref 'refs/ji/**' --format='  %(refname) %(objectname)' || true
say ""

# ---------------------------------------------------------------------------
# step 6 — smoke checklist (manual, NEW shell required)
# ---------------------------------------------------------------------------

say "-- step 6: smoke checklist --"
say "Open a NEW terminal (so the ns() wrapper from .zshrc loads), then:"
say "  1. ns --help                                   # CLI resolves and renders"
say "  2. ns objective list --minimal --format md     # repo state readable"
say "  3. ns slot cd <some-slot>  &&  pwd             # cd-directive round-trip"
say "     (pwd should land under $NEW_SLOTS/repos/sdl-tools/worktrees/;"
say "      then 'cd -' back; this exercises NS_CD_DIRECTIVE_FILE end-to-end)"
say "  4. git -C $REPO_ROOT worktree list             # all slots under .../state/ns/"
say ""
if [ "$DRY_RUN" -eq 1 ]; then
	say "== migration dry-run complete (no mutations performed) =="
else
	say "== migration complete =="
fi
