# ADR 0053: Source-Identity Extension Precedence

## Status

Accepted

Supersedes the package-identity precedence and deduplication portions of ADR 0051. ADR 0051's user configuration, command precedence, built-in reservation, failure isolation, and command-only user-scope decisions remain accepted.

## Context

ADR 0051 defined extension identity as the validated `package.json` name. Implementing that rule required loading every declaration before deduplication, retaining package names from partial descriptor failures, and maintaining separate available and reserved identity sets. That machinery made package precedence depend on partially loaded package contents.

Pi uses a simpler rule: package declarations have identities derived from their sources before loading. Project declarations replace matching user declarations by source identity. A failed higher-precedence declaration therefore does not fall back to the same lower-precedence source, without requiring manifest inspection or failure-time identity recovery.

## Decision

Extension declaration identity is derived from the normalized source before descriptor loading:

- npm sources use the package name, independent of version;
- local sources use the resolved absolute path;
- recognized git sources use their normalized parsed source identity, though git descriptor loading remains unsupported.

Within one scope, duplicate normalized source identities are errors and every declaration in the duplicate group is excluded.

Across user and project scopes, a project declaration suppresses a user declaration only when their normalized source identities match. Suppression happens before descriptor loading, so a missing or broken project declaration does not fall back to the same user source.

Different source identities remain independent even when their loaded manifests declare the same package name. In particular, an npm source and a local path do not replace one another, and two distinct local paths do not replace one another. Their command contributions compose through the existing command-path precedence and collision rules.

Successful descriptor loads still expose manifest package names for `requiresExtension` checks and catalog reporting. Failed descriptors do not reserve manifest identities.

## Consequences

- Descriptor loading stays single-pass after source-level duplicate filtering.
- Catalog composition can suppress matching user declarations before loading either scope's candidates.
- No available/reserved package-identity result split or package identity on partial descriptor failures is needed.
- Two sources containing packages with the same manifest name can contribute different commands; overlapping commands still resolve by source-level command precedence.
- Selecting a different acquisition source for the same nominal package no longer implies whole-package replacement. Consumers that require replacement must declare the same normalized source or rely on command-path precedence.

## Considered Options

- **Retain manifest-name identity:** rejected because it requires post-load precedence machinery and makes declaration selection depend on package contents.
- **Fall back to a matching user source when the project source fails:** rejected because an explicit project declaration should remain authoritative for that source.
- **Treat source version or git ref as identity:** rejected because changing the selected version or ref should not cause user and project declarations of the same source to compose accidentally.
