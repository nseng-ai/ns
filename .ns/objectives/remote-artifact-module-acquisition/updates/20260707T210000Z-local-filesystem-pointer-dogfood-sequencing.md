# Local filesystem pointer dogfooding sequenced before npm acquisition

## Summary

The next implementation slice dogfoods declared local filesystem extension pointers before npm managed acquisition. This unblocks immediate local extension development without adding package-manager, registry, network, or git gateways.

## Objective impact

This changes sequencing only. It preserves the existing decisions that `ns.toml` uses top-level `extensions = [...]`, local-path entries are pointers to package directories on disk (not copied, linked, packed, or installed), and per-target updates are declared-only.

The npm managed-install acquisition slice remains later; this slice validates and reads local package directories directly for static `package.json#ns.harnessArtifacts` and `package.json#ns.commands` metadata.

## Follow-ups

- Implement npm managed acquisition behind a fakeable package-manager gateway.
- Keep git acquisition deferred.
- Add command metadata generation for first-party packages in a separate package-prep slice.
