# Commit Fetching Procedure

Fetch commits since the last changelog sync using pure git commands.
No external tools or language-specific dependencies required.

## Step 1: Get Current HEAD

```bash
git rev-parse --short HEAD
```

Save this as `HEAD_COMMIT`. This will become the new "As of" marker.

## Step 2: Find the Base Commit

Read `CHANGELOG.md` and look for the "As of" marker in the Unreleased section.

**Pattern 1 (HTML comment, preferred):**

```
<!-- As of: <hash> -->
```

**Pattern 2 (backtick, legacy):**

```
As of `<hash>`
```

If a marker is found, save the hash as `BASE_COMMIT`. Go to Step 3.

**Fallback -- no marker found:**

Look for the first version heading after `[Unreleased]`:

```
## [X.Y.Z]
```

Extract the version number and try to resolve the git tag:

```bash
git rev-parse --verify v{VERSION}^{commit}
```

If the tag exists, use that commit as `BASE_COMMIT`. Go to Step 3.

If no tag either (e.g., project never tagged a release), this is effectively
a fresh changelog. Add an `<!-- As of: {HEAD_COMMIT} -->` marker and stop --
there is no meaningful base to diff against.

## Step 3: Verify Base Commit

Ensure the base commit exists in the repository:

```bash
git cat-file -t {BASE_COMMIT}
```

If this fails, the commit may have been rewritten (rebase, squash). Fall back
to the tag-based approach from Step 2, or ask the user for a starting point.

## Step 4: Get Commit List

```bash
git log --oneline --first-parent {BASE_COMMIT}..HEAD
```

**Why `--first-parent`:** Only includes commits on the main branch. Excludes
individual feature-branch commits that were squash-merged or merged via PR.
This gives one entry per merged PR/feature, not every intermediate commit.

If the list is empty, there are no new commits. Update the marker and stop.

## Step 5: Get Commit Details

For each commit hash from Step 4, collect:

**Subject and body:**

```bash
git show --format='%s%n---BODY---%n%b' --no-patch {HASH}
```

Parse: first line is the subject, everything after `---BODY---` is the body.
Truncate body to ~300 characters to keep context manageable.

**Files changed:**

```bash
git show --format= --name-only {HASH}
```

**PR number:** Extract from subject if present -- look for `(#NNNN)` at end.

## Output

For each commit, you should have:

- `hash`: Short commit hash
- `subject`: First line of commit message
- `body`: Remaining commit message (truncated)
- `files_changed`: List of file paths modified
- `pr_number`: PR number if detected, null otherwise

Use this data to categorize commits per `commit-categorization.md`.
