# Semantic Update: Handoffs and Herdr Pi adapters extracted

## Durable change

Handoffs and Herdr now follow ADR 0045's host-separation model. `@nseng-ai/handoffs` owns Handoff Artifact identity, persistence, verification, and portable skill-backed command metadata through `@nseng-ai/handoffs/api`; `@nseng-ai/pi-ns-handoffs` owns Pi registration, presentation, content-derived slugging, self-handoff lifecycle, Claude integration, and the create protocol.

`@nseng-ai/herdr` now owns host-neutral Herdr destination behavior and narrow interaction/launch collaborators without a Pi subpackage, Pi Runtime dependency, or Pi host imports. `@nseng-ai/pi-ns-herdr` binds Pi registration, launch-profile resolution, process-command construction, and interaction adaptation.

ADR 0047 records the curated adapter-composition rule. The optional `@nseng-ai/pi-ns-herdr -> @nseng-ai/pi-ns-handoffs/create-flow` edge preserves `/ns:herdr:tab:handoff`: exact optional-package absence omits only that command, while other loading failures propagate. Handoffs owns create/save-before-launch protocol; Herdr retains preflight, durable artifact verification, and destination mutation.

## Evidence

The old `@nseng-ai/handoffs/pi*` and `@nseng-ai/herdr/pi*` exports and project-local forwarding adapters were removed. `.pi/settings.json` now discovers both package manifests directly. Package typechecks and focused tests passed for Handoffs, the Handoffs Pi adapter, Herdr, and the Herdr Pi adapter, including the base/full optional Herdr catalogs and durable-reference launch scenarios.

## Remaining Objective work

Broad Pi separation remains partial: Flow and Branch Context still own Pi surfaces; the remaining Pi-native extractions and final global structural guards remain open. No publication occurred.
