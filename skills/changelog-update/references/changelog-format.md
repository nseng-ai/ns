# Changelog Format Specification

Based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) with
a commit-tracking marker for incremental updates.

## Structure

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

<!-- As of: abc1234 -->

### Added

- Description of new feature (commit_hash)

### Fixed

- Description of bug fix (commit_hash)

## [1.2.3] - 2025-12-13 14:30 PT

### Added

- Description of new feature

### Fixed

- Description of bug fix
```

## "As of" Marker

The marker tracks which commit the Unreleased section is synced to:

```markdown
<!-- As of: abc1234def -->
```

- **Format:** HTML comment, invisible in rendered markdown
- **Location:** Immediately after `## [Unreleased]`, on its own line
- **Content:** Short or full commit hash
- **Updated:** Every sync, even when no new entries are added

**Alternate format** (also recognized when reading):

```markdown
As of `abc1234def`
```

Both formats are recognized when parsing. When writing or updating, always
use the HTML comment format.

## Category Order

When present, categories appear in this order:

1. **Major Changes** -- significant new systems or breaking changes
2. **Added** -- new features
3. **Changed** -- improvements to existing functionality
4. **Fixed** -- bug fixes
5. **Removed** -- removals and deprecations

Only include category headers that have entries. Do not create empty sections.

## Entry Format

**In Unreleased section** (includes commit hash for traceability):

```markdown
- Brief user-facing description (abc1234)
```

**In released sections** (hash stripped):

```markdown
- Brief user-facing description
```

**Major Changes** use a richer format:

```markdown
- **Feature name**: Brief description of what it does. Why it was built. What benefit users get. (abc1234)
```

## Version Headers

```markdown
## [X.Y.Z] - YYYY-MM-DD HH:MM TZ
```

Example: `## [0.3.0] - 2025-12-13 14:30 PT`

The Unreleased header has no date:

```markdown
## [Unreleased]
```

## Template for New CHANGELOG.md

Use this when initializing a changelog for a project that doesn't have one:

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

<!-- As of: {HEAD_COMMIT} -->
```

Replace `{HEAD_COMMIT}` with the current short HEAD hash.
