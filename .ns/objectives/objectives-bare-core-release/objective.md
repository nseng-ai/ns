---
edges:
  - objective: ship-objectives-to-customers
    annotation: Subobjective of the customer-Objectives umbrella; owns publication and checkout-free verification of the bare-core Objectives acquisition path.
  - objective: objectives-claude-onboarding-steelthread
    annotation: Provides the published bare-core and standalone Objectives artifacts consumed by the Claude Code onboarding thread.
---

# Objectives Bare-Core Release

## Thesis

Publish and verify the first registry release in which `@nseng-ai/ns` is genuinely bare core and Objectives arrive through the customer extension-acquisition path. At creation, source had removed the bundled Objectives capability but npm latest remained `0.1.2`, predating that unbundle. Coordinated release `0.1.3` closed the gap between landed source and the irreversible customer artifact.

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

- Revalidated after a release-candidate repair: the source-side host unbundle remains landed, the package build produces a standalone bare core, and the Objectives publish root now declares and carries all ten canonical `objective*` skill directories without duplicating their checked-in source.
- npm remains the supported customer distribution channel and the necessary package names and publisher access are available.
- Existing `ns init` and `ns extension install` behavior is sufficient for the release smoke once the customer-surface Subobjective completes its release prerequisite.

Risks:

- npm publication was completed under explicit human authorization for the exact coordinated `0.1.3` set; the irreversible-write boundary was honored.
- Workspace packages may require coordinated version or dependency publication; publishing only the two visible packages could leave registry dependency ranges unsatisfied.
- De-risked: local pack and workspace tests could conceal undeclared checkout dependencies. Packed-artifact inspection surfaced and the candidate repaired one such blocker: package checks and dry-run publication had succeeded while the standalone Objectives tarball omitted its promised harness artifacts. Preparation now asserts the exact canonical skill set and every copied `SKILL.md`; the registry-backed foreign-repository smoke subsequently proved acquisition and runtime behavior without this checkout.
- Global installs can contaminate verification. Use isolated prefixes or equivalent bounded environments and prove the invoked binary and packages come from the intended registry versions.
- The registry may partially accept a coordinated release. This did not materialize for `0.1.3`: all 20 packages published successfully and strict registry verification passed after propagation retries.
- The risk of publishing stale qualification evidence was de-risked by freshly confirming all 20 versions absent and rerunning the complete dry-run qualification immediately before publication.

## Open Questions

None. The coordinated `0.1.3` set was freshly qualified, explicitly authorized, published, and strictly verified.

## Closure

Completed with coordinated registry release `0.1.3`. Strict registry verification confirmed all 20 packages and independently inspected the bare-core and standalone Objectives tarballs. A subsequent smoke in a vanilla foreign git repository installed `@nseng-ai/ns@0.1.3`, confirmed `ns objective` was absent before acquisition, initialized Claude Code, installed `npm:@nseng-ai/objectives@0.1.3`, provisioned all ten declared Objective skills under `.claude/skills/`, and ran `ns objective list` successfully without this checkout or `ts/node_modules`.

This clears the registry-artifact and acquisition-path dependency for `ship-objectives-to-customers` and `objectives-claude-onboarding-steelthread`. The latter still owns the documented, fresh-session Claude Code lifecycle journey and remains gated on its docs-site launch slice. General release automation, self-update, extension fleet updates, and non-npm channels remain parked follow-ups.
