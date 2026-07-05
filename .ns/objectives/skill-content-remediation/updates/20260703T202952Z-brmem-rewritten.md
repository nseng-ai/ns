# brmem rewritten (queue position 1)

## Summary

Rewrote `skills/brmem/SKILL.md` from scratch against `writing-great-skills` — queue
position 1 of the post-ADR-0016 re-rank (update `20260703T201928Z`). 334 → 270
lines. Frontmatter, description, and the PUBLIC SKILL comment are diff-verified
byte-identical, so ambient routing is unchanged (`brmem` stays `normal`).

The extract-contract-then-diff gate was applied: a 75-item contract (triggers,
per-command CLI semantics and flags, key/namespace/branch rules, safety rules,
report shape) was extracted first and the rewrite diffed against it item by item;
all items are present. A mechanical coverage diff confirmed no CLI flag or
subcommand present in the old body is absent from the new one, and distinctive
load-bearing rules (1 MiB/`--force` cap, `.lock`/`..`/`//`/`:` key bans, detached
HEAD, `--at`, not-secret warning, XDG prompt tiers, gc dry-run default) all
survived.

What collapsed — the triple-homing between the "Command chooser" and per-command
sections: the chooser is now a pure routing table; a new "Cross-command rules"
section holds the four genuinely shared rules (branches, namespaces, Entry Key
syntax, JSON output); command-specific rules (put-overwrite, 1 MiB/`--force`, copy
scope, gc caution, mutation reporting) each live once inside their command's
section. gc semantics, previously stated in four places, now live once. Only four
sentences were deleted as no-ops; everything else was de-duplication, not deletion.

Reviewer-flagged relocations (checked, accepted): `check` exit-code semantics live
only in the check section with put carrying a pointer; the intro's gc caveat moved
wholly into the gc section; delete's post-mutation report sentence merged into the
single "Report what you did" section.

## Objective Impact

- Queue position 1 complete via the rewrite method with the gate passed (fifth
  rewrite through the gate).
- `roadmap.md`: the elevation-candidates row notes `brmem` DONE with evidence.
- Evidence: `areg check` "All skills OK"; `dprint` clean; contract + rewrite +
  report retained in the session scratchpad.

## Follow-Ups

- Queue position 2 (`objective` rewrite) is next.
