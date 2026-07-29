# Roadmap

## Work

- [~] Settle the whole-extension README draft (first readme-driven-development pass).
  Seeded `references/README-draft.md` from the current package README, restructured into
  a whole-extension outline, with the ownership/locator/storage/CLI sections fully
  developed from the 2026-07-29 design session. Remaining stub sections (record anatomy,
  edges and blocked, skills) are marked in the draft; later passes run the
  readme-driven-development loop against this draft with `objective-update` recording
  progress.
- [ ] Author the new ADR superseding the relevant parts of ADR 0025: the `owner` Record
      Frontmatter key, `<owner>/<slug>` locator identity, owner-nested canonical storage,
      owner-local slug uniqueness, full-locator edges, and close-and-replace semantics for
      owner/slug changes.
  - Evidence: ADR accepted; ADR 0025 remains immutable with the supersession recorded in
    the new ADR.
- [ ] Implement the owner model in `@nseng-ai/objectives`: storage discovery of
      `.ns/objectives/<owner>/<slug>/`, `owner` frontmatter parsing, `check` validation
      (owner/path agreement, handle syntax, depth/hygiene rules, full-locator edge lint,
      interim tolerance for flat closed records), locator-based `list`/`show`/`check`/`exec`,
      owner grouping and `--owner` filter on `list`, `--names` emitting full locators, and
      creation-time owner resolution (explicit `--owner`, GitHub login as confirmed default,
      offline validation).
  - Evidence: package tests cover both layouts during the interim; `just` passes.
- [ ] Update the Objective skill family, `docs/objective-system.md`, and root
      `CONTEXT.md` (Objective Owner, Owner Root, Objective Locator, Objective Replacement) in
      the same change as the implemented behavior, so no standing rule contradicts the live
      model.
- [ ] Hard-cutover migration of this repository's open records to
      `.ns/objectives/schrockn/<slug>/` with `owner: schrockn` frontmatter and edge
      references rewritten to full locators; closed records deliberately stay flat.
  - Evidence: `ns objective check --all` and `ns objective list` pass on the migrated
    tree.
- [ ] Promote the settled README to
      `ts/packages/incubating/extensions/objectives/README.md` and repoint this Objective's
      reference at the promoted doc.

## Parked

- Migrate historical (closed) records under their owner directory once the feature
  settles, and retire the dual-layout tolerance in readers and `check` (the named
  upgrade for the cutover shortcut — retire both together).
- Email as a separate owner-adjacent field, only when a concrete need (contact,
  notification, commit identity) makes its semantics unambiguous.
- Team or organization ownership as a distinct concept, without weakening the singular
  individual-owner meaning of `owner`.
