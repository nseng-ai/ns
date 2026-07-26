# Architecture Decision Records

This directory is the authoritative Architecture Decision Record corpus for the current pre-public baseline.

## Baseline curation and maintenance policy

The gaps in ADR numbering are intentional. Numbers are durable locators, so retained records keep their existing numbers rather than being renumbered to produce a contiguous sequence.

This corpus reflects a one-time current-tree pre-public baseline curation exception. Records whose decisions were absorbed into retained ADRs remain available in Git history; their files were removed without rewriting history or creating an archive in the current tree.

After this baseline, accepted ADRs are immutable time-in-place records. Do not rewrite an accepted ADR to match later architecture, naming, or implementation. A later architectural change requires a new ADR that supersedes or refines the earlier record and cross-references that relationship. Put current operational guidance in mutable documentation, package READMEs, skills, tests, and automation instead.

## Accepted

| ADR  | Title                                                                                                                  |
| ---- | ---------------------------------------------------------------------------------------------------------------------- |
| 0001 | [Umbrella Objectives](0001-prose-only-synthesis-objectives.md)                                                         |
| 0002 | [Singular Handoff Namespace](0002-handoff-namespace-singular.md)                                                       |
| 0003 | [Plans Are Inert Markdown](0003-remove-typescript-planned-branch-recipes.md)                                           |
| 0004 | [PR Feedback and GitHub Package Boundary](0004-pr-address-typescript-package-boundary.md)                              |
| 0006 | [Saved Plans and Branch Context](0006-branch-context.md)                                                               |
| 0007 | [Shared Diff Parsing with `@pierre/diffs`](0007-roaster-shared-diff-parser.md)                                         |
| 0008 | [Runtime TypeScript Extension Loading with jiti](0008-jiti-extension-module-loader.md)                                 |
| 0009 | [Extension Layering and the Extension Dependency Graph](0009-extension-layering-and-peer-dependencies.md)              |
| 0010 | [Clinkr Rendered Result Contract](0010-clinkr-exit-code-semantics.md)                                                  |
| 0012 | [Clinkr Output-Volume Discipline](0012-clinkr-output-volume-discipline.md)                                             |
| 0014 | [Clinkr Confirmation and Danger Tiers](0014-clinkr-confirmation-danger-tiers.md)                                       |
| 0016 | [Skill Exposure Spends the Ambient Context Budget Deliberately](0016-skill-invocation-context-budget.md)               |
| 0017 | [Declared Package Tiers](0017-declared-package-tiers.md)                                                               |
| 0019 | [DI Seam Classification and Gateway Placement](0019-gateway-real-implementation-placement-gate.md)                     |
| 0021 | [SDK Command I/O and Progress Services](0021-sdk-command-io-and-progress-services.md)                                  |
| 0023 | [Manifest-Declared Subpackages and Edge-Significance Kinds](0023-subpackage-kinds-and-edge-significance.md)            |
| 0024 | [Objective Runner Begin/Finish Workflow](0024-objective-runner-begin-finish-decomposition.md)                          |
| 0025 | [Kind-less Mirrored Objective Edges](0025-zero-kind-mirrored-objective-edges.md)                                       |
| 0026 | [ns Product Identity](0026-rename-ji-to-ns.md)                                                                         |
| 0029 | [Public Workspace and Package Identity](0029-public-package-renames.md)                                                |
| 0031 | [Points for Extension-defined Hooks and Prompts](0031-point-system.md)                                                 |
| 0032 | [Neutral Infra Admission by External Applicability](0032-neutral-infra-admission-and-api-kind-subpackages.md)          |
| 0034 | [External-Tool Workflow Ownership Without Accretion](0034-rename-ccc-to-cmux-capability.md)                            |
| 0035 | [SDK Package and Root Author API](0035-rename-kernel-package-to-sdk.md)                                                |
| 0037 | [Objective Runner Parent-Only Publication](0037-objective-runner-parent-only-publication.md)                           |
| 0043 | [Unified Subagent Tool and Runtime Selection](0043-unify-subagent-tool-and-runtime-selection.md)                       |
| 0045 | [Release Disposition and Owner-Nested Package Ontology](0045-release-disposition-and-owner-nested-package-ontology.md) |
| 0046 | [Skill Disposition and Owner-Nested Canonical Ontology](0046-skill-disposition-and-owner-nested-ontology.md)             |

## Proposed

| ADR  | Title                                                                                    |
| ---- | ---------------------------------------------------------------------------------------- |
| 0027 | [Generation-time Review Convergence](0027-roaster-generation-time-review-convergence.md) |
