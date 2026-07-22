# Roadmap

## Work

- [x] Establish one presence contract and deliver the generic ns mechanism.
  - Presence is the exact package identity in the effective ns command catalog, not package resolution, path identity, or command probing.
  - `ExtensionCommandEntry.requiresExtension` and `NsExtensionApi.hasExtension(packageName)` are implemented in `@nseng-ai/sdk`, documented in `ts/packages/sdk/docs/sdk-reference.md`, and composed by the ns host from the same effective package-name set.
  - SDK unit coverage includes present/absent project providers, preinstalled and commandless providers, lazy gated modules, and exact-name lookup; ns-host integration coverage proves exact package identity and rejects descriptor subpaths.
- [ ] Decouple and gate `autoslot` across both command surfaces.
  - Replace the in-process `@nseng-ai/slots/api` client in `src/autoslot/` with an injected gateway over `ns slot checkout --format json`, preserving current and named-branch modes, structured failures, and the required parent-shell navigation contract.
  - Add `requiresExtension: "@nseng-ai/slots"` to the ns command entry and make the Pi mirror omit `/ns:flow:autoslot` when exact Slots presence is absent; keep unrelated command registration lazy and unchanged.
  - Remove the Flow manifest dependency and generated lockfile edge only after production imports are gone.
  - Evidence: fake-driven gateway tests plus ns and Pi registration scenarios for present and absent catalogs; no real Slots backend in default tests.
- [ ] Make land degrade explicitly when Slots is absent.
  - Resolve `hasExtension("@nseng-ai/slots")` once at the land command boundary and pass the boolean into land composition; do not cache across invocations or infer it from paths.
  - Preserve canonical managed-Slot path detection. Repositories with no matching worktrees take the ordinary path regardless of Slots presence.
  - Before merge, a stale managed-Slot conflict with Slots absent blocks before PR mutation and gives actionable manual-detach guidance naming `@nseng-ai/slots`.
  - After a successful landing, absent Slots turns optional managed-Slot cleanup into an explicit skipped outcome and never blocks the landing.
  - Evidence: fake-driven present/absent/stale-path scenarios plus focused presentation and command-boundary tests.
- [ ] Align user-facing and code-adjacent contracts, then record delivery evidence.
  - Update the Flow README requirements, command matrix, `autoslot` integration text, and land cleanup/degraded-mode explanation to call Slots optional.
  - Recheck package manifest, ns/Pi registration, README/CONTEXT where needed, and tests for one consistent relationship.
  - Record targeted and repository validation plus material PR evidence for `slots-consumer-dependency-contracts` synthesis.

## Parked

- A generalized optional inter-capability dependency convention; write one only after another consumer proves a reusable pattern beyond the existing SDK presence primitives.
- Alternative Slot-neutral implementations of `autoslot` or land cleanup; this Objective keeps Slots as the provider and makes its use optional.
- Changes to Herdr, smart-restack, portable skills, or generic Graphite/Git helper placement; those relationships are accounted for by `slots-consumer-dependency-contracts`.
