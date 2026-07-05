# objective.md rebaselined to landed loader + inventory ground truth

## Summary

Trunk-style verified rebaseline of `objective.md` against `HEAD`
(`8fdc6f50661d8df81024bbcce3c722fb7411441d`). The narrative had drifted from landed
ground truth on three material facts, now corrected in `objective.md`:

- **Kernel source-path aliases removed.** `ts/packages/kernel/src/runtime/module-loader.ts`
  no longer maps `@ns/…`/`@nseng-ai/…` specifiers to absolute on-disk `.ts` paths. It is
  now 75 lines that bind only the `@nseng-ai/kernel/sdk` virtual module plus a jiti loader
  for user/repo-local extensions. `ns objective …` routes load through an injected
  preinstalled command catalog (`listObjectivePreinstalledNsCommandCatalogEntries` from
  `@nseng-ai/objectives/ns/ln-ln`, wired by the `@nseng-ai/ns` host). The removal landed in
  commit `4e939049d` ("Preinstall Objective command catalog and remove kernel source
  aliases"), confirmed an ancestor of `HEAD`. The thesis/scope previously described the
  loader as *still* resolving source paths.
- **Package inventory corrected.** The workspace is now 25 packages, 9 private
  (`@nseng-ai/kernel`, `@nseng-ai/capability-kit`, `@nseng-ai/ccc`, `@nseng-ai/flow`,
  `@nseng-ai/pi`, `@nseng-ai/pi-command-surfaces`, `nscc`, `@internal/pi-tools`,
  `@internal/typescript-style-guard`), not the stale "7 of 21". This matches the private
  inventory the roadmap already carried; `objective.md` was internally inconsistent and is
  now aligned.
- **Build/bundle step exists.** `@nseng-ai/ns` (`ts/packages/hosts/ns-cli/package.json`,
  non-private, `bin: bin/ns.js`, `files: ["bin","README.md"]`) has `build:bundle`,
  `pack:local`, `publish:dry-run`, and `smoke:checkout-free` scripts backed by
  `scripts/build-bundle.mjs`, `scripts/prepare-local-package.mjs`, and
  `scripts/smoke-checkout-free.mjs`. The thesis previously asserted no build/bundle step
  and that non-private packages ship `files: ["src"]` uniformly.

## Objective Impact

No scope, criteria, non-goal, assumption, or open-question changed in substance; this is a
fact rebaseline of `objective.md` prose plus the `9 of 25` risk count. `roadmap.md` already
reflected the preinstalled catalog, the bundle/dry-run, and the 9-package private inventory,
so it was left unchanged.

Closure is **not** earned. Completion criterion 1 (a global/`npx` install from a machine
with **no checkout** runs `ns objective list` against a foreign repo) and criterion 2 (the
**published** package includes `@nseng-ai/objectives`) are unmet: only a local tarball smoke
and a passing `npm publish --dry-run` exist, and roadmap row
`[ ] Publish a versioned @nseng-ai/ns package to npm` plus the final open question remain
open. The first real npm publish is the live long pole.

## Follow-Ups

- Perform and verify the first authorized `@nseng-ai/ns` npm publish, then confirm a
  global/`npx` install runs `ns objective …` against a foreign repo (roadmap publish row).
- Generalize bundled/preinstalled command resolution beyond the Objective catalog to the
  other first-party capabilities, keeping the `.ns/extensions/*` re-export parity test
  green.

Provenance: objective-refresh basis target=8fdc6f50661d8df81024bbcce3c722fb7411441d from=trunk-HEAD
