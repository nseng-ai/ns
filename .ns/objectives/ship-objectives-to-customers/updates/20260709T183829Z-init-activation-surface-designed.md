# `ns init` activation surface designed: pointer stanza + tool-owned `.ns/instructions.md`

## Summary

A follow-up design session with the owner (2026-07-09, same day as the `ns extension`
acquisition design) settled the descriptor activation surface for generic `ns init` —
the design slice that the acquisition session had explicitly deferred. The design
artifact is `references/init-activation-design.md`, written README-driven as the future
customer-facing doc, grounded in the current `@nseng-ai/ns-init` implementation
(`activate-objectives.ts`, `init-objectives.ts`, `instruction-block.ts`) and the promoted
descriptor contract (`ts/packages/kernel/docs/writing-an-ns-extension.md`).

Decisions (owner-confirmed):

- **Trunk detection is generic git posture.** The repo + detectable-trunk requirement
  stays a core `ns init` duty; its current objectives-specific failure wording is
  reworded ns-generic.
- **Pointer-stanza architecture** (owner-proposed). `AGENTS.md` receives one minimal
  permanent fenced stanza (`ns:begin/end`) that points agents at `.ns/instructions.md`;
  all instruction content lives in that file, which ns owns completely and regenerates
  wholesale from `ns.toml` + installed descriptors on `init`/`install`/`uninstall`/
  `update`. Extension lifecycle changes never rewrite `AGENTS.md`. This dissolves the
  per-extension fence-composition question (shared fence vs per-extension fences) that
  the earlier managed-block design would have had to answer.
- **`.ns/instructions.md` is committed** — git-native, team-shareable on fresh clone
  before ns is installed, low churn. Name deliberately avoids `.ns/AGENTS.md` (harnesses
  attach semantics to that filename).
- **Plain-data descriptor `activation` field, no activation hook**: optional
  `instructions` (one markdown section appended verbatim) + `consumerDirs` (repo-relative
  under `.ns/`, created with `.gitkeep`, never deleted by ns — consumer data outlives the
  extension). Core does all file writing, preserving idempotence and surgical-uninstall
  guarantees; a hook is rejected until an extension proves data insufficient.
- **Orientations ship day-one**, as a `load-orientations` instruction line inside the
  objectives extension's contributed section (the command belongs to that extension).
  This supersedes the 2026-07-01 lean-block exclusion of `load-orientations`: that
  exclusion priced instruction upgrades against customer-owned `AGENTS.md` edits, a cost
  the pointer architecture removes. Output is computed live, so it is never stale.
- **No migration machinery.** The fat `ns:objectives:*` block exists in no real
  repository — this repo's `AGENTS.md` is hand-authored, and the fence appears only in
  `ns-init` source and tests — so migration is an in-place code/test change within the
  implementation slice, not a runtime path.

Accepted caveat: only Claude Code ambiently chain-loads `.ns/instructions.md` via
imports; Codex and Pi rely on agents obeying the pointer's imperative line. Acceptable
for the Claude-Code-first slice; recorded as a `cross-harness-parity` verification item
for the Codex/Pi end-to-end rows.

## Objective Impact

- The "design the descriptor activation surface" roadmap row is resolved; the remaining
  `ns init` piece of the reopened Open Questions is fully closed (design complete,
  implementation is roadmap work).
- A new implementation row replaces it: add the `activation` descriptor field
  (promoted-contract coordination per `extension-descriptor-contract` policy),
  de-objectives-ify `@nseng-ai/ns-init` into the pointer-stanza + regeneration
  orchestrator, move objectives' activation content into `@nseng-ai/objectives`'
  descriptor, and wire regeneration into the `ns extension` verbs. It gates the
  bare-core republish, alongside the `ns extension` verbs implementation.
- The 2026-07-01 lean-block decision is amended in one respect (orientations now
  day-one, extension-owned); the lean content itself carries over as the objectives
  section text.

## Follow-Ups

- Implement per the new roadmap row, with `ns-cli-design` discipline and the
  `extension-descriptor-contract` public-shape steer at build time.
- Verify Codex/Pi agents reliably follow the pointer line (feeds `cross-harness-parity`
  and the parked Codex/Pi verification rows).
- Reflect the pointer-stanza shape in the documentation quickstart rewrite when the docs row
  unblocks (it already depends on the bare-core republish).
