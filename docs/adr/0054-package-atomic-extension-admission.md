# ADR 0054: Package-Atomic Extension Admission

## Status

Accepted

Supersedes ADR 0051's command-level collision and precedence decisions. Supersedes ADR 0053 only where different source identities compose through command-level precedence; ADR 0053's normalized source identity, same-scope duplicate filtering, and pre-load Project suppression of a matching User source remain accepted.

## Context

The layered catalog originally flattened successfully loaded descriptors into individual command candidates before validation and precedence. A package could therefore lose one command to invalid metadata, a reserved Built-in collision, an unsatisfied requirement, or another extension while retaining the rest of its command surface. Successfully loaded package names were also reported before command admission, so a rejected package could satisfy another command's requirement or appear through `hasExtension`.

User lifecycle operations inherited the same mismatch: descriptor loading was treated as command availability even though canonical catalog composition could reject commands later. Installation could durably add a declaration and report it available although no complete package surface was admitted.

## Decision

The unit of extension admission is a source-derived **package contribution**, not an individual command. A contribution retains its normalized source identity, manifest package name, source level, package requirements, and complete declared command metadata until admission finishes. Distinct declarations with the same manifest package name remain distinct contributions under ADR 0053.

Built-in host commands remain outside extension admission and reserve their complete command shape. Any invalid command name, group, or path, internal command-shape collision, or Built-in collision rejects the entire package contribution.

Among extension contributions, source precedence applies to whole packages: Project beats User, and User beats Preinstalled. If any command shape in a higher-level package overlaps a lower-level package, the complete lower-level package is rejected. At one source level, every package participating in an exact or nested command-shape collision is rejected. Unrelated packages remain eligible.

Admission is deterministic and monotonic. Intrinsic and same-level rejection runs before cross-level precedence. Higher-to-lower precedence then rejects conflicting lower packages without later fallback or reconsideration. Requirement rejection cascades to a fixed point after collision decisions; a package rejected for an unsatisfied requirement does not resurrect a lower package it had already displaced. This conservative rule avoids iteration-order-dependent catalogs.

Extension requirements are descriptor-level `requiresExtensions` package-name edges. A requirement is satisfied only when at least one contribution with the exact manifest package name is finally admitted. Commandless admitted contributions may provide a requirement. Mutually dependent packages are supported because requirement evaluation begins from the collision-eligible set and removes only components whose external requirement has no admitted provider; cycles therefore survive together or are rejected together when an external dependency is absent.

Only admitted contributions are flattened into effective command candidates. `extensionPackageNames`, `hasExtension(packageName)`, and `installedExtensionPackageNames` derive from admitted contributions, so package presence and command execution share one fact.

User lifecycle availability uses an SDK-owned projection over Built-ins, the injected Preinstalled catalog, and the exact set of User declarations. It intentionally excludes Project declarations because User lifecycle is machine-wide and must work outside Git. Installation evaluates the exact planned declaration text and refuses to write unless the requested contribution is fully admitted. Existing rejected declarations remain visible as `unavailable`; update refuses them without writing; uninstall remains independent of descriptor loading and admission.

## Consequences

- No effective catalog can contain a strict subset of one admitted package's declared commands.
- One malformed or colliding command makes its package unavailable, while unrelated packages and Built-ins remain usable.
- Package requirements and runtime package-presence checks cannot be satisfied by rejected declarations.
- A higher-precedence package can suppress a complete lower-precedence package even when only one command overlaps.
- Same-level conflict recovery requires changing or removing declarations; ns does not choose a winner by array order.
- Lifecycle code consumes the canonical SDK availability projection instead of reproducing catalog precedence.
- Descriptor authors place package requirements on the descriptor rather than individual entries.

## Considered Options

- **Retain command-level admission and expose a `partial` lifecycle state:** rejected because it creates synthetic package surfaces and makes dependencies and runtime capability checks ambiguous.
- **Let a higher package that later fails requirements resurrect a displaced lower package:** rejected because it makes collision and dependency ordering non-monotonic and harder to reason about deterministically.
- **Treat manifest package name as contribution identity:** rejected because ADR 0053 deliberately permits distinct sources with the same manifest name.
- **Evaluate User lifecycle through the current repository's Project catalog:** rejected because machine-wide installation status must not vary by current directory or require Git.
