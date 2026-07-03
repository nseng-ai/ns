# Post-ADR-0016 reach re-rank: queue order and prioritization rationale (reconstructed)

## Summary

Resolves the open question "Should the remaining queue be re-ranked before resuming?"
— **yes, and the re-rank is done.** Reach inputs were re-derived from current `areg`
invocation kinds (post-ADR-0016), every remaining target was re-verified against its
current content, and the queue below replaces the pre-ADR-0016 order (objective family
first, ccc/niche last) recorded by the 2026-06-20 re-audit.

**Provenance / reconstruction note:** the re-rank itself was performed earlier on
2026-07-03 in a session on branch `rename-ji-to-ns-records`; that session's
working-tree edits (its update file `20260703T194738Z-post-adr-0016-reach-rerank.md`,
roadmap row, and objective.md entry) were lost uncommitted when the worktree was
released. The full prioritization rationale survived **verbatim** inside a
branch-context plan attached to this branch, and is recorded below unchanged. The
queue list and the dropped/deferred block are reconstructed from that rationale plus
the current roadmap; the reach claims were re-verified against live `areg skill list`
on 2026-07-03 before recording (confirmed: `brmem` and `objective` are the only
remaining `normal` targets; all other queue targets are `command-backed`).

## Objective Impact

The remaining per-skill queue, re-ranked by value = lift × reach × stakes − risk with
post-ADR-0016 reach:

1. `brmem` — from-scratch rewrite.
2. `objective` — from-scratch rewrite.
3. `dignified-python` — rewrite, SKILL.md router only (version-file tree untouched).
4. `code-thermostack` — from-scratch rewrite.
5. `refactor-swarm` — from-scratch rewrite.
6. `objective-create` — from-scratch rewrite.
7. `code-gt-restack-resolve` — surgical (method capped; no rewrite).
8. `code-resolve-merge-conflicts` — surgical (method capped; no rewrite).
9. `objective-close` — surgical / near-zero-cost tail (already clean; remediate or
   record clean).
10. `ccc-available-work`, then `ccc-stack-map` — rewrite only if cheap (cmux-niche,
    lowest reach).

### Prioritization rationale

The order applies the objective's standing formula — **value = lift × reach ×
stakes − risk** (re-audit `2026-06-20T140000`) — with the reach inputs re-derived
from current invocation kinds instead of the pre-ADR-0016 assumptions.

**The reach model post-ADR-0016 is what reshapes the queue.** A `normal` (ambient)
skill pays its description into every agent session's context and loads its full
SKILL.md body whenever the model ambiently routes to it — its remediation pays on
every session. A `command-backed` skill has zero ambient cost: its description is
never ambiently loaded and its body loads only when a user explicitly invokes the
command, so its reach collapses to explicit invoke-frequency × on-load size. Thirteen
of the fifteen re-verified targets are now `command-backed`; only `brmem` and
`objective` remain `normal`. Consequence: ambient targets dominate the queue
regardless of how confirmed the duplication is elsewhere — even a verified
triplication in a `command-backed` skill taxes tokens only when someone types the
command, while sprawl in an ambient skill taxes routing continuously. Within the
`command-backed` majority, the tiers are: confirmed-duplication rewrites (3–6)
ordered by lift × plausible invoke-frequency, surgical targets (7–9) ordered by
stakes with risk capping their *method* rather than their position, and the
cmux-niche pair (10) last, gated on being cheap.

Per-position reasoning:

1. **`brmem` (rewrite)** — maximizes every factor at once. *Reach:* one of only two
   remaining ambient targets, and branch memory underlies handoffs, prompt-plugin
   resolution, and branch-scoped notes, so ambient routing to it is plausible across
   many workflows — the widest expected footprint in the queue. *Lift:* the largest
   SKILL.md in the queue at 334 lines (grown from 296 at audit time), with sprawl
   confirmed on re-read — twelve top-level sections, a separate section per command
   (Store, Read, Export, Check, Copy, GC, Delete, …), plus a "Command chooser" that
   partially restates those sections. *Stakes:* the canonical instruction surface for
   how any agent calls `brmem`; other skills depend on agents getting it right (e.g.
   `handoff-create`'s storage step routes through `brmem put`), so clarity
   improvements propagate widely. *Risk:* real but **subtracted, not disqualifying**
   — the same blast radius is why `brmem` was previously held back as an "elevation
   candidate" rather than a lead target; under the formula, risk is a deduction
   mitigated by the extract-contract-then-diff gate (now passed on four rewrites),
   while the outright veto is reserved for safety-critical / rigid-output-contract
   skills, which take the surgical path instead.
2. **`objective` (rewrite)** — the only other ambient target, so it shares `brmem`'s
   reach class and outranks every `command-backed` skill. *Lift:* half `brmem`'s size
   (164 lines) with only moderate sprawl — it grew via the Record Frontmatter section
   rather than accumulating per-command duplication — so its lift × reach product is
   smaller. *Stakes:* high — it is the family's shared grounding (vocabulary,
   selection rules, storage model, safety boundaries) that every objective-family
   command skill leans on. *Risk:* moderate; same rewrite gate applies.
3. **`dignified-python` (rewrite, SKILL.md router only)** — leads the
   `command-backed` tier because its debt is the most concrete and the cheapest to
   collapse. *Lift:* the reference router is stated three times (the frontmatter
   `references` list, the "Reference Documentation Structure" catalog, and the "When
   to Read Each Reference Document" trigger section) plus a "How to Use This Skill"
   recap — verified on re-read. *Scope:* only the SKILL.md router collapses; the
   version-file tree stays as-is (version files are independent — re-audit
   `2026-06-20T140000`). *Reach:* Python-standards work is a recurring explicit
   invoke even in a TS-first repo. *Risk:* low — routing prose, no safety contract.
4. **`code-thermostack` (rewrite)** — *Lift:* the subagent contract is restated in
   three places (Safety boundaries, §2 review collection, §5 implementation) —
   verified on re-read. *Stakes:* that contract carries safety boundaries
   (subagents must not branch/commit/push), and duplicated safety prose drifting
   apart is precisely this objective's core failure mode, so collapsing it to one
   home is worth more than its invoke-frequency alone suggests. *Risk:* moderate —
   contract-bearing prose, so the extract-contract-then-diff gate matters here.
5. **`refactor-swarm` (rewrite)** — *Lift:* the "Key design decisions" section
   restates rationale already carried by "The pattern" and "Batching strategy", and
   the examples are partly redundant (the second, judgment-light example is genuinely
   boundary-illustrating and should survive the rewrite). *Reach:* slightly higher
   than at audit time — the canonical refactor-execution-strategy guidance (extracted
   by commit `52d85e9d5` and referenced from `enriched-plan-save`) now routes 5+ file
   refactor plans toward `refactor-swarm`, so it is read at planning time too.
   *Risk:* low.
6. **`objective-create` (rewrite)** — last in the rewrite tier because its debt is
   the most modest and partially regrown rather than original. *Lift:* the body has
   grown via the Record Frontmatter / edge-mutation documentation (commit
   `2fa3e2e1c`); its "Required shape" section overlaps the family umbrella, but the
   family skills are deliberately self-contained, so the genuinely collapsible
   surface is smaller than the overlap suggests. *Stakes:* family-alignment value —
   keeping it consistent with the already-rewritten `objective-update` /
   `objective-refresh` styles. *Risk:* low-moderate.
7. **`code-gt-restack-resolve` (surgical)** — first in the surgical tier because its
   duplication is verified and well-bounded. *Debt:* the TS-toolchain rule is written
   at two sites (~lines 52–78 and ~246–247), confirmed on re-read; the TEMPORARY
   TS-toolchain block itself stays parked on the external toolchain rollout, not on
   this objective. *Stakes:* conflict resolution during restacks — an error here
   corrupts real merges. *Risk:* rigid output contract + high stakes is exactly the
   profile the re-audit barred from from-scratch rewriting; method capped at
   surgical.
8. **`code-resolve-merge-conflicts` (surgical)** — same safety-critical profile,
   ordered after `code-gt-restack-resolve` because its debt is assumed rather than
   verified (223 lines; not re-read line-by-line during the re-rank). The binding
   constraint is the risk of silently softening a safety rule, so the method is
   capped at surgical regardless of what the pass finds.
9. **`objective-close` (surgical)** — already clean (78 lines, lift 1). It stays in
   the queue only because the completion criteria require every ≥5 audit target to be
   remediated or explicitly dropped with a reason; as near-zero-cost work it is the
   natural tail rather than worth doing earlier.
10. **`ccc-available-work`, then `ccc-stack-map` (rewrite, only if cheap)** —
    duplication is confirmed (collection commands appear in both the "Data sources"
    and "Read-only command recipe" sections of each), and historic lift was rated
    5 / 4, but both are cmux-niche with the lowest invoke-frequency in the queue, so
    reach suppresses their value below everything above. `ccc-available-work` (239
    lines) before `ccc-stack-map` (163 lines) on sheer collapsible volume. If they
    are not cheap when reached, dropping them with a recorded reason is acceptable
    under the completion criteria.

**Standing caveat / revisit trigger:** "ambient reach" here is a qualitative judgment
derived from the invocation kind (`normal` = description always loaded, body on
ambient routing), not a measured invocation frequency. If `brmem` turns out to be
rarely routed to ambiently in practice, the case for it over `dignified-python`
weakens and positions 1–3 could flip. The order assumes ambient presence dominates,
consistent with the objective's own reach heuristic ("descriptions are always loaded
only for ambient (`normal`) skills; bodies and reference trees load only on invoke").

### Dropped/deferred with reasons (reconstructed)

The original block was lost with the source session's working tree; this list is
re-derived from the rationale's target count (fifteen re-verified targets, eleven in
the queue) and the current roadmap:

- `enriched-plan-save` — **deferred pending re-audit.** Unrelated work (commit
  `52d85e9d5`) extracted `references/refactor-execution-strategy.md`, changing the
  skill's shape since the audit; its remaining debt must be re-derived before a
  rewrite is scoped.
- `python-fake-driven-testing` — **deferred.** The reference-tree merge (the
  high-value half) is done; the remaining SKILL.md rewrite is low-value now that the
  skill is `command-backed`, and its overlap claims need re-verification at pickup.
- `branch-context-impl` — **stays dropped** (pre-re-rank decision, reconfirmed: 36
  lines, lift 1 / risk 4; a rewrite most likely softens its STOP safety contract).
- `pr-address` — **stays dropped** (superseded by the Address Capability migration;
  no remediation remains — see update `20260703T171651Z`).

- `objective.md`: the "Should the remaining queue be re-ranked?" Open Question is
  resolved (this update); the thesis note "Re-rank the remaining queue before
  resuming it" is satisfied.
- `roadmap.md`: the per-skill `[~]` row's sequencing caveat is replaced by the
  re-ranked queue and a pointer here.
- No status flips; per-skill remediation stays `[~]`.

## Follow-Ups

- Execute the queue in order, one remediation per stacked PR; rewrites pass
  extract-contract-then-diff, surgical targets stay surgical, position 10 only if
  cheap (else drop with recorded reason).
- Honor the ambient-reach revisit trigger above if evidence about `brmem` ambient
  routing frequency emerges.
