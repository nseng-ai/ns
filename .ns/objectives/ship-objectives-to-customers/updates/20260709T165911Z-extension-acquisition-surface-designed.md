# Extension acquisition surface designed: `ns extension` group, bare core reaffirmed

## Summary

A README-driven design session with the owner (2026-07-09) settled the extension
acquisition surface that the 2026-07-05 happy-path decision left open. The design
artifact is `references/README-draft.md` (this Objective), written as the future
customer-facing doc per the `generic-flow-extension` / `extension-descriptor-contract`
precedent, grounded in the Pi checkout (`pi install`/`remove`/`update` in
`packages/coding-agent/src/core/package-manager.ts` and `docs/packages.md`) and in the
landed kernel machinery from `extension-descriptor-contract` (managed `ns install`,
`acquisition.ts` npm-spec resolution, `ns.toml` `extensions = [...]`).

Decisions (owner-confirmed unless noted):

- **Bare core reaffirmed.** The published `@nseng-ai/ns` ships with no extensions
  bundled ("we do not want to ship with any extensions included right now"). This
  supersedes the shipped `0.1.1` batteries-included shape (objectives preinstalled) and
  restores the 2026-07-05 bare-core decision that `checkout-free-sdl-distribution`'s
  close had superseded in practice. An unbundling + republish slice is new work.
- **Admin verbs live under the `ns extension` group**, not top-level: extensions will
  accrue admin surface, and the group already exists for `point`/`points` inspection
  (mirroring the `ns skills` noun-group precedent). Top-level `ns install` is retired;
  top-level `ns update` narrows to reserved self-update, its `--extensions`
  harness-artifact mode migrating into `ns extension update`.
- **Explicit `npm:` source-spec grammar** (Pi parity: Pi accepts no bare npm names —
  unprefixed means local path). The CLI argument is verbatim the `ns.toml` entry; one
  grammar across CLI, config, and loader. Versioned specs are pinned, unversioned float.
  The 2026-07-05 happy path amends to `ns extension install npm:@nseng-ai/objectives`.
- **The removal verb is `uninstall`, mirroring `install`** (Pi's canonical `remove` is
  not adopted; no alias). Identity-matched, deprovisions manifest-tracked harness
  artifacts, never touches consumer data such as `.ns/objectives/`.
- **`ns extension update` takes exactly one required source target** — no bare
  invocation, no `--all` fleet mode in v1 (parked).
- **Repo-level `ns.toml` is the only settings home in v1** (design position taken in the
  draft; amends the 2026-07-05 "user-level settings only" note). It is what landed, it
  is git-native and team-shareable (declared-but-missing extensions auto-install on a
  teammate's first run), and the user-global root was deliberately deleted by
  `extension-descriptor-contract`. A user scope can layer on later.
- **Generic `ns init` (settled direction).** `ns init` itself is justified and stays a
  core built-in — git posture, harness selection/persistence, managed `AGENTS.md` block
  mechanics, `.ns/` scaffolding, provisioning installed extensions' artifacts. Baking
  extension-specific behavior into it (objectives instruction-block content,
  `.ns/objectives/` creation) "was a mistake" (owner). Extensions contribute activation
  content through the descriptor; the descriptor activation surface needs its own design
  slice and gates the bare-core republish.

## Objective Impact

- The `ns install`/`remove`/`update` design roadmap row is resolved; both reopened Open
  Questions from 2026-07-05 (`ns install` surface design; `ns init` core-vs-extension)
  are resolved as recorded above.
- New work replaces it: an unbundling/republish slice, a descriptor-activation design
  slice (generic `ns init`), and implementation of `ns extension
  install/uninstall/update/list` over the landed kernel machinery.
- The published-docs happy path changes shape (three commands, new middle:
  `npm install -g @nseng-ai/ns` → `ns extension install npm:@nseng-ai/objectives` →
  `ns init`), so the docs row and the Claude Code verification row now depend on the
  bare-core republish.
- A new Objective Edge to `extension-descriptor-contract` records that this design
  extends its landed `ns install` slice and descriptor contract.

## Follow-Ups

- Design the descriptor activation surface (extension-contributed instruction-block
  sections and consumer dirs; de-objectives-ify `ns-init`).
- Implement the `ns extension` admin verbs per the README draft (with `ns-cli-design`
  discipline at implementation time).
- Unbundle first-party extensions from the published `@nseng-ai/ns`, republish, and
  re-run the checkout-free smoke through the `ns extension install` path.
- Add the Pi-style blunt security note (registry installs execute descriptor code under
  the trusted-repo posture) to the customer doc when it ships.
