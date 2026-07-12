# `ns extension` lifecycle group supersedes the pi-verbatim `ns update` contract

## Summary

Trunk objective-refresh verification against HEAD `c1cb8d5d3e3ef65287230fd1fc9255db3d465797`.
No new decision made here — this rebaselines the record to a supersession that landed on
trunk under the `ship-objectives-to-customers` Objective (its 2026-07-09 README-driven
design of customer acquisition verbs and the subsequent implementation stack, e.g. commits
`015f5ec79` install, `4526f3a4d` uninstall, `cc2503e94`/`4c6fad40d` single-target update,
`02cf569df`/`e626b48ff`/`a80ad434d` classification/naming/TOML-scanner refinements).

Verified at HEAD:

- **The pi-verbatim `ns update` mode surface is retired.** `ts/packages/capabilities/harness-artifacts/src/ns/update.ts`
  is a reserved self-update-only surface with an empty request schema; it fails
  `self-update-not-implemented` with the message "use ns extension update <source>".
  `ts/packages/hosts/ns/test/ns-cli.test.ts` asserts `ns update --help` contains no
  `--extensions`/`--all`/`--force` and that `ns update --extensions` exits as a usage error
  ("rejects the retired top-level extension update flags").
- **Replacement surface:** the `ns extension` group in `@nseng-ai/ns-init` —
  `install` (acquire + record exact spec in `ns.toml` + full activation reconciliation,
  init-before-install enforced, exact-spec idempotent), `update <source>` (single-target,
  `--dry-run`, acquisition intents `refresh-floating` / `ensure-pinned` / `local-in-place`,
  no `ns.toml` change), and `uninstall` (identity-matched, managed-project removal with
  scope pruning). The pinning semantics this record decided survive inside those intents.
- **Removal is no longer deferred:** the 2026-07-07 contract's "removed specs are
  report-only; removal verb deferred" is superseded by the real `ns extension uninstall`
  verb (`ts/packages/capabilities/ns-init/src/ns/commands/extension-uninstall.ts`).
- **Arrival paths changed under the descriptor migration** (now-closed
  `extension-descriptor-contract`): no source scans committed `.ns/extensions/` or XDG
  roots anymore — extensions are preinstalled first-party descriptors or declared
  `ns.toml` specs resolved via `ts/packages/kernel/src/project-config/points.ts`; `git:`
  specs are rejected early as unsupported diagnostics.
- **Still true / still open:** per-package managed npm projects at
  `.ns/managed-extensions/npm/<pkg>/node_modules/<pkg>` are implemented
  (`managed-extension-paths.ts`), with `--no-save --package-lock=false --ignore-scripts
  --legacy-peer-deps` installs and lock-residue removal; the self-update mechanism remains
  unbuilt; real-remote end-to-end evidence remains absent (acquisition/adapter tests use
  fake exec channels only). Edge counterpart `skill-management-subsystem` is open; this
  record carries no `blocked:` sentence.

## Objective Impact

- `objective.md` and `roadmap.md` rebaselined: the command-contract decision and the
  pi-verbatim surface implementation row are marked implemented-then-superseded with the
  evidence above; the customer verb surface is recorded as owned by
  `ship-objectives-to-customers`, while this record keeps the acquisition substrate, the
  real-remote evidence row, and the self-update row.
- Completion criteria reworded to the surviving semantic core (declare → fetch → provision
  through the activation core; pinned/floating/local semantics; idempotence) instead of the
  retired `ns update --extensions` invocation. Not closure-ready: real-remote end-to-end
  evidence and the self-update mechanism are still outstanding completion criteria.
- The historical decision updates (`20260707T200657Z-...` and earlier) remain the
  immutable record of what was decided and shipped at the time; this update is the
  correction of record for their superseded portions.

## Follow-Ups

- Stale breadcrumbs of the retired surface remain in code/docs:
  `ts/packages/capabilities/harness-artifacts/src/reconcile.ts` (target-not-declared
  message still says "before running ns update --extensions <target>") and
  `ts/packages/kernel/docs/writing-an-ns-extension.md` (says `ns update --extensions`
  provisions into harness roots). Cleanup belongs with the surface owner
  (`ship-objectives-to-customers`) or an opportunistic drift fix.
- The real-remote evidence row overlaps `ship-objectives-to-customers`' bare-core
  unbundle + checkout-free verification rows; when those land, carry their evidence here
  and re-check closure readiness (only self-update would remain).
- Pre-existing `ns objective check` errors persist: the two immutable 2026-07-07 updates
  use lowercase `## Objective impact` / `## Follow-ups` headings (4 structural errors,
  documented in `updates/20260709T154848Z-...`); they cannot be retroactively fixed.

Provenance: objective-refresh basis target=c1cb8d5d3 from=trunk-HEAD
