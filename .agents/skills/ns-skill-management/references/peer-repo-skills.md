# Peer repo skills

Use skills from another repository on your machine during local
development. The peer repo can be any repo with installable skills
(`SKILL.md` files) -- it does not need to follow nonslop conventions.
The current (nonslop-managed) repo uses a `local.just` recipe to
symlink peer skills in.

## Mental model

```
<peer-repo>/.agents/skills/<name>/   <- source in any repo on your machine
     ^
     | absolute symlink (created by local.just install recipe)
     |
.agents/skills/<name>                <- appears locally, NOT tracked by git
     ^                                 added to .git/info/exclude
     |
     | symlink: ../../.agents/skills/<name>
     |
.claude/skills/<name>               <- Claude Code can read it locally
```

Key differences from local and GitHub-sourced skills:

- **Absolute symlink** -- points to a path on your machine, not a
  relative path within the repo
- **Not committed** -- the symlink is excluded from git via
  `.git/info/exclude` (local-only, not `.gitignore`)
- **Not in `skills-lock.json`** -- these are transient development
  links, not permanent dependencies
- **Never normalized into local skill entries** -- if one of these
  paths leaks into `skills-lock.json`, remove the leaked entry instead
  of rewriting it to `skills/<name>`

## The `local.just` pattern

A `local.just` file (gitignored via the project's `.gitignore`) contains
a `just` recipe that creates symlinks and manages `.git/info/exclude`.

### Template

```just
PEER := "/path/to/peer-repo"

install-peer mode="local":
    #!/usr/bin/env bash
    set -euo pipefail
    PEER="{{ PEER }}"
    if [ "{{ mode }}" = "local" ]; then
        # Optional: editable-install Python packages from the peer repo
        # uv pip install -e "$PEER"

        # Link skills from the peer repo
        for skill in "$PEER"/skills/*/; do
            name=$(basename "$skill")
            ln -sfn "$PEER/.agents/skills/$name" .agents/skills/"$name"
            ln -sfn "../../.agents/skills/$name" .claude/skills/"$name"
            # Add to .git/info/exclude so git status stays clean
            for path in ".agents/skills/$name" ".claude/skills/$name"; do
                grep -qxF "$path" .git/info/exclude 2>/dev/null || echo "$path" >> .git/info/exclude
            done
        done

        echo "peer skills linked"

    elif [ "{{ mode }}" = "clear" ]; then
        # Optional: uninstall editable packages
        # uv pip uninstall peer-package 2>/dev/null || true

        # Remove symlinks that point into the peer repo
        for link in .agents/skills/* .claude/skills/*; do
            [ -L "$link" ] || continue
            target=$(readlink "$link")
            if [[ "$target" == *"$PEER"* ]]; then
                name=$(basename "$link")
                rm -f "$link"
                sed -i '' "/^\.agents\/skills\/$name$/d" .git/info/exclude 2>/dev/null || true
                sed -i '' "/^\.claude\/skills\/$name$/d" .git/info/exclude 2>/dev/null || true
            fi
        done

        echo "peer skills unlinked"
    else
        echo "Usage: just install-peer [local|clear]" >&2
        exit 1
    fi
```

Adapt by:

- Renaming `PEER` and `install-peer` to match the peer repo name
  (e.g. `TWERK` / `install-twerk`)
- Uncommenting the `uv pip install -e` lines if the peer repo
  has Python packages you want to editable-install alongside skills
- Adjusting `$PEER/skills/*/` if the peer repo's skills live at
  a different path (e.g. `$PEER/.agents/skills/*/` if skills are
  only in the agent directory)

### Usage

```bash
just install-peer          # link peer skills (default: mode=local)
just install-peer clear    # unlink peer skills and clean up
```

## Lock file pollution hazard

**The main risk of this pattern:** running any `npx skills` operation
(`add`, `update`, `remove`) while peer skills are symlinked can cause
`npx skills` to add those peer skills to `skills-lock.json`. This
breaks CI because:

1. The skill entries appear in the lock file
2. The actual skill files are not committed (correctly excluded)
3. CI clones the repo, sees the lock entries, finds no files, and tests fail

### Prevention

Avoid running `npx skills` operations while peer skills are linked.
If you need to run `npx skills add/update/remove`:

```bash
just install-peer clear     # unlink peer skills first
npx skills ...              # run the operation
just install-peer           # re-link
```

### Detection: `test_lock_only_contains_tracked_skills`

Add a test that catches lock file pollution before it reaches CI.
This test uses `git ls-files` (not `.git/info/exclude`) to detect
which skills are tracked by git:

```python
import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]


def _git_tracked_skill_names() -> set[str]:
    """Skill names whose .agents/skills/<name> directories are tracked by git."""
    result = subprocess.run(
        ["git", "ls-files", ".agents/skills"],
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
    )
    return {
        line.split("/")[2]
        for line in result.stdout.splitlines()
        if line.startswith(".agents/skills/") and len(line.split("/")) >= 3
    }


def _untracked_lock_skills() -> set[str]:
    """Skills in the lock file whose directories are not tracked by git."""
    return set(_lock_skills()) - _git_tracked_skill_names()


def _untracked_dir_skills(path: Path) -> set[str]:
    """Skill directories on disk that are not tracked by git."""
    if not path.is_dir():
        return set()
    return {entry.name for entry in path.iterdir()} - _git_tracked_skill_names()


def test_lock_only_contains_tracked_skills():
    """Every skill in skills-lock.json must have its files tracked by git.

    If this fails, a locally-installed skill (e.g. from ``just install-peer``)
    leaked into the lock file. Revert the skills-lock.json changes before
    committing.
    """
    untracked = _untracked_lock_skills()
    assert not untracked, (
        f"skills-lock.json contains skills not tracked by git: {sorted(untracked)}. "
        "This usually means `npx skills` ran while peer skills were symlinked. "
        "Revert skills-lock.json to remove these entries before committing."
    )
```

### Why `git ls-files`, not `.git/info/exclude`

`.git/info/exclude` is **local-only state** -- it exists on your
machine but not in CI. Tests that read it pass locally (correctly
excluding peer skills) but fail in CI (the exclude file is empty or
absent, so nothing is excluded, and the test sees lock entries with
no matching files).

`git ls-files` returns the same result everywhere -- it reports what
git actually tracks. A skill whose directory has no tracked files is
a peer/local-only skill regardless of the environment.

### Recovery

If peer skills have already leaked into `skills-lock.json`:

```bash
git checkout -- skills-lock.json   # revert to the committed version
```

Or manually remove the leaked entries (skills whose `sourceType` is
`"github"` but whose `.agents/skills/<name>` directory is a symlink
pointing outside the repo). Do not rewrite peer-repo absolute paths to
`skills/<name>`; those skills are local-only and should not be in the
lock file at all.
