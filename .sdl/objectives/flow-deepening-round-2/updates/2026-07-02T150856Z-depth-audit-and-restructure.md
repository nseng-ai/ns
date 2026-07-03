# Depth Audit, Decisions, and In-Place Restructure

## Summary

A post-completion depth audit of the three delivered slices found they shipped
consolidation and co-location, while two of the three checked rows overstated
interface depth:

- **Channel (review #1).** The row's evidence claimed tests drive "a scripted
  channel instead of the outermost `pi.exec`". No test imports
  `graphite-command-channel.ts`; land scenario tests script `pi.exec` directly
  (`ScriptedExec` in `test/unit/land-stack-command-scenarios.test.ts`) and
  assert on literal `gt`/`git` argv. The promised scripted-channel adapter was
  never built — the channel seam has one adapter. Additionally: `runRaw` sits
  on the interface with zero external callers; arg-building remains
  caller-side via seven exported builder functions; `graphite-maintenance.ts`
  still branches on `maintenance.kind` to select a channel method. The slice's
  own update deferred operation-shaping ("more operation-spec-shaped") under
  "Follow-Ups: None".
- **Autobranch (review #2).** The review's metric was "3 edits to add 1
  failure → 1". Shipped: the classify and format switches
  (`latest-commit-transaction.ts:328` / `:345` and the dirty twins) were
  co-located into arm-owning files but remain switches — adding a failure is
  still three edit sites, now in one file. Co-location delivered; the
  per-failure catalog was not.
- **PR description (review #3).** Matches its proposal. One residue: the
  unified path accepts `fingerprintPolicy: "skip-current" | "force"`, but
  `commands/regenerate-pr.ts:67` hardcodes `"skip-current"` while the
  command's `--force` is a documented compatibility no-op — no user or script
  path can force regeneration of a fingerprint-current body (including the
  legitimate re-roll case: generation is nondeterministic, so same-fingerprint
  regeneration is meaningful).
- **Parked #4 (sdl-land round trip).** Its sequencing note deferred to "any
  land extraction", but no active Objective owns that extraction — this
  Objective's own assumptions verified that on 2026-07-01. The item was parked
  against a phantom dependency. The six stack representations exist *because*
  the land migration stopped halfway; the compatibility boundary is a
  standing wrapper generator, plausibly the main accretion cause behind
  successive Flow deepening rounds.

Decisions taken with the user (grilling session, 2026-07-02):

1. **Restructure this Objective in place** (slug unchanged) rather than
   spawning successor records. It absorbs: its own residuals, the promoted
   parked items, and the Land Domain extraction that dissolves #4.
2. **Scripted `pi.exec` is the canonical land test seam.** The channel seam is
   not a substitution seam: one adapter, no scripted-channel adapter planned.
   Revisit trigger: a second real consumer of the channel (e.g. submit's
   Graphite calls migrating onto it). Argv-level scripting stays the stronger
   contract even after operation-shaping, because it is the only layer that
   verifies emitted args.
3. **`regenerate-pr --force` gets full force semantics**: regenerate even when
   fingerprint-current *and* skip the confirmation prompt, consistent with
   land's `--force` (`core/land-stack.ts:145` → `shouldPrompt` suppression in
   `land/post-landing-slot-cleanup.ts:52`). Implementation must check
   confirmation danger-tier conventions before wiring the bypass and delete
   the no-op doc sentence (`regenerate-pr.ts:28`) and notice (`:180`).
4. **#4 resolves by dissolution, not consolidation**: complete the land
   migration onto the Land Domain Core (`flow/src/land/`, four-gateway
   `LandContext`), then retire the compatibility round trip. Consolidating the
   round trip first would polish a structure whose documented purpose is to
   disappear.
5. **#6 and #7 promoted from Parked to Work**; the autobranch one-edit-site
   catalog joins #7 as one shared failure-catalog idiom. **#5 stays Parked**,
   sequenced behind the extraction (migration changes its inputs), with its
   premise correction recorded: slice #1 absorbed Graphite start/finish
   streaming into the channel, so its three-file inventory needs re-derivation.
6. The Objective becomes **execution-friendly** (Definition of Progress +
   Runner Policy + row-level `Policy:` prose) so a less capable runner can
   execute rows without re-deriving this analysis.

## Objective Impact

`objective.md` is rewritten in place: new title and thesis (the halfway land
migration is the accretion generator; this round finishes the interfaces it
started and retires the generator), depth-invariant completion criteria,
execution policy sections, refreshed assumptions/risks and open questions.
`roadmap.md` is restructured: the three delivered rows stay checked with
corrected evidence wording; six new Work rows and one Parked row carry the
residuals, promotions, and extraction. `orientation.md` is added: the
extraction direction is now a standing rule other agents must respect.
Historical updates remain untouched; this update is the correction record.

## Follow-Ups

- All tracked as roadmap rows; no untracked residue from this audit.
- Optional, unowned: distill `architecture-review.html` diagrams to Markdown
  if any future row needs detail beyond what its row prose now carries.
