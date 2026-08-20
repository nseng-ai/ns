# Follow-up: Explorer filesystem-boundary hardening

**Origin:** the initial subprocess-only lexical cwd boundary for `@internal/ns-pi-subagents` explorers

## Current state

Explorer descriptors carry an internal cwd filesystem-scope policy. Explorers are temporarily subprocess-only. The subprocess runtime loads a generated package-owned extension while ambient extensions remain disabled, and that extension lexically confines `read`, `grep`, `find`, and `ls` paths to the dispatch cwd.

This boundary addresses accidental or model-generated absolute and traversal paths. It is not a filesystem sandbox. In particular, an in-cwd symlink can still resolve outside cwd, and protection against adversarial filesystem races would require an OS sandbox rather than a tool-call extension.

## Independently reviewable follow-ups

### Restore in-process explorer support

Completion conditions:

- inject the same descriptor-owned cwd boundary through `DefaultResourceLoader.extensionFactories` or an equivalent package-owned in-process seam;
- prove parity for all four filesystem tools, omitted-path behavior, malformed paths, absolute paths, tilde paths, traversal, and sibling-prefix traps across subprocess and in-process execution;
- keep ambient extension recursion disabled;
- restore `"in-process"` to the explorer descriptor only after parity tests pass; and
- retain fail-closed runtime selection when no compatible guarded adapter is available.

### Add canonical, symlink-aware containment

Completion conditions:

- canonicalize the configured root and the target, or the target's nearest existing ancestor when the final path does not exist;
- reject direct and nested symlink escapes;
- reject a nonexistent child reached through an in-cwd symlink to an outside directory;
- preserve ordinary nonexistent in-root paths and existing lexical traversal protections; and
- document that extension-level canonical checks reduce accidental/model-generated escapes but cannot prevent adversarial local filesystem races.

## Reverify before acting

Recheck Pi's built-in path normalization, especially leading `@`, Unicode-space normalization, tilde expansion, and platform-specific path handling. Recheck the in-process resource-loader API and child-extension ordering before selecting a shared enforcement seam.
