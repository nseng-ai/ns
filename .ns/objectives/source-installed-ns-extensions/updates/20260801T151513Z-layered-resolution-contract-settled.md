# Layered extension resolution contract settled

## Summary

ADR 0051 settles the user/project extension-resolution and user-configuration contract before implementation. User configuration has one XDG-resolved `ns/ns.toml` path and only top-level `extensions` has runtime meaning; lifecycle edits preserve all other bytes. Built-in host command paths are reserved. Same-scope command collisions exclude every conflicting candidate, while project command paths override user paths for different package identities.

Canonical extension identity is the validated package manifest name. A project declaration replaces a user declaration of the same identity as one whole package before command-path composition, preventing a split command surface assembled from two versions. When a higher-scope identity is trustworthy but later descriptor loading fails, that identity remains reserved rather than silently falling back to lower-scope code. Uncorrelatable failures and unrelated packages remain isolated with source-labelled diagnostics.

User scope is command availability only. Its lifecycle operations manage declarations and acquisition without requiring a repository or supported harnesses and without invoking project activation. The exact XDG-managed npm storage root remains deferred to its dedicated roadmap slice.

## Objective Impact

The first roadmap row is complete and the identity-level replacement question is resolved. The discovery slice now has concrete starting seams in the SDK registry, source-level types, and declared-descriptor loader. The lifecycle slice must branch before the current project-only repository/harness preflight and activation transaction, while reusing byte-preserving TOML edit and acquisition mechanics.

The collision-ambiguity risk is contractually de-risked but remains implementation-sensitive. The partial-descriptor risk is sharpened into an explicit invariant: user descriptors may contribute commands but never ambient repository effects.

## Follow-Ups

- Implement user descriptor discovery, identity reservation/replacement, reserved built-ins, and four-level catalog composition with lazy selected-command loading.
- Add user lifecycle orchestration with project as the default scope and no activation path at user scope.
- Settle the XDG data/state root for managed npm bytes in the dedicated acquisition slice.
- Choose concise inventory and diagnostic labels for user-available versus project-activated extensions during CLI implementation.
