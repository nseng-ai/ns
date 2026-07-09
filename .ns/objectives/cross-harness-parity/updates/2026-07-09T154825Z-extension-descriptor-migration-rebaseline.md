# Refresh: `.ns/extensions/` directory replaced by descriptor-based `ns` extension wiring

Provenance: objective-refresh basis target=a814ebe365b9164fdcd31c3cf09c681be670c4f0 from=trunk-HEAD

## Summary

Forensic trunk refresh against HEAD (`a814ebe36`), 93 repo commits after the last
refresh basis (`9fa6a502d`, the 2026-07-07 "contract holds at HEAD" refresh). The
verified parity contract still holds; the four open gaps all persist. One material
mechanism drift was found and corrected: the extension-wiring substrate migrated
from a `.ns/extensions/` directory to descriptor-based loading.

Verified TRUE at HEAD:

- Package scope is `@nseng-ai/*`; no `@ns/` scope survives under `ts/packages/`. All
  landmarks resolve (`@nseng-ai/{flow,ccc,capability-kit,foundation,clinkr,pi}`,
  `hosts/ns-cli` = `@nseng-ai/ns`). The single `ns` bin is owned by `@nseng-ai/kernel`.
- Model-slug seams present (`infra/foundation/src/primitives/model-slug.ts`,
  `capability-kit/src/kit/model-slug.ts`, `capability-kit/src/cmux/focused-terminal-tab.ts`).
- **cmux dispatch gap persists.** `ccc/src/cmux/{dispatch-from-trunk,dispatch-prompt,slot-dispatch-plan,slot-open-branch,prompt-file}.ts`
  remain Pi-only. `ccc` `bin.ccc` = `./src/ns/cli.ts` still exposes only the hidden
  `exec` group with `autobranch` + `cmux-workspace-summary`; no dispatch command.
- **flow doctrine gap persists.** Exactly four `ns-flow-*` wrapper skills exist
  (autobranch, branch-latest-commit, cp, submit), installed in `.claude/skills` and
  `.agents/skills`; land/push/autoslot/changes/pull-trunk/regenerate-pr still have no skill.
- **command-output summaries** still unimplemented in `ts/packages`.
- **parity-table full sweep** still not run; the table remains STALE (three renames behind).
- `registerCliCommandExtension` (the free Pi mirror) still present in the Pi host.

Corrected drift — extension descriptor migration:

- The `.ns/extensions/` directory is **gone** (verified: `git ls-files .ns/extensions/`
  empty, directory absent at HEAD). It was replaced by descriptor-based wiring: each
  capability package exposes `exports["./ns-extension"]` as a typed descriptor module,
  discovered via the kernel's preinstalled descriptor catalog plus `ns.toml`-declared
  descriptors (with a source-dev fallback in this repo). Kernel README/CONTEXT document
  the precedence: built-in host commands < preinstalled descriptor catalog < `ns.toml`
  project descriptors.
- First-party capabilities exposing `./ns-extension` at HEAD: branch-context, flow,
  handoffs, harness-artifacts, ns-init, objectives, pr-feedback, retros, reviews, slots.
  `@nseng-ai/ccc` exposes no `./ns-extension` and is not wired — the reachability
  conclusion (ccc dispatch uncovered) is unchanged; only the wiring mechanism changed.
- Fixed in `objective.md` (Thesis naming note + Assumptions substrate bullet + the
  cmux "shared TS ≠ shared CLI" risk + the cmux-dispatch Open Question), `roadmap.md`
  (cmux dispatch row), and the `parity-table.md` STALE banner meta text.

Checked, does NOT widen scope: the new descriptor capabilities (harness-artifacts,
ns-init, pr-feedback, slots) carry no `src/pi/` registration dirs, so they add no new
Pi slash-command surfaces. The parity table's Pi-surface scope is unchanged; the
pending full sweep stays a rename/verification task, not a new-surface enumeration.
A separate `generic-flow-extension` Objective now exists (adjacent, no edge to this
record); not touched.

## Objective Impact

No change to thesis, scope, completion criteria, non-goals, or the four open roadmap
items. The push-down-substrate mechanism was rebaselined from the retired
`.ns/extensions/` directory to descriptor `./ns-extension` exports; every parity
verdict and gap conclusion is unchanged. No scope closed; no completion criterion is
newly met. Objective record frontmatter has no `blocked:` sentence, so no
Blocked-Sentence re-judgment applied; the `ship-objectives-to-customers` edge is
untouched.

## Follow-Ups

- Run the parity-review full sweep (three renames of drift; `/code:*`→`/ns:flow:*`
  surface renames; ccc-bin repair-or-retire; former `dev-preview-url`/`objective-current`
  reachability), and while sweeping consider whether any of the new descriptor
  capabilities (slots, pr-feedback, harness-artifacts, ns-init) warrant table rows.
- Resolve the FULL doctrine (wrapper skill vs typed metadata) and encode it in the
  parity-table rules.
- Pre-existing structural nit (not corrected — immutable update): the historical
  `updates/2026-06-12T092315Z-autobranch-cli-entry-and-skill.md` lacks the required
  `## Summary` / `## Objective Impact` / `## Follow-Ups` headings (`ns objective check`
  reports 3 errors on it).
