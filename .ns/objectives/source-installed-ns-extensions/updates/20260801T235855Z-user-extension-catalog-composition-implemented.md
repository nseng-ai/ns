# User extension catalog composition implemented

## Summary

The SDK now discovers command-only user extensions from the single XDG-resolved user configuration path and composes a four-level command catalog: reserved built-in host commands, preinstalled descriptors, user descriptors, and project descriptors. User config consumes only top-level `extensions`; absent files are empty scope, while path, file, read, TOML, declaration, package, and descriptor failures remain source-labelled diagnostics that do not disable unrelated commands.

Descriptor inspection now distinguishes available package identities from trustworthy identity reservations. Validated manifest identities survive later export, file, import, or descriptor-validation failure. Same-scope canonical identity duplicates exclude every declaration in the group, and a project identity reservation suppresses the entire matching user package before command composition without making the failed project package satisfy `requiresExtension`.

Built-in command paths are reserved across preinstalled, user, and project sources. Same-level exact and nested command/group shape conflicts exclude all participants. Higher non-built-in levels replace conflicting lower-level command shapes so the final CLI tree remains coherent, with informational override diagnostics and distribution help inheritance for exact replacements. Descriptor command modules remain lazy until listing or selected-command loading requires them.

User local declarations must be absolute. User `npm:` declarations are recognized and reserve their source identity, but production discovery returns a stable unavailable diagnostic through an injected npm-root seam; it does not consult repository `.ns/managed-extensions` or select a user storage policy.

## Objective Impact

The roadmap's user-scope discovery and catalog-composition row is complete. A CLI integration scenario proves that an absolute local user extension command can run from an unrelated repository without creating `ns.toml`, `.ns/`, instruction files, or harness artifacts there. SDK vocabulary now records User descriptor extensions, reserved built-ins, and four-level precedence.

Validation evidence:

- focused descriptor/catalog unit tests: 49 passed;
- focused CLI integration tests: 11 passed;
- SDK package tests: 272 passed;
- full TypeScript default lane: 6,047 passed;
- full TypeScript integration lane: 231 passed;
- isolated lane: 16 passed;
- TypeScript style guard: 168 passed;
- dependency, format, lint, typecheck, and dprint gates passed.

## Follow-Ups

- Add explicit user-scope lifecycle operations for install, list, update, and uninstall without project activation.
- Choose and implement the XDG-owned managed npm storage and cleanup policy in the dedicated acquisition slice.
- Prove installation of the intended source-checkout extension set across repositories.
- Reconcile user-facing extension documentation and lifecycle labels after those command surfaces exist.

The remaining risks are lifecycle/config byte preservation, managed npm ownership and cleanup, and clear user-facing distinction between command availability and project activation. This slice does not activate instructions, points, settings, consumer directories, bundled artifacts, supported harnesses, or other repository effects from user scope.
