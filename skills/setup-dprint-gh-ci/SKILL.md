---
name: setup-dprint-gh-ci
disable-model-invocation: true
# Full description commented out to save tokens (coding agents inject skill descriptions into every session):
# "Add a GitHub Actions workflow that runs `dprint check` on pushes and PRs. Use when adding dprint CI to an existing dprint setup. Requires dprint.json to already exist -- run setup-dprint first if not."
description: "Command: setup-dprint-gh-ci"
allowed-tools:
  - "Bash(ls *)"
  - "Bash(mkdir *)"
  - "Bash(git remote *)"
  - "Bash(git branch *)"
  - "Bash(git symbolic-ref *)"
---

# setup-dprint-gh-ci

Add a GitHub Actions workflow that runs `dprint check` on pushes to the default
branch and on non-draft pull requests.

This skill only sets up CI. It assumes local dprint configuration (`dprint.json`)
already exists. If it does not, run `setup-dprint` first.

## Step 1: Precondition -- dprint config must exist

Look for `dprint.json` or `.dprint.json` in the project root:

```bash
ls dprint.json .dprint.json 2>/dev/null
```

If neither exists, stop and tell the user to run `setup-dprint` first. Do
not create a dprint config here -- keeping that in one skill keeps the config
defaults consistent.

## Step 2: Precondition -- GitHub project

Confirm the project is hosted on GitHub:

```bash
git remote -v 2>/dev/null | grep -E 'github\.com'
```

If there is no remote or the remote is not GitHub, stop and tell the user this
skill only applies to GitHub-hosted projects.

## Step 3: Determine the default branch

Try (in order):

1. `git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's@^origin/@@'`
2. `git remote show origin 2>/dev/null | grep 'HEAD branch' | awk '{print $NF}'`
3. Local branch heuristic: check whether `main` or `master` exists locally.

If detection fails, ask the user which branch to use. Report the resolved
branch to the user before writing the file.

## Step 4: Check for existing workflow

Look for `.github/workflows/dprint-ci.yml`. If it already exists, show the user
the current contents and ask whether to overwrite; do not clobber silently.

## Step 5: Write the workflow

Create the directory if needed:

```bash
mkdir -p .github/workflows
```

Copy `references/dprint-ci.yml` to `.github/workflows/dprint-ci.yml`,
substituting the default branch from Step 3 into the `branches:` list.
The template ships with `branches: [master]` -- replace `master` with the
resolved branch name.

Key details:

- Uses `dprint/check@v2.2` -- no manual dprint install needed in CI.
- Triggers on push to the default branch and on non-draft PRs.
- Cancels in-progress runs when a new push lands on the same ref
  (via the `concurrency` block).

## Step 6: Verify

Confirm the file was created:

```bash
ls .github/workflows/dprint-ci.yml
```

Tell the user the workflow will run on the next push or PR against the default
branch.
