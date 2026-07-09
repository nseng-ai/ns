# Descriptor contract verified landed on trunk; closure-ready

## Summary

Forensic trunk refresh at HEAD `a814ebe365b9164fdcd31c3cf09c681be670c4f0`. Every roadmap row was
already `[x]`; this refresh independently verified the landed trunk state (the prior closure-evidence
update was written from the pre-merge PR6 branch tip). All material claims verified true against
`HEAD` plus a clean worktree:

- Legacy declaration surfaces are gone: `rg` finds no `nsExtensionManifestSchema` and no
  `discoverExtensionsInRoot` under `ts/`; `git ls-files` returns zero `repo-local-ns-extension.ts`,
  zero `preinstalled-catalog.ts`, and zero `.ns/extensions/` files.
- Descriptor SDK present: `ts/packages/kernel/src/sdk/{descriptor,command,result,...}.ts` with
  `defineExtension` / `defineCommand` / `defineRawCommand`.
- First-party packages ship descriptors and `exports["./ns-extension"]`: branch-context, flow,
  handoffs, harness-artifacts, ns-init, objectives (`src/ns/extension.ts`) and pr-feedback, retros,
  reviews (`src/ns-extension.ts`), plus slots — all using `defineExtension`.
- Kernel consumers migrated: `descriptor-catalog.ts`, `project-config/points.ts`, harness-artifacts
  `module-artifact-declaration.ts`. `ns-cli/src/cli.ts` builds its preinstalled catalog from bundled
  descriptors via `extensionDescriptorToPreinstalledCatalog`.
- `ns install <local-package-dir>` present (`kernel/src/extensions/install-command.ts`, validating
  package.json name/version and the `./ns-extension` export) with scenario coverage
  (`kernel/test/scenario/install-cli.test.ts`).
- Promoted author doc exists at `ts/packages/kernel/docs/writing-an-ns-extension.md`;
  `references/README-draft.md` is a stub pointer.
- Trust-posture update present at
  `.ns/objectives/remote-artifact-module-acquisition/updates/20260708T171326Z-descriptor-catalog-execution-trust-posture.md`.
- Self-hosting confirmed live: `ns objective list` returns real records in this checkout.

`orientation.md` was re-derived: the "What you see now — legacy" list is stale now that the migration
landed, so it was shrunk to state the surfaces are deleted; the durable Direction and Avoid
(reintroduction) guardrails are preserved.

No `objective.md`/`roadmap.md` rewrite was needed — their prose already matches the verified contract.
No Record Frontmatter (no `blocked`, no `edges`); `ns objective check` is clean (0 errors, 0 warnings).

Provenance: objective-refresh basis target=a814ebe365b9164fdcd31c3cf09c681be670c4f0 from=trunk-HEAD

## Objective Impact

- Confirms all seven completion criteria are satisfied by landed trunk state and recorded evidence,
  with the single remaining gate being a fresh full `just` green at current HEAD (the record's
  explicit final-validation criterion). The objective is closure-ready.
- Not closed by this refresh: closure and the final `just` run are handled centrally.

## Follow-Ups

- Run full `just` at HEAD and, if green, close the objective (record `## Closure` and `closed.md`).
- On close, `orientation.md` drops from the always-load set automatically.
