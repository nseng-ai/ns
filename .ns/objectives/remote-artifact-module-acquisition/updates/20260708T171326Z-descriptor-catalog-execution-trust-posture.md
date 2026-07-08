# Descriptor catalog execution trust posture recorded

## Summary

The extension-descriptor-contract Objective now makes descriptor modules the sole extension
metadata source for commands, points, and bundled harness artifacts. Catalog/discovery code imports
and validates `exports["./ns-extension"]` descriptor modules instead of reading only static
`package.json` extension manifests.

That means catalog build can execute descriptor module code. This explicitly supersedes the earlier
separation in this Objective's starting state and non-goals that module artifact discovery/acquisition
would parse static declarations without executing module code.

## Decision / Trust Posture

No new trust gate is introduced by this update. The standing ns posture remains the private,
unreleased, trusted-repo contract already recorded in this Objective and its umbrella: fetched or
declared modules are treated as code from a trusted project context, and there is no consent gate in
this slice.

The revised posture is:

- extension and artifact metadata now come from trusted descriptor modules;
- descriptor import executes code at catalog/discovery time;
- descriptor modules are expected to stay import-light and data-shaped, with implementations behind
  load thunks;
- first-party descriptor cheapness is guarded by the extension-descriptor-contract stack's
  `NS_TS_BAN_EXTENSION_DESCRIPTOR_STATIC_IMPORT` TypeScript style guard;
- any future audience/trust expansion should reopen a separate trust/consent Objective rather than
  silently restoring static-manifest assumptions here.

## Objective Impact

- Updates this Objective's source-grounded starting-state assumption: `ns.harnessArtifacts` static
  `package.json` parsing is no longer the durable direction once descriptor-declared
  `bundledArtifacts` is active.
- Updates the non-goal "No executed module code during discovery or acquisition-time hooks" for the
  descriptor world: acquisition still should not run arbitrary install/update hooks silently, but
  descriptor import itself is now an accepted execution point under the trusted-repo posture.
- Links the trust-posture change to `.ns/objectives/extension-descriptor-contract/`, whose roadmap
  explicitly required this cross-objective Semantic Update.

## Follow-Ups

- When remote acquisition resumes, design and review against descriptor-execution reality rather
  than the retired static-manifest separation.
- Keep per-module diagnostics and failure isolation: a descriptor import/validation failure should
  degrade that module's metadata, not block unrelated modules.
