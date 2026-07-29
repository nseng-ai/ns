# Roadmap

## Work

- [x] Centralize real temporary-directory creation and migrate all three verified test-kit callers in one behavior-preserving slice.
  - Policy: execute as one explicitly portable autorun step; stay within the private helper extraction and add focused tests only if parent judgment finds them necessary. Stop rather than broadening the design.
  - Evidence: one private helper owns `mkdtemp` then `realpath`; all three callers use it; no equivalent duplicate remains; the parent confirms unchanged tracking/setup/cleanup/error semantics; focused Foundation tests and relevant repository checks pass.

## Parked

- Any broader test-kit refactor or temporary-filesystem abstraction.
- Every other undisposed finding from the abandoned `code-smell-roaster-remediation` Objective.
