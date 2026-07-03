# Harness-artifact vocabulary and layering decisions

## Summary

Design-session update; no implementation yet. Two inputs: a fresh inspection of the local DataDog/pup checkout (verifying and extending `references/pup-skill-management-report.md`), and explicit user decisions on vocabulary and system layering.

Pup inspection deltas (recorded here; the reference report remains accurate and unamended):

- Pup's skills subsystem has no verification, no content hashing, no version tracking, no install manifest, and no uninstall. Installs unconditionally overwrite existing files, including user-edited ones; catalog renames orphan previously installed directories; there is no re-install notice after binary upgrades, so installed content goes silently stale.
- `SkillEntry` has no version field; SKILL.md `metadata.version` frontmatter is embedded and written verbatim but never parsed or compared. Binary version, skill frontmatter versions, and plugin-manifest versions are three unrelated numbering schemes.
- Pup honors `CLAUDE_CONFIG_DIR` for user-scope Claude Code installs (recent upstream change; our harness path table should include it from day one).
- `pup skills install` sits on a local-only allowlist and writes to disk even under `--read-only`.
- Pup has no interop with or acknowledgement of the `npx skills` ecosystem, though it emits the compatible SKILL.md format.
- Pup's separate binary-plugin subsystem (`pup extension`, `src/extensions/`) does SHA-256 verification against release checksums with a JSON install manifest — integrity machinery applied exactly where content crosses a trust boundary, and a naming collision ("extension") to avoid inheriting.

Decisions:

- **Vocabulary.** Domain term is **harness artifact**: content provisioned into an agent harness's directories and consumed by the harness/model, with kinds `skill`, `agent`, `extension-bundle`. User-facing CLI surface says **skills** (`ji skills list/path/install`), matching ecosystem convention where "skill" is the portable cross-harness unit. **Provision** is the verb for materializing artifacts into a harness. **Harness** replaces "platform" in this domain (pup's `PlatformSpec` becomes a harness spec). AREG is re-read as the **Artifact Registry** — the advanced cross-cutting surface over the same framework. Package name not final; leading candidate `@ji/harness-artifacts`.
- **Layering.** One shared core consumed by two user-facing paths. Layer 0 (this Objective's package): static artifact catalog + harness path table + deterministic provision plans + an install manifest with content hashes (enabling stale detection after upgrades, refuse-to-clobber of user-edited files without `--force`, and rename/uninstall cleanup — everything pup lacks). Layer 1a (casual, pip-like): `ji skills`, plus extension-carried artifacts that "just appear" when an extension is installed, declared statically in the extension's package manifest (`sdl` field in `package.json`), never executing extension code during discovery. Layer 1b (advanced): AREG re-platforms onto the shared core as the proving second consumer.
- **npx-skills boundary.** The new subsystem has zero `npx skills` dependency from day one: content that ships inside an extension or this repo is provisioned by the first-party planner as a local copy. AREG's existing `npx skills add` usage is tolerated temporarily as the acquisition channel for third-party GitHub skills; replacing it is later work.
- **Entry-kind breadth.** Model all three kinds in the types; provision skills first.
- **Roadmap reordering.** Extension-carried artifact provisioning is pulled forward from parked/later into the main line: the short-term product goal is that installing an SDL extension makes its bundled or companion skills appear without the user knowing AREG exists.

## Objective Impact

- `objective.md` rewritten to the decided vocabulary: thesis/scope in harness-artifact terms; entry-kind decision recorded; extension-carried provisioning and the npx-skills boundary added to scope; the skills-too-narrow naming risk resolved by the dual-language decision; a new bare-"artifact" collision risk added (handoff artifacts, consumer artifacts, AREG's "managed artifacts" overlay sense); open questions narrowed to package-name confirmation, first harness set, install-manifest/lockfile convergence, and the extension-install hook point.
- `roadmap.md` reworked: vocabulary row now `[~]` (terms decided; package name pending); design row expanded to include the install manifest with content hashes and LBYL conflict policy; a new extension-carried provisioning row added; the reuse row names AREG re-platforming explicitly; the entry-kind decision row and the de-risk-extension-reuse row are absorbed by the above; parked list updated (third-party acquisition replacement parked; agent/bundle provisioning parked behind skills).

## Follow-Ups

- Confirm the package name (leading candidate `@ji/harness-artifacts`) and the first harness set (current lean: `pi` + `claude-code`).
- Coordinate the AREG re-platforming row with the active `migrate-areg-and-ns-skills`, `areg-typescript-port`, and `areg-ts-cli-cleanup` Objectives before implementation.
- When "harness artifact" lands in domain docs/CONTEXT files, do the collision cleanup: keep handoff artifact and consumer artifact as-is, rename AREG's "managed artifacts" overlay sense (e.g. "kind overlays").
