# Roadmap

## Work

- [ ] Ratify the capability-infrastructure ownership map
  - Inventory the files, exports, consumers, tests, publish surfaces, and dependency edges rooted in `capability-kit/src/kit`, plus only the adjacent foundation residue needed to resolve the same ownership problem.
  - Classify concerns by caller meaning and proposed owner; for each proposed module, state its interface, what complexity it hides, and why its destination satisfies package tier and subpackage conventions.
  - Reconcile proposed ownership of generation and Flow/checkpoint surfaces with their active Objectives before ratification.
  - Evidence: the inventory is source-backed, every scoped concern has a disposition, active-owner conflicts are resolved, and the proposed dependency graph has no unexplained cycle or tier violation.

- [ ] Establish precise receiving interfaces in dependency order
  - Create or deepen the lowest-level neutral interfaces and owning-package seams required by the map before migrating higher-level workflows.
  - Prefer replacing old interfaces over layering new pass-through façades on top of them.
  - Evidence: focused fake-driven tests exercise each receiving interface, with real-backend tests kept in the explicit integration lane where required.

- [ ] Migrate coherent capability and workflow clusters
  - Move host/SDK bridges, model-driven generation, Branch Memory adapters, checkpoint/worktree behavior, dispatch payload behavior, and local-machine substrate according to the ratified map rather than as one mechanical directory move.
  - Migrate live consumers, tests, package exports, and documentation in the same slice as each ownership change.
  - Evidence: each slice preserves supported behavior, relevant targeted tests and package checks pass, and no consumer remains on the superseded interface for that slice.

- [ ] Remove obsolete capability-kit and adjacent residue
  - Delete superseded `kit` declarations, internal paths, exports, compatibility shims, and empty package structure after their consumers have moved.
  - Decide from the implemented map whether a smaller coherent `@nseng-ai/capability-kit` remains or the package is retired.
  - Evidence: bounded stale-path and export searches are clean or explicitly dispositioned, package/subpackage topology checks pass, and relevant repository validation succeeds.

- [ ] Write the implemented architecture back to ontology-reshape
  - Update the connected Objective with the final ownership decisions, implementation deviations, completion evidence, and any deliberately parked ontology or context-document follow-up.
  - Ensure current architecture documentation describes implemented ownership rather than the pre-reorganization junk drawer.
  - Evidence: `ontology-reshape` carries the durable result and can resolve or reshape its capability-kit/foundation row without repeating this Objective's investigation.

## Parked

- Behavioral redesigns discovered during migration that are not required for coherent ownership.
- Cleanup of adjacent infrastructure unrelated to a scoped concern's destination or the removal of obsolete source structure.
- Broader ontology and glossary reconciliation retained by `ontology-reshape`.
