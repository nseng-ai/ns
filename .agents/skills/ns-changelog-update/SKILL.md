---
name: ns-changelog-update
# Full description commented out to save tokens (coding agents inject skill descriptions into every session):
# "Sync CHANGELOG.md unreleased section with recent commits. Use when the user wants to update the changelog, add recent changes to the changelog, sync the changelog with commits, or prepare changelog entries. Also handles first-time changelog initialization when no CHANGELOG.md exists."
description: "Command: ns-changelog-update"
references:
  - references/changelog-format
  - references/commit-fetching
  - references/commit-categorization
allowed-tools:
  - "Bash(git *)"
  - "Bash(date *)"
---

# changelog-update

Sync the CHANGELOG.md `[Unreleased]` section with commits merged since the
last update. Uses pure git commands -- no external tools or language-specific
dependencies.

## When to use

- "Update the changelog"
- "Sync the changelog with recent commits"
- "Add recent changes to the changelog"
- "Prepare changelog entries"
- Any time the user wants CHANGELOG.md to reflect recent work

## Workflow

### Phase 1: Detect / Initialize

Check if `CHANGELOG.md` exists in the repository root.

**If it does not exist:**

1. Get the current HEAD hash: `git rev-parse --short HEAD`
2. Create `CHANGELOG.md` using the template from `references/changelog-format.md`
   with the `<!-- As of: {HEAD} -->` marker set to the current HEAD
3. Report: "Initialized CHANGELOG.md with empty Unreleased section (as of {HEAD})."
4. **Stop.** There are no commits to categorize since the marker is at HEAD.

**If it exists:** proceed to Phase 2.

### Phase 2: Fetch Commits

Follow the procedure in `references/commit-fetching.md` to:

1. Parse the "As of" marker from the `[Unreleased]` section
2. Fall back to the last release tag if no marker exists
3. Get all commits since the base using `git log --first-parent`
4. Collect details for each commit (subject, body, files changed, PR number)

**If no commits found:**

1. Update the "As of" marker to current HEAD
2. Report: "CHANGELOG.md is already up-to-date. Updated marker to {HEAD}."
3. **Stop.**

### Phase 3: Categorize

1. **Read existing entries** in the Unreleased section to avoid suggesting
   duplicates.
2. **Apply categorization rules** from `references/commit-categorization.md`:
   - Classify each commit into: Major Changes, Added, Changed, Fixed, Removed
   - Filter out internal-only changes (tests, CI, docs, build tooling, etc.)
   - Detect roll-ups (multiple related commits -> single entry)
   - Flag low-confidence categorizations

### Phase 4: Present Proposal

**CRITICAL: Do NOT edit the changelog yet.**

Display the proposal in this format:

```
Found {n} commits since last sync ({since_commit}).

**Proposed Entries:**

**Major Changes ({count}):**
1. `{hash}` - {proposed description}
   - Reasoning: {why this is a major change}

**Added ({count}):**
1. `{hash}` - {proposed description}

**Changed ({count}):**
...

**Fixed ({count}):**
...

**Removed ({count}):**
...

**Filtered Out ({count}):**
- `{hash}` - "{original message}" -> {reason for filtering}

---

**Low-Confidence Categorizations:**
- `{hash}` - Categorized as {category}, but could be {alternative}
  - Uncertainty: {explanation}

---

Would you like me to:
1. Approve and update the changelog?
2. Adjust any categorizations?
3. Rephrase any entry descriptions?
4. Include or exclude any commits?
```

Only include category sections that have entries. Omit empty categories.
Only include the Low-Confidence section if there are flagged entries.

**Wait for the user to approve or request changes.**

### Phase 5: Update CHANGELOG.md

Only proceed after the user confirms or provides adjustments.

1. **Update the "As of" marker** to the current HEAD commit hash
2. **Add new entries** under the appropriate category headers in the
   Unreleased section
3. **Preserve existing entries** -- do not remove or modify them
4. **Create category headers** only if they have new entries
5. If a category header already exists, append new entries below existing ones

**Category order** (when present):

1. Major Changes
2. Added
3. Changed
4. Fixed
5. Removed

### Phase 5 Report

After successful update:

```
Updated CHANGELOG.md:
- Processed {n} commits
- Added {m} entries to: {categories}
- Filtered {f} commits
- Now as of {HEAD}
```

## Entry format

Each entry in the Unreleased section includes the short commit hash:

```markdown
- Brief user-facing description (short_hash)
```

When a release is cut later, the hashes are stripped:

```markdown
- Brief user-facing description
```

**Writing guidelines:**

- Start with a verb: Add, Fix, Improve, Remove, Move, Migrate
- Focus on **user benefit**, not implementation details
- Be concise but clear (one sentence)
- Include the short commit hash in parentheses
- For roll-ups covering multiple commits, list all hashes: `(hash1, hash2, hash3)`
