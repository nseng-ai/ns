---
edges:
  - objective: ship-objectives-to-customers
    annotation: Subobjective of the customer-Objectives umbrella; owns publication and checkout-free verification of the bare-core Objectives acquisition path.
  - objective: objectives-claude-onboarding-steelthread
    annotation: Provides the published bare-core and standalone Objectives artifacts consumed by the Claude Code onboarding thread.
---

# Objectives Bare-Core Release

## Thesis

Publish and verify the first registry release in which `@nseng-ai/ns` is genuinely bare core and Objectives arrive through the customer extension-acquisition path. Source has already removed the bundled Objectives capability, but npm latest remains `0.1.2`, which predates that unbundle. This Subobjective closes the gap between landed source and the irreversible customer artifact.

The release is successful only when a foreign repository with no ns checkout or development toolchain can install the published core, observe that Objective commands are initially absent, install `npm:@nseng-ai/objectives`, and then run `ns objective list` through the acquired extension.

## Scope

- Prepare a coherent publishable package set containing the landed bare-core host and the standalone Objectives extension, using the repository's established package and release conventions.
- Verify packed artifacts before publication: core contains no preinstalled Objectives descriptor or command, while the Objectives package contains its descriptor, activation contribution, and bundled harness artifacts.
- Publish the required `@nseng-ai/*` package versions to npm after explicit human authorization for the external write.
- Verify registry metadata and tarballs rather than assuming the local source shape reached npm.
- Run the checkout-free acquisition smoke in a throwaway foreign repository: install core, initialize harness selection, install `npm:@nseng-ai/objectives`, and exercise `ns objective list`.
- Capture release versions and smoke evidence for the umbrella and downstream onboarding Subobjective.

## Non-Goals

- Implementing missing `ns extension` commands or changing acquisition semantics.
- Rewriting the customer documentation corpus beyond correcting a release-blocking factual defect found during verification.
- Running the full create → next → update → close Claude Code onboarding journey.
- Publishing automatically, changing npm ownership or access policy, or building general release automation.
- Implementing `ns` self-update, extension fleet updates, or additional source kinds.

## Completion Criteria

- npm serves a new verified release where `@nseng-ai/ns` starts without the Objectives extension bundled.
- The corresponding published `@nseng-ai/objectives` artifact is independently installable through `ns extension install npm:@nseng-ai/objectives` and carries its declared activation and harness artifacts.
- In a throwaway non-ns repository with no checkout dependencies, the published core initially lacks `ns objective`, then exposes it after initialization and extension installation, and `ns objective list` succeeds.
- The smoke proves no runtime dependency on this checkout or `ts/node_modules` and records the exact registry versions exercised.
- Any publish or verification failure is either corrected and re-verified or recorded as a concrete blocker; local packed-artifact success alone does not satisfy the Objective.

## Assumptions and Risks

Assumptions:

- The source-side host unbundle remains landed and the existing package build can produce standalone core and Objectives artifacts without a new architecture change.
- npm remains the supported customer distribution channel and the necessary package names and publisher access are available.
- Existing `ns init` and `ns extension install` behavior is sufficient for the release smoke once the customer-surface Subobjective completes its release prerequisite.

Risks:

- npm publication is an irreversible external write. Execution must stop for explicit human authorization immediately before publishing and must report the exact package/version set.
- Workspace packages may require coordinated version or dependency publication; publishing only the two visible packages could leave registry dependency ranges unsatisfied.
- Local pack and workspace tests may conceal undeclared checkout dependencies. The foreign-repository smoke is the release gate.
- Global installs can contaminate verification. Use isolated prefixes or equivalent bounded environments and prove the invoked binary and packages come from the intended registry versions.
- The registry may partially accept a coordinated release. Recovery must publish forward with clear evidence rather than overwrite immutable versions.

## Open Questions

None at creation. The exact next version and coordinated package set are determined by the established release procedure and pre-publish registry inspection; they must be presented for authorization before the external write.
