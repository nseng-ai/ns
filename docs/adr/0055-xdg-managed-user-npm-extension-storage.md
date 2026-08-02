# ADR 0055: XDG-Managed User npm Extension Storage

## Status

Accepted

## Context

ADR 0051 establishes command-only user extensions, a single XDG-resolved user configuration file, layered catalog precedence, and user lifecycle commands. It deliberately leaves the managed storage root for user `npm:` sources to a later decision.

User npm acquisition needs durable per-machine data rather than repository state or regenerable cache. It must reuse the existing isolated npm-project acquisition mechanics without letting uninstall remove sibling packages or shared XDG roots. Install also spans acquisition, descriptor validation, and an optimistic user-config write, so failures after acquisition need an explicit ownership-aware cleanup rule.

## Decision

User npm extension bytes live beneath the existing ns data root:

```text
$XDG_DATA_HOME/ns/extensions/npm/<package-name>/
  node_modules/<package-name>/
```

When `XDG_DATA_HOME` is unset or empty, the existing XDG resolver uses `$HOME/.local/share`, producing `$HOME/.local/share/ns/extensions/npm/...`. The explicit `npm/` namespace reserves `$XDG_DATA_HOME/ns/extensions` for future source kinds.

Each canonical npm package name owns one isolated private npm project. Acquisition continues to disable npm lifecycle scripts and package-lock creation. The lifecycle owns only that package project. Cleanup may remove `$XDG_DATA_HOME/ns/extensions/npm/<package-name>` and may prune an empty package-scope directory such as `npm/@scope`; it must preserve sibling package projects and the shared `npm`, `extensions`, `ns`, and XDG data roots. Local extension sources remain in place and are never lifecycle-owned bytes.

A user install is an acquire, validate, then config-write transaction. If the invocation newly creates a package project and later descriptor validation or the optimistic config write fails, ns removes only that newly created project. It never rolls back a package project that existed before the invocation. If rollback also fails, the result reports both the primary failure and the retained managed path or cleanup diagnostic.

User uninstall changes authority before deleting bytes: it removes the declaration with the existing compare-and-write guard, then cleans the managed package project. If the config write fails, cleanup does not run. If cleanup fails after declaration removal, ns reports a retryable partial failure: command availability has been removed while managed bytes remain. Re-running uninstall may clean an already-undeclared package.

## Consequences

- User configuration remains at `$XDG_CONFIG_HOME/ns/ns.toml`, while lifecycle-owned npm bytes use `$XDG_DATA_HOME`; intent and acquired data have separate roots.
- User npm descriptors can be discovered from unrelated repositories through the same resolved storage layout without running npm during discovery.
- Project managed npm storage remains repository-local under `.ns/managed-extensions/npm`; callers select an explicit storage policy while sharing acquisition and cleanup mechanics.
- Safe cleanup must validate canonical package identity, descendant containment, and lifecycle-owned directory types before removal.
- User scope remains command-only. Managed npm acquisition does not activate instructions, points, consumer directories, bundled artifacts, supported harnesses, or repository files.

## Considered Options

- **Store acquired packages under XDG config:** rejected because installed package bytes are application data, not user-edited configuration.
- **Use XDG cache:** rejected because deleting cache must not remove an intentionally installed command surface or leave durable declarations broken.
- **Use one shared npm project for all user extensions:** rejected because package-manager rewrites and uninstall would couple otherwise independent packages and weaken ownership boundaries.
- **Delete bytes before removing the declaration:** rejected because a cleanup success followed by a config-write failure would leave an authoritative declaration pointing at a missing package.
