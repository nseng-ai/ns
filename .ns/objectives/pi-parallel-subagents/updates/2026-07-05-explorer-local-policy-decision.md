# Explorer Local Policy Decision

## Summary

Explorer children are read-only by capability allowlist, but they launch with `--no-extensions`. That preserves the product-level read-only boundary and also means this checkout's local `.pi/extensions/home-directory-guard.ts` is not loaded in child processes.

Decision: do not productize or inject the workstation-specific home-directory guard for this slice. Keep explorer children on the read-only allowlist with `--no-extensions`, and add a prompt-level convention that a root `AGENTS.local.md`, when present, is local policy the explorer must read and obey before broad reconnaissance.

This checkout now uses a root `AGENTS.local.md` for the installation-specific home-root safety rule. The file is intentionally local-only and ignored by this checkout; it is not a checked-in shared policy artifact.

Accepted limitation: this is prompt-enforced scope guidance, not equivalent to the extension guard, a cwd jail, or a capability sandbox. The capability-level guarantee remains read-only tools only.

## Objective Impact

The home-directory-guard bypass decision is resolved for dogfooding: prompt-level local policy via `AGENTS.local.md` is sufficient for the next dogfood slice, with the limitation recorded here.

The dogfood row is unblocked but should explicitly use the local policy file and record whether prompt-level scope guidance is enough in real transcripts. No extension-injection seam is added in this slice.

## Follow-Ups

- During dogfood, watch for any explorer child ignoring the `AGENTS.local.md` convention or attempting broad local filesystem reconnaissance.
- Reconsider a project/local child-extension injection seam or a stronger cwd/filesystem scope mechanism only if dogfood shows prompt-level local policy is insufficient.
