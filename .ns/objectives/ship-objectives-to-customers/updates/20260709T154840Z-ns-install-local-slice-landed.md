# `ns install <source>` first slice landed (local package directories)

## Summary

A trunk objective-refresh against HEAD ground truth found the record's `ns install`
acquisition-surface claims stale. Verified at HEAD:

- A built-in `ns install <source>` command now exists
  (`ts/packages/kernel/src/extensions/install-command.ts`; `ns install --help` shows it as a
  built-in: "Install a local ns extension package into managed storage and record the source
  spec in ns.toml"). It installs a **local package directory** and records the source spec in
  `ns.toml` idempotently (scenario coverage in
  `ts/packages/kernel/test/scenario/install-cli.test.ts`: install-and-record, idempotent
  rerun, and rejection of future remote source forms).
- It explicitly rejects `npm:`, `git:`, and URL source specs as "planned but not supported in
  this slice," so the customer happy-path form `ns install @nseng-ai/objectives` (by npm name)
  is **not yet reachable**.
- `ns remove` does not exist.
- `ns update` remains as previously recorded (`ns update --help`: `--extensions` provisions
  artifacts; `--self` self-update is reserved/not implemented).

Also verified current (no change needed): the `blocked:` frontmatter is already absent
(cleared in `updates/20260707T190305Z-checkout-free-block-cleared.md`); edge counterparts
`checkout-free-sdl-distribution` and `ns-skills-steelthread` are closed while
`cross-harness-parity`, `eve-parity-docs-site`, and `skill-management-subsystem` remain open;
`ns skills` (`list`/`path`/`install`) exists; `ns init` and `RealSkillMaterializer`
(`provisionFirstPartySkill`) are wired; the docs "Coming with the first release" npm gate copy
is still present in `docs-site/docs/get-started/installation.mdx`; and the Claude-Code
end-to-end verification row remains unstarted. Workspace package versions have advanced to
`0.1.2` (`@nseng-ai/ns`, `@nseng-ai/objectives`); the record's `0.1.1` published/smoke-verified
evidence is left as accurate historical fact since no `0.1.2` publish/verification is proven.

## Objective Impact

- Roadmap `ns install`/`remove`/`update` design row moved `[ ]` → `[~]`: a real
  implementation slice (local-directory install + `ns.toml` recording) has landed, superseding
  the prior "the `ns install <source>` / `ns remove` acquisition surface is not yet built"
  note. Remaining on the row: npm-name/git/URL source forms and `ns remove`.
- `objective.md` Open Question on the `ns install` surface re-marked PARTIALLY LANDED with the
  same distinction (local form shipped; npm-name customer form and `ns remove` still open).
- No completion criterion newly met. Docs un-gating and all-harness (and even Claude-Code
  first-slice) end-to-end verification remain open, so the Objective is not closure-ready.

Provenance: objective-refresh basis target=a814ebe365b9164fdcd31c3cf09c681be670c4f0 from=trunk-HEAD

## Follow-Ups

- Extend `ns install <source>` to the npm-name source form so the decided three-command happy
  path (`npm install -g @nseng-ai/ns` → `ns install @nseng-ai/objectives` → `ns init`) is
  reachable, and design/build `ns remove`.
- Still open from prior updates: verify onboarding end-to-end on Claude Code from a published
  tarball in a throwaway non-ns repo, and remove the "Coming with the first release" npm gate
  copy in coordination with `eve-parity-docs-site`.
