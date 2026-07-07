# `ns update` acquisition command contract decided (pi-verbatim modes; self-update enters the roadmap)

## Summary

Decision (user-decided via grill session, 2026-07-07). This resolves the last open
design row — how acquisition composes with `ns update` and the per-source
update/pinning command contract — completing the direction set in
`updates/20260707T193019Z-trust-deferral-executable-extensions-and-update-composition-direction.md`.

### Modes and defaults (pi-verbatim; user chose this over the extensions-default recommendation)

- **Bare `ns update` = self-update only**, mirroring `pi update`. It does **not**
  acquire extensions or reconcile artifacts.
- **`ns update --extensions`** = acquire declared `ns.toml` `extensions = [...]`
  specs into the managed root **and** run the existing artifact reconcile/provision
  flow. This is where today's bare-`ns update` behavior moves. (Breaking change to
  the current command; acceptable under ns's private/unreleased contract.)
- **`ns update --all`** = self-update + extensions.
- **`ns update --self`** = explicit synonym for bare `ns update` (self only).
- **Interim behavior until the self-update mechanism ships:** bare `ns update` (and
  `--self`) **fails with a clear diagnostic** — self-update not yet implemented; use
  `--extensions`. No silent no-op, no success exit for doing nothing, and no
  temporary default that would flip meaning later. The flag contract is stable from
  day one.
- Existing `--dry-run`/`-n` and `--force`/`-f` carry over and apply to the
  extensions mode (acquisition + reconcile preview / clobber override) as today.

### Per-spec targeting (included in the contract)

- `ns update npm:@foo/bar` (positional spec) and `ns update --extension <spec>`
  update **one declared extension**: the spec must match an entry in `ns.toml`
  `extensions`; acquisition/reconcile runs for that spec while others are left
  untouched. A spec not declared in `ns.toml` is a diagnostic, not an implicit
  install. Implementation may land in a later slice than whole-list update, but the
  contract is recorded now so the surface does not reshape.

### Per-source update semantics (confirming the grammar decision's pinning posture)

- **`npm:pkg@version`** — pinned. Installed if missing from the managed npm project;
  otherwise **skipped** by `--extensions`/`--all` updates. Changing the pinned
  version in `ns.toml` reconciles the managed install to the new declared version.
- **`npm:pkg`** — unpinned. Each `--extensions`/`--all` update reconciles the
  managed install to the registry's **current resolution**.
- **`git:host/user/repo@ref`** (reserved source kind) — the clone is **reconciled to
  the declared ref** (fetch/reset/clean per the fetch-mechanics decision), never
  advanced past it. Moving to a new ref means editing the spec.
- **Local paths** — pointers, not copies (per `20260707T193019Z`). There is nothing
  to fetch or update; `--extensions` validates the path exists and emits a
  per-entry diagnostic if it does not.

### Diagnostics, idempotence, removal

- **Per-extension failure isolation (reaffirmed):** a failed acquisition (network,
  registry, malformed spec) is a per-extension diagnostic and does **not** block
  acquisition of other specs or provisioning from already-present modules.
- **Idempotence:** repeat `ns update --extensions` with unchanged specs is
  idempotent — pinned specs skipped, unpinned specs that resolve to the same version
  result in no manifest churn, unchanged artifacts report unchanged.
- **Reconcile-to-spec:** changing any spec (version, ref, path) reconciles the
  managed state to the declared spec on the next `--extensions` update.
- **Removed specs: report-only.** A spec removed from `ns.toml` surfaces through the
  existing orphan-detection path as diagnostics; `ns update` does **not** delete the
  managed install or provisioned artifacts. A deliberate removal verb (pi's
  `pi remove` analog) is deferred and not part of this contract.

### Self-update enters the roadmap (user instruction)

Choosing pi-verbatim defaults makes bare `ns update` self-update-only, so the ns
**self-update mechanism** graduates from "explicitly not built here" to a roadmap
implementation row in this record (sequenced after the acquisition slices; the
interim error contract above holds until it lands). `objective.md`'s scope wording
is revised accordingly.

## Objective Impact

- Resolves the `ns update` composition roadmap row (`[~]` → `[x]`) and the two
  remaining Open Questions (composition mode/flag shape; update-semantics command
  contract). All design rows are now decided; implementation slices are unblocked.
- Revises Scope: the ns self-update mechanism is now **in scope** as a late
  implementation row (was: "Building the ns self-update mechanism stays out of
  scope").
- Breaking surface change recorded: today's bare-`ns update` reconcile behavior
  moves under `--extensions`; bare `ns update` errors until self-update ships.
- Removal/uninstall verb explicitly deferred (not parked scope creep: report-only
  orphan diagnostics are the slice-one contract).

## Follow-Ups

- Begin implementation slices per the roadmap: ns-toml `extensions` schema, npm
  acquisition behind the gateway, discovery/reconcile wiring under `--extensions`,
  per-spec targeting, then the self-update mechanism row.
- When the removal verb is eventually wanted, decide it as its own recorded
  decision (managed-install pruning + artifact de-provisioning), starting from pi's
  `pi remove`.
