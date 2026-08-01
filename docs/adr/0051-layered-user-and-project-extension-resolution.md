# ADR 0051: Layered User and Project Extension Resolution

## Status

Accepted

## Context

ns currently composes built-in host commands, an injected/source-development preinstalled descriptor catalog, and project declarations from repo-root `ns.toml`. Project extension lifecycle operations also combine declaration and acquisition with repository activation. User-installed extensions need a machine-wide command surface without turning user configuration into ambient project activation, allowing extensions to replace host infrastructure, or silently mixing commands from two versions of one package.

## Decision

ns adds an extensions-only **user extension scope** at the single path resolved as `$XDG_CONFIG_HOME/ns/ns.toml`, using `$HOME/.config/ns/ns.toml` when the existing XDG resolver falls back. There is no search or merge across both paths. An absent file means no user declarations. A path-resolution, read, file-type, TOML-syntax, or `extensions`-value failure is a source-labelled user-scope diagnostic and contributes no user declarations.

The user file is parsed as TOML, but only its top-level `extensions` array is consumed. Other keys and tables have no runtime meaning at user scope: discovery ignores them, and lifecycle edits preserve their bytes. A user lifecycle command may create the parent directory and file, but it must not normalize or delete unrelated content. User local sources are persisted as canonical absolute paths and hand-authored user local declarations must also be absolute; project local sources retain their existing repository-relative resolution.

The command catalog has four ordered extension-bearing levels:

```text
built-in host commands (reserved)
preinstalled descriptor catalog
user descriptor extensions
project descriptor extensions
```

Built-in host command paths are reserved rather than merely lowest precedence. A user, project, or preinstalled descriptor entry at a built-in path is rejected, the built-in candidate remains authoritative, and a command-scoped error diagnostic is emitted. The diagnostic is fatal when that colliding path is requested and is only a warning for unrelated invocations, so bad extension metadata cannot disable unrelated built-ins.

Within each non-built-in level, duplicate command paths and command/group shape collisions are deterministic errors; every conflicting candidate at that level is excluded. Across levels, a project command path overrides a user or preinstalled command path, and a user command path overrides a preinstalled command path. These cross-level replacements are source-labelled informational diagnostics, not same-scope collision errors. Selected-command loading remains lazy after catalog composition.

The canonical extension identity is the package's validated `package.json` `name`, independent of local versus npm acquisition and independent of version. Within user scope or project scope, multiple declarations resolving to one canonical identity are an error and none of those same-scope packages contributes commands. Across user and project scope, a project declaration replaces the user declaration with the same canonical identity as one whole extension package: all user commands from that identity are suppressed before command-path composition, even when the two descriptors expose different command sets. This prevents a split command surface assembled from two versions. Different identities still resolve independently by command path, with project winning.

A higher-scope declaration reserves an identity as soon as a trustworthy package name is available from its source expectation or manifest, even if later descriptor inspection fails. Therefore a broken project declaration does not silently fall back to a user-installed version of the same known package. If a broken local declaration cannot yield a trustworthy package name, ns cannot correlate it with a lower-scope package; it reports the source-labelled failure and continues composing the identities it can establish.

Descriptor and declaration failures are isolated by source and package. A failed source contributes no usable candidates except the identity reservation above; unrelated built-in, preinstalled, user, and project commands remain discoverable and invocable. Package-level failures with no known command path are warnings for otherwise resolvable invocations. Command collisions and selected-command load failures are fatal only for the affected requested path. Diagnostics must name the scope, declaration, config or descriptor path, and stable failure code; catalog listing surfaces all diagnostics.

User scope means command availability only. `ns extension install|list|update|uninstall --scope user` manages one whole package declaration and its acquired bytes, with `project` remaining the default scope for compatibility. User operations do not require a Git repository, project `ns.toml`, or supported harnesses, and they never run project activation or write `AGENTS.md`, `CLAUDE.md`, `.ns/`, consumer directories, points, instructions, or bundled/harness artifacts. A project declaration and activation remain the only way to apply those repository effects. The exact XDG-managed npm storage root is intentionally deferred to the roadmap's user-acquisition slice.

## Consequences

- Catalog composition must separate descriptor loading by scope, preserve package identity even across some descriptor failures, apply whole-identity project replacement before command-key merging, and reserve built-ins outside ordinary precedence.
- User lifecycle orchestration must split from the current project preflight/activation transaction while reusing byte-preserving declaration editing, descriptor inspection, and acquisition mechanics.
- A machine-wide extension can make commands available in any repository, but it cannot ambiently activate repository behavior.
- Project authors can deliberately select a different version or source for an installed extension without inheriting leftover commands from the user version.

## Considered Options

- **Resolve every command independently across user and project versions of the same package:** rejected because it creates a synthetic split-version extension and violates whole-package membership.
- **Let a broken project declaration fall back to the user package:** rejected when identity is known because explicit project intent must not silently execute different machine-local code.
- **Treat built-ins as ordinary lowest-precedence candidates:** rejected because extension configuration must not replace host infrastructure.
- **Interpret other user `ns.toml` fields:** rejected because supported harnesses, points, settings, activation, and repository effects remain project-local.
