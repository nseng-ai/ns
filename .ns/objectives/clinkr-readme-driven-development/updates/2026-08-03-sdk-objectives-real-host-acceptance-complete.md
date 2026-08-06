# SDK and Objectives Real-Host Acceptance Complete

## Summary

SDK/host composition now preserves source identity and topology until mount. Source inventory discovers separately labelled built-in, preinstalled, and project contributions without flattening routes or applying source precedence. Modern extension descriptors contribute a filesystem command directory or modern definitions; the host mounts each source into one contextful `ClinkrApp`, calls `run()` once, and leaves recursive execution and completion to the app. Completion is app-owned rather than intercepted or reconstructed by the SDK.

Clinkr collision handling is private and scope-local: opening a scope reports its issues, poisons only colliding contributions at that scope, and leaves unrelated routes available. Sources retain disjoint ownership rather than competing through precedence. The implementation adds no public selector or topology API.

The migrated extensions now own filesystem command trees and noun subtrees rather than flat route catalogs or reconstructed groups. Flow, Branch Context, Handoffs, Slots, Reviews, PR Feedback, Skill Exposure, Herdr, and Objectives were migrated, with descriptor and module-contract follow-ups keeping their filesystem roots modern and selected loading lazy. Each host extension subtree has a single owner rather than being assembled from overlapping source fragments.

Objectives is the real-host acceptance consumer. Its filesystem tree includes the recursive hidden `objective/exec` group and twelve leaf routes. The 37-case real `ns` host acceptance suite covers root and Objective help, schema publication, all outcome statuses, format rendering, context adaptation, hidden-route invocation, route and option completion, malformed-neighbor isolation, and selected import laziness. It proves this host slice without claiming every remaining Clinkr caller has migrated.

Validation at the completed implementation tip passed `just ci`: the default lane (570 files, 6,074 tests), integration lane (50 files, 287 tests), isolated lane (6 files, 21 tests), and TypeScript style-guard lane (183 tests), together with dprint, TypeScript format, lint, typecheck, dependency checks, the real-host Skill Exposure check, and the repository-wide Objective edge sweep.

## Objective Impact

The SDK/host composition and Objectives real-host consumer roadmap row is complete. The accepted architecture has one `ClinkrApp` execution/completion owner, source inventory rather than flat routing, disjoint source ownership rather than precedence, filesystem descriptors or modern definitions, and private scope-local collision isolation. The Objective remains open: broad migration is not complete, and the later roadmap rows still own remaining callers, legacy deletion and package-root cutover, package qualification, and README promotion.

The current Objective checker baseline also remains explicit: the two historical immutable updates `2026-07-28-topology-and-source-composition-landed.md` and `2026-07-29-foundation-brmem-filesystem-acceptance-complete.md` predate the required `## Follow-Ups` check and fail it. They are intentionally preserved unchanged.

## Follow-Ups

Migrate the remaining standalone/Foundation CLIs and extension callers without broadening descriptor or topology contracts. Then delete the quarantined legacy architecture only after its importer and parity gates clear, qualify packed packages and public subpaths, finish the strongest truthful README evidence, and promote the approved README draft. Keep this Objective open until those later rows and the parent steelthread lesson are complete.
