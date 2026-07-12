# Autobranch Family Boundaries

Shared boundary contract for the Flow autobranch skill family (`ns-flow-autobranch`, `ns-flow-branch-latest-commit`). Each family skill points here; command-specific boundaries stay in the individual skills.

The Flow autobranch family is the cross-harness path for moving existing work onto Graphite branches through public Flow CLI commands and their Pi mirrors.

- Graphite/`gt` is part of the command contract.
- These workflows do not submit, land, restack, or create plain git branches.
- Pi may add notification/status UX, but the public command boundaries are the documented `ns flow ...` commands and their `/ns:flow:*` mirrors.
- Hidden `ns flow autobranch` remains available for internal compatibility; do not use it as the public or cross-harness path.
