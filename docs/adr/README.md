# Architecture Decision Records

ADRs are durable records of architectural decisions as they were accepted at the time.

## Maintenance policy

- Treat accepted ADRs as historical records. Do not rewrite them just because command names, validation wiring, package names, or implementation details later drift.
- Put current operational guidance in mutable docs, package READMEs, skills, checklists, tests, or CI/Just wiring instead.
- If a later choice changes the architecture decision itself, write a new ADR that supersedes or refines the older one, and cross-reference the relationship.
- Small corrections are acceptable when they fix typos, broken links, or factual mistakes that were wrong when the ADR was written; avoid making old rationale read as if it was written after later migrations.

## Numbering

- Allocate the next number as max-in-directory plus one, and check in-flight branches for a competing allocation before landing; duplicate numbers have happened when two branches allocated concurrently.
- Six duplicated numbers (0012, 0016, 0022, 0023, 0024, 0032) were resolved on 2026-07-20 by renumbering the later-created member of each pair to 0038–0043 (first-come keeps the number). Each renumbered ADR carries a "Renumbered from" note, so references in historical records (objective updates, retros, wayfinding artifacts) that cite an old number remain resolvable.

## Index

| ADR  | Title                                                                                                                                      |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 0001 | [Prose-only Synthesis Objectives](0001-prose-only-synthesis-objectives.md)                                                                 |
| 0002 | [Singular Handoff Namespace](0002-handoff-namespace-singular.md)                                                                           |
| 0003 | [Remove TypeScript Planned-Branch Recipes](0003-remove-typescript-planned-branch-recipes.md)                                               |
| 0004 | [pr-address TypeScript Package Boundary](0004-pr-address-typescript-package-boundary.md)                                                   |
| 0005 | [Additive Plan-Management Vocabulary](0005-additive-plan-vocabulary.md)                                                                    |
| 0006 | [Branch Context](0006-branch-context.md)                                                                                                   |
| 0007 | [Roaster Shared Diff Parser](0007-roaster-shared-diff-parser.md)                                                                           |
| 0008 | [jiti for Loading User-Authored Extension Modules](0008-jiti-extension-module-loader.md)                                                   |
| 0009 | [Extension Layering and the Extension Dependency Graph](0009-extension-layering-and-peer-dependencies.md)                                  |
| 0010 | [Clinkr Exit-Code Semantics](0010-clinkr-exit-code-semantics.md)                                                                           |
| 0011 | [Clinkr TS-Native JSON Envelope](0011-clinkr-ts-native-json-envelope.md)                                                                   |
| 0012 | [Clinkr Output-Volume Discipline](0012-clinkr-output-volume-discipline.md)                                                                 |
| 0013 | [Clinkr Negative Process Exit Default](0013-clinkr-negative-process-exit-default.md)                                                       |
| 0014 | [Clinkr Confirmation and Danger Tiers](0014-clinkr-confirmation-danger-tiers.md)                                                           |
| 0015 | [CLI-Surface Conformance Decisions](0015-cli-surface-conformance-decisions.md)                                                             |
| 0016 | [Skill Invocation Kinds Spend the Ambient Context Budget Deliberately](0016-skill-invocation-context-budget.md)                            |
| 0017 | [Declared package tiers](0017-declared-package-tiers.md)                                                                                   |
| 0018 | [Four-bucket neutral-infra gateway classification](0018-four-bucket-neutral-infra-gateway-classification.md)                               |
| 0019 | [Gateway real-implementation placement gate](0019-gateway-real-implementation-placement-gate.md)                                           |
| 0020 | [Capability Gateway Backend tier, the floor of the capability layer](0020-capability-gateway-backend-tier.md)                              |
| 0021 | [SDK command I/O and progress services](0021-sdk-command-io-and-progress-services.md)                                                      |
| 0022 | [Manifest-declared subpackages inside container packages](0022-manifest-declared-subpackages.md)                                           |
| 0023 | [Subpackage kinds and edge-significance rank](0023-subpackage-kinds-and-edge-significance.md)                                              |
| 0024 | [Objective Runner begin/finish decomposition with harness-subagent dispatch](0024-objective-runner-begin-finish-decomposition.md)          |
| 0025 | [Zero-kind mirrored Objective Edges with prompting-owned semantics](0025-zero-kind-mirrored-objective-edges.md)                            |
| 0026 | [Rename ji to ns](0026-rename-ji-to-ns.md)                                                                                                 |
| 0027 | [Roaster review convergence happens at generation time](0027-roaster-generation-time-review-convergence.md)                                |
| 0028 | [Bare @nseng-ai workspace scope — no publish-time alias mapping](0028-bare-nseng-ai-workspace-scope.md)                                    |
| 0029 | [Rename generic/internal-sounding packages to their public npm names](0029-public-package-renames.md)                                      |
| 0030 | [Rename Synthesis Objective to Umbrella Objective](0030-rename-synthesis-objective-to-umbrella-objective.md)                               |
| 0031 | [Point system for extension-defined hooks and prompts](0031-point-system.md)                                                               |
| 0032 | [External-applicability Neutral Infra admission and API-kind subpackages](0032-neutral-infra-admission-and-api-kind-subpackages.md)        |
| 0033 | [Tier-projected directories, seven-tier taxonomy, and seam naming](0033-layering-reshape-tier-projected-directories-and-seam-naming.md)    |
| 0034 | [Rename CCC to the cmux capability](0034-rename-ccc-to-cmux-capability.md)                                                                 |
| 0035 | [Retire the kernel brand: `@nseng-ai/kernel` becomes `@nseng-ai/sdk` with a root author entry point](0035-rename-kernel-package-to-sdk.md) |
| 0036 | [Retire "kernel" from product-vision branding](0036-retire-kernel-from-product-vision-branding.md)                                         |
| 0037 | [Objective Runner parent-only publication after checkpoint judgment](0037-objective-runner-parent-only-publication.md)                     |
| 0038 | [Capabilities sit above the Capability Kit; the `@sdl/pi` runtime host holds no domain](0038-domain-package-layer-above-extension-kit.md)  |
| 0039 | [GitHub gateway layering and the `sdl-sdk` author package](0039-github-gateway-layering-and-sdl-sdk-package.md)                            |
| 0040 | [Autoobjective prose pattern and Objective Runner step workflow](0040-autoobjective-objective-runner.md)                                   |
| 0041 | [Rename SDL to ji](0041-rename-sdl-to-ji.md)                                                                                               |
| 0042 | [Build Pi Explore Subagents on the Runner-Subagent Substrate](0042-build-pi-explore-subagents-on-runner-subagent-substrate.md)             |
| 0043 | [Unify subagent tool and runtime selection](0043-unify-subagent-tool-and-runtime-selection.md)                                             |
| 0044 | [`extension` tier values and a path-derived incubation zone](0044-extension-tier-rename-and-path-derived-incubation-zone.md)               |
| 0045 | [Release disposition and owner-nested package ontology](0045-release-disposition-and-owner-nested-package-ontology.md)                     |
