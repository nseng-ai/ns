# Adopt the Approved Disposition Ontology as Package-Curation Direction

## Summary

Subobjective `package-disposition-and-host-ontology` settled the package-curation design:
the user approved ADR 0045 and its complete destination map on 2026-07-25. The accepted
architecture replaces this umbrella's interim two-zone/flat-incubator direction with three
mutually exclusive disposition roots (`public`, `incubating`, `internal`), owner-nested
ontology (including `hosts/pi/`), global leaf/package-identity matching, npm scope by
disposition, and disposition dependency closure, landing as one atomic reorganization.

This record's live guidance is now reconciled: `objective.md` scope, completion criteria,
assumptions, and risks; `roadmap.md`; and `orientation.md` no longer direct agents toward
completing the flat `ts/packages/incubator/` layout or the standalone zone dependency
invariant. Both are subsumed by the child's cutover and guards. Historical updates and
ADR 0044 remain unchanged as time-in-place records.

## Objective Impact

- The former "complete the two-zone reorganization" and "enforce the zone dependency
  invariant" roadmap rows are merged into one delegation row owned by the child
  Subobjective; the `hosts/ns` → Branch Context/Harness Artifacts gate carries over as
  the child's public-closure repair obligation.
- Open question resolved: which hosts, standalone tools, and internal tools belong where
  is now answered package-by-package by the approved destination map
  (`.ns/objectives/package-disposition-and-host-ontology/references/package-destination-map.md`);
  Pi Editor Mods is internal, ns extensions and extracted `pi-ns-*` adapters start
  incubating, and `@nseng-ai/ns` lands at `public/ns/`.
- Assumption revised: the hosts/tools placement verdict is settled by ADR 0045 rather
  than pending; the "incomplete isolation" risk now points at disposition dependency
  closure as the replacing invariant, enforced only when the child's cutover lands.
- `orientation.md` was re-derived so always-loaded guidance stops steering agents toward
  the superseded flat-incubator destination.

## Follow-Ups

- Synthesize the child's landed cutover result here once the atomic reorganization lands.
- Revisit the Objectives extension's Branch Context/Flow single-player boundary question
  alongside the child's `@nseng-ai/ns` dependency repair.
- Reconcile `references/root-readme-positioning.md` terminology when the presentation
  slice starts (unchanged by this update).
