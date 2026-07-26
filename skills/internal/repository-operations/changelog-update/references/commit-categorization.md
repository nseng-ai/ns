# Commit Categorization Rules

Categorize commits for changelog entries. The central principle:
**only user-visible behavior earns a changelog entry.**

## The User-Visibility Test

For each commit, ask: "Does a user of this project see different behavior?"

- **YES** -> Changelog entry (categorize below)
- **NO** -> Filter out (always)

This test prevents internal refactors, test improvements, CI changes, and
infrastructure work from polluting the changelog. Users scanning for
"what changed?" care about new features, bug fixes, and behavior changes --
not implementation details.

## Categories

### Major Changes

Significant new user-facing systems or breaking changes. Must be genuinely
major -- do not force entries into this category just to have one.

**Qualifies:**

- New user-facing systems or major capabilities
- Breaking changes that require user action
- Significant workflow changes users need to know about

**Does NOT qualify** (even if user-visible):

- Bug fixes (-> Fixed)
- Small feature additions (-> Added)
- Performance improvements (-> Changed, or filter if invisible)
- Internal architecture improvements (-> filter entirely)

**Entry format for Major Changes:**

```markdown
- **Feature name**: Brief description of what it does. Why it was built. What benefit users get. (hash)
```

### Added

New features and capabilities.

**Signal words in commit messages:** add, new, implement, create, introduce

### Changed

Improvements to existing functionality.

**Signal words:** improve, update, enhance, move, migrate, rename, refactor
(only if user-visible)

### Fixed

Bug fixes.

**Signal words:** fix, bug, resolve, correct, repair, handle

### Removed

Removals and deprecations.

**Signal words:** remove, delete, drop, deprecate, eliminate

## Filter Rules

### Always filter out

- **Release housekeeping** -- version bumps, changelog finalization, lock file
  updates from releases
- **CI/CD-only changes** -- `.github/workflows/`, `.gitlab-ci.yml`, etc.
  (unless the project distributes CI workflows to users)
- **Documentation-only changes** -- `docs/`, standalone `.md` files, comments
- **Test-only changes** -- `tests/`, `test_*.py`, `*_test.go`, `*.test.ts`, etc.
- **Build/tooling-only changes** -- `Makefile`, `justfile`, dependency-only
  manifest changes (adding a dev dependency is not user-visible)
- **Agent/skill configuration** -- `.claude/`, `.agents/`, `.cursor/`,
  `.github/copilot/`
- **Merge commits** with no substantive content
- **Vague commit messages** -- "update", "WIP", "wip", "cleanup", "misc",
  "temp", "stuff"
- **Internal refactors** with no user-visible behavior change

### Filter by path patterns

Changes touching ONLY these paths are internal:

- `tests/` or `test/` -- test-only
- `docs/` -- documentation-only
- `.github/workflows/` -- CI-only
- `.claude/`, `.agents/`, `.cursor/` -- agent config
- `Makefile`, `justfile` -- build tooling

If a commit touches both filtered paths AND user-facing paths, evaluate the
user-facing changes to decide.

### Filter by commit message patterns

- "Refactor X to Y" with no user-visible change -> filter
- "Consolidate", "Relocate" internal modules -> filter
- "Migrate to frozen dataclasses" -> filter
- "Update dependencies" (routine dep bumps) -> filter
- "Fix lint", "Fix types", "Format code" -> filter

### Likely internal (verify before including)

These patterns are often internal but sometimes user-visible. When in doubt,
categorize and flag as low-confidence:

- "Refactor" -- check if user-visible behavior changes
- "Harden", "Strengthen" -- usually internal enforcement
- "Improve error message" -- this IS user-visible, include it
- "Add logging" -- usually internal, unless user-facing logs

## Roll-Up Detection

When multiple commits are part of a larger initiative, group them under a
single entry in the appropriate category.

### Detection patterns

- Multiple commits mentioning the same keyword (e.g., "auth", "cache", "sync")
- Commits with sequential PR numbers on the same topic
- Commits that reference the same GitHub issue
- Multiple commits modifying the same files/directories

### Presentation

When a roll-up is detected, include in the proposal:

```
**Detected Roll-Up:** {n} commits appear related to "{topic}"
Suggest consolidating into single {Category} entry: "{proposed description}"
Commits: {list of hashes}
```

### Roll-up examples

- 5 commits about "auth" -> single Added entry: "Add authentication system with OAuth and session management"
- 3 commits fixing "parser" -> single Fixed entry: "Fix parser handling of edge cases in nested structures"
- 4 commits about "cache" -> single Added entry: "Add response caching with configurable TTL"

## Confidence Flags

Mark entries as **low-confidence** when:

- Commit message is ambiguous ("update X" could be Changed or internal)
- Scope is unclear (could be user-facing or internal-only)
- Category is borderline ("Add X" but it might be a refactor)
- Large changes that touch both user-facing and internal code
- Commit modifies many files across different areas

**Always explain the uncertainty** so the human reviewer can make the call:

```
**Low-Confidence Categorizations:**
- `abc1234` - Categorized as Changed, but could be internal refactor
  - Uncertainty: Commit modifies both API layer and internal utils
```

## Entry Writing Guidelines

- **Start with a verb:** Add, Fix, Improve, Remove, Move, Migrate
- **Focus on user benefit**, not implementation details
- **Be concise** -- one sentence, clear and specific
- **Never expose internals** -- no function names, class names, or architecture
  patterns in entry text
- **Include the short commit hash** in parentheses at the end

**Good entries:**

- Add bulk import endpoint for CSV files (abc1234)
- Fix incorrect timezone handling in scheduled reports (def5678)
- Improve error messages when API key is missing or expired (ghi9012)

**Bad entries (too internal):**

- Refactor UserService to use new BaseRepository pattern (abc1234)
- Add retry logic to _fetch_with_backoff helper (def5678)
- Migrate from dict to frozen dataclass in config module (ghi9012)
