# Refresh rebaseline: ji core cutover landed; naming prose corrected, gap unchanged

## Summary

A verified trunk refresh found the record's naming-status claims stale: the `ji-core-cutover`
landing this record said was still pending has landed. Verified against trunk HEAD:

- The kernel bin is now `ji` (`ts/packages/kernel/package.json` `"bin": {"ji": "./src/cli/index.ts"}`);
  `ji --help` lists the `objective` extension. The prior claim "the repo's current binary is
  still `sdl`" was false.
- The package-scope sweep landed: `@sdl/kernel` → `@ji/kernel` (`ts/packages/kernel`),
  `@sdl/objective` → `@ji/objective` (`ts/packages/capabilities/objective`), `@sdl/core` →
  `@ji/core` (`ts/packages/infra/core`, with a `./managed-region` subpath export). No
  `"@sdl/` names remain in workspace `package.json` files.
- Consumer surfaces moved with it: `.sdl/` → `.ji/` (`.ji/objectives/`, `.ji/extensions/`),
  `sdl.toml` → `ji.toml` (commit d6184e4c4). `ji-core-cutover`'s roadmap is fully `[x]`
  (open, not closed); `rename-sdl-to-ji` remains open.
- The checkout-free gap is unchanged by the rename: `@ji/kernel` is still `"private": true`,
  no package has a build/publish config, and the module loader (now
  `ts/packages/kernel/src/runtime/module-loader.ts`) still resolves `@ji/...` aliases to
  on-disk `.ts` source paths. Run-from-source remains the only install path.
- Remaining-work rows verified still accurate: no `ji init` or `ji skills` subcommand
  exists, no `@ji/init` package exists, and all four objective docs pages
  (`retired website files`, `get-started/quickstart.mdx`,
  `concepts/objectives.mdx`, `tools/objective.mdx`) are still "Lorum ipsum" placeholders
  with deploys launch-gated.
- Dependency states verified: `checkout-free-sdl-distribution` is open with only its
  bundle-strategy decision `[x]`; `skill-management-subsystem` (vocabulary row `[~]`),
  the retired website Objective, and `cross-harness-parity` are all open. `ji objective check
  ship-objectives-to-customers` passes (edge mirror intact).

## Objective Impact

`objective.md` and `roadmap.md` were rebaselined: the naming paragraph now records the
cutover as landed (ji binary, `.ji/` dirs, `ji.toml`, `@ji/*` packages) instead of pending;
the thesis no longer calls the long pole "currently-unowned" (it is owned by the split
`checkout-free-sdl-distribution` Objective); all `@sdl/*` package references became their
`@ji/*` names; the module-loader path was corrected to `src/runtime/module-loader.ts`; and
this record's own frontmatter blocked/annotation prose now says `ji` for the customer
install surface. No scope, criteria, decision, or roadmap-status change — every `[ ]`/`[x]`
state was re-verified and stands.

Provenance: objective-refresh basis target=5668ac5630b2bab397ef85b9e4cfe4d5cd84c420 from=trunk-HEAD

## Follow-Ups

- Counterpart note (not edited here): `checkout-free-sdl-distribution`'s own record still
  uses `sdl`-era naming in its title, mirror-edge annotation, and roadmap (e.g. the old
  `src/sdk/module-loader.ts` path); its own refresh/update should rebaseline that.
- Scaffold `@ji/init` remains the next unblocked build slice.
