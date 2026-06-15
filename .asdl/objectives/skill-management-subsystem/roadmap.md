# Roadmap

## Work

- [ ] Establish the package and command vocabulary for core ASDL/SDL usage.
      Decide the reusable package name, public CLI command names, and whether user-facing prose says skills, resources, or agent resources.

- [ ] Design the first resource model and platform path table.
      Define resource entries, catalog shape, supported entry kinds, platform aliases, user-vs-project scope, and deterministic install-plan output. Evidence should include tests for path resolution and alias normalization.

- [ ] Implement a core ASDL catalog steel thread.
      Make the core `asdl` CLI able to list, path, and install/plan at least one ASDL-owned assistant resource through the shared subsystem.

- [ ] Implement an SDL catalog steel thread.
      Make the `sdl` CLI able to list, path, and install/plan at least one SDL-owned assistant resource through the same shared subsystem instead of duplicating platform logic.

- [ ] Decide and implement first-slice entry-kind breadth.
      Either support skills, agents, and extension bundles together, or implement skills first and record a concrete follow-up boundary for agent/subagent Markdown and Pi extension bundles.

- [ ] De-risk extension reuse without implementing a marketplace.
      Document or prototype how an SDL extension could contribute a catalog without eager execution during discovery/help, then split any remaining extension work if it is larger than the core ASDL/SDL slice.

- [ ] Reconcile with existing skill workflows and docs.
      Compare the new subsystem against `skillx`, `areg`, `npx skills`, repo skill conventions, and harness skill-invocation docs so the new CLI behavior is additive and not a conflicting second workflow.

## Parked

- [ ] Marketplace or remote catalog discovery.
- [ ] Update/uninstall/version resolution.
- [ ] Full SDL extension catalog contribution implementation if it exceeds the core ASDL/SDL first slice.
- [ ] Rich Pi extension bundle install support if the first implementation ships skills only.
