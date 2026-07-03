# ADR 0016 invocation re-architecture supersedes systemic #1 specifics; queue targets drifted

## Summary

Trunk rebaseline at HEAD `5668ac563`. The record's systemic resolutions and DONE rewrites
all still hold structurally, but ground truth moved under four claims:

1. **ADR 0016 superseded the systemic #1 kind assignments.**
   `docs/adr/0016-skill-invocation-context-budget.md` (commits `df5d4e355`/`9cc5b1773`,
   2026-06-26) re-architected skill invocation repo-wide. Verified via `areg skill show`:
   `setup-*` (recorded `invoke-only`), most of the objective family (recorded `normal`),
   the grill pair, `handoff-create`, and `skill-audit-improved` are now `command-backed`;
   `objective`, `brmem`, and `pr-address` remain `normal`. `COMMAND_STYLE_LOCAL_SKILLS`
   (`ts/packages/hosts/pi/src/commands/surfaces.ts`) now spans ~60 skills, and
   verified-replacement enforcement lives in areg — the recorded "`real-gateways.ts`
   allowlist" mechanism no longer matches the code. The systemic #1 deliverable itself
   holds: `areg check` "All skills OK" (2026-07-03), objective-family descriptions
   survived, and the taxonomy doc section exists (now framing the `Command: <name>` stub
   as a legacy artifact).
2. **Reach inputs to the value ranking are stale.** Several remaining queue targets
   (verified: `dignified-python`, `python-fake-driven-testing`,
   `code-resolve-merge-conflicts`) are now `command-backed` — zero ambient cost — so the
   re-audit's reach-based order (and rationales like "the pftd tree loads on most Python
   tasks") must be re-derived before the queue resumes.
3. **`pr-address` dropped off the queue.** The planned prune-to-stub assumed a
   retired-workflow tombstone; the Address Capability migration (commits `6712d2ad9`,
   `a54b2d89d`, 2026-06-28) reworked it into a live 66-line `ji address exec`
   primitive-surface skill with a real `normal` description. No remediation remains.
4. **Renames and counts.** `code-checkpoint` → `sdl-flow-cp` and `code-autobranch` →
   `sdl-flow-autobranch` (commit `6d51a05b1`); `sdl-flow-submit`'s Pi surface is now
   `ji:flow:submit` after the `sdl`→`ji` cutover. The first-party tree grew 56 → 70
   skill directories (post-audit additions out of audit scope). DONE-rewrite line counts
   are historical: `objective-refresh` was rewritten again outside this Objective
   (`5668ac563`, now 98 lines), `objective-update` grew to 183 via the Record
   Frontmatter docs (`2fa3e2e1c`), `handoff-create` is now 123. `enriched-plan-save`
   gained `references/refactor-execution-strategy.md` via unrelated work (`52d85e9d5`).

Re-verified holding: systemic #2 (grill shared paragraphs still consistent, both files
self-contained), systemic #3 (precedence list only in `lifecycle.md`; `from-plan` keeps
the inline `--branch-creation graphite` + pointer), the pftd reference-tree merge (no
`quick-reference` pointers remain), `skill-audit-improved` registration (lock entry +
`agents/openai.yaml`), the `sdl-flow-submit` move-to-reference target still unstarted
(no `references/` dir; env-var catalog inline), and the `code-gt-restack-resolve`
TEMPORARY TS-toolchain block still present (Parked gate still pending).

Provenance: objective-refresh basis target=5668ac5630b2bab397ef85b9e4cfe4d5cd84c420 from=trunk-HEAD

## Objective Impact

- `objective.md`: Thesis reframes 56 as the audit-time count and adds the ADR 0016
  ground-shift paragraph; Scope systemic #1 records the applied resolution as
  historical and superseded in its specifics; `pr-address` moved from top target to
  dropped; the value-ranking assumption is weakened (reach inputs stale); a new risk
  records that unrelated repo work keeps drifting target snapshots; a new Open Question
  asks whether the remaining queue should be re-ranked.
- `roadmap.md`: systemic rows carry 2026-07-03 re-verification notes; the per-skill row
  gains the re-derive-reach sequencing caveat; `pr-address` marked DROPPED (superseded);
  stale names/surfaces corrected (`sdl-flow-cp`, `ji:flow:submit`); DONE rows note
  post-rewrite evolution so line counts read as historical evidence.
- No status flips: systemic #1/#2/#3, the pftd merge, and the `skill-audit-improved`
  resolution stay `[x]`; per-skill remediation stays `[~]`; nothing closed.

## Follow-Ups

- Re-derive per-target reach (post-ADR-0016 invocation kinds) and re-rank the remaining
  queue before resuming rewrites.
- Re-audit `enriched-plan-save` and `objective-create` content at pickup — both changed
  shape via unrelated work after the audit.
- When the `sdl-flow-submit` move-to-reference work is picked up, confirm the env-var
  catalog relocates to `skills/sdl-flow-submit/references/`.
