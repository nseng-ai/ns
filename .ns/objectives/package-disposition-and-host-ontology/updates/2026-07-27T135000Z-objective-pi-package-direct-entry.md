# Objective Pi Package Becomes the Direct Entry Point

## Summary

The local `@nseng-ai/pi-ns-objectives` workspace package now declares its Objective adapter in the package-level `pi.extensions` manifest. Project Pi settings load that package directly, and the redundant `.pi/extensions/objective.ts` discovery adapter has been removed along with its workspace fallback-map entry.

This changes only discovery ownership: the package still owns the same `/ns:objective:*` registration and presentation, consumes Objective behavior through `@nseng-ai/objectives/api`, and remains implemented only on the current feature branch rather than landed or published.

## Objective Impact

The direct package entry strengthens the approved host-package boundary demonstrated by the Objective extraction slice. A complete, single-owner Pi integration no longer needs a repository-local forwarding module merely to become discoverable; its package manifest is the discovery contract, while `.pi/settings.json` selects the local package for this repository.

The broad Pi separation roadmap row remains incomplete because the other extension integrations and structural guards have not been extracted or implemented.

## Follow-Ups

- Preserve direct package discovery for the remaining single-owner `pi-ns-*` adapters as they are extracted; keep project-local adapters only where repository-specific composition actually requires them.
- Reconfirm package tests, Pi command discovery, and full repository validation before landing the coordinated boundary.
- Do not claim npm availability until the adapter package is explicitly published and registry-verified.
