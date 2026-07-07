# Trust gate deferred, executable CLI-group extensions confirmed, update-composition direction set

## Summary

Session decisions (user-decided during an objective-next follow-on discussion of pi's
package model, 2026-07-07). Pi's packages documentation (`docs/packages.md` in the
installed `@earendil-works/pi-coding-agent`) was reviewed as evidence.

1. **Trust gate: deferred.** ns will **not** implement a pi-style project
   trust/approval gate (trust store + startup approval before honoring project-local
   package declarations) in this record. The trust posture stays an **explicit**
   trusted-repo assumption: ns is private/unreleased and operates in trusted
   repositories; declared extensions may be fetched and their artifacts provisioned
   under that assumption. If ns's audience widens, reopen trust gating as a fresh
   Objective with pi's trust-store/`--approve` model as the blueprint. This resolves
   the trust re-judgment roadmap row: the carried umbrella risk acceptance is
   re-affirmed with real fetch semantics on the table.
2. **Executable extensions: yes, direction confirmed.** Fetched/managed extensions
   may include **executable code**, not only passive harness artifacts — specifically,
   ns should be able to **load CLI groups dynamically** from acquired extension
   modules, mirroring pi's extension loading (pi packages load `.ts`/`.js` extension
   code into the running process, registering commands/tools/behavior). This is
   accepted as code execution from declared project extensions under the trusted-repo
   assumption. Slice ordering stays conservative: (a) acquisition, (b) passive
   harness-artifact discovery wiring, (c) executable CLI-group loading once the kernel
   extension contract is explicit. This resolves the kernel-wiring question the
   storage decision attached to the trust row.
3. **`ns update` self-update coupling: no longer rejected.** The user reversed the
   earlier framing that ns self-update stays outside `ns update`. Pi-like update
   composition — distinct self vs. packages/extensions update modes under one verb
   (cf. `pi update` / `--extensions` / `--all` / `--self`) — is on the table. The
   exact command contract (flags, defaults, diagnostics, idempotence boundaries)
   remains owned by the still-open composition roadmap row.
4. **Local-path specs: mimic pi — pointers, not copies.** Local paths point to files
   or directories on disk without copying or linking into the managed root. This
   resolves the local-path open question, superseding the earlier
   "acquisition-owned mounting" leaning from the storage decision (that update
   remains the historical record).
5. **Per-extension diagnostics: reaffirmed.** One failed acquisition must not block
   provisioning of already-present or successfully acquired modules.

Deliberately **not** mimicked from pi, in addition to the trust gate: settings-JSON
as the declaration store (ns uses `ns.toml` `extensions = [...]`) and pi's mostly
exception/progress-callback diagnostics flow (ns keeps per-extension diagnostics).

## Objective Impact

- Resolves the trust re-judgment roadmap row (`[x]`): risk acceptance continues under
  the trusted-repo contract with no consent gate, and the kernel **may** load
  executable command/CLI-group extensions from fetched managed-root modules as a
  later slice.
- Narrows the `ns update` composition row (now `[~]`): direction is pi-like
  composition with self-update coupling permitted; the concrete command contract and
  per-source update semantics still need recording before implementation.
- Resolves the "Local-path specs" open question: pointers, no copying — superseding
  the storage decision's mounting leaning.
- Revises the Scope line "Self-update of ns itself stays out of scope": the ns
  *self-update mechanism* is still not built here, but the `ns update` command
  surface may compose self-update pi-style; `objective.md` is updated accordingly.
- Widens the eventual capability direction: managed extensions are a channel for
  executable ns CLI extensions, not only passive artifact bundles. Slice one remains
  passive-only.

## Follow-Ups

- Finish the composition row: record the concrete `ns update` command contract
  (modes/flags, pinned-skip and reconcile behavior per source kind, diagnostics,
  idempotence boundaries), then start implementation slices.
- When executable CLI-group loading is implemented, define the kernel extension
  contract explicitly (discovery, registration, failure isolation) as its own
  decision or slice; do not wire it implicitly through artifact discovery.
- If ns's audience widens beyond trusted repos, open a fresh trust-gating Objective
  per the recorded blueprint.
