# code-thermostack rewritten; subagent contract single-homed (queue position 4)

## Summary

Rewrote `skills/code-thermostack/SKILL.md` — queue position 4. 149 → 156 lines but
1712 → 1669 words (the new contract section's bullet layout costs lines, not
words); the win here is drift elimination, not length. Frontmatter byte-identical.

The subagent contract, previously restated at three sites (Safety boundaries, §2
review collection, §5 implementation), now lives in a single `## Subagent
contract` section: review clause, implementation clause, verbatim-carry rule
("every dispatch prompt must carry the role's clause below verbatim"), and the
parent-inspection duty, with capability/model-selection reference co-located. §2
and §5 route to it with no restatement.

**The gate caught real drift between the three sites** — the failure mode this
objective exists for: "commit or amend with Graphite" (Safety) vs unqualified
"commit, amend" (§5) → union takes the broader ban ("by any means, Graphite or raw
git"); "touch durable stores" vs "write durable stores" → union takes "touch";
bare "current branch" vs "already-created current branch" → union keeps
"already-created"; the parent-must-inspect duty existed only at the Safety site →
now stated once for both roles. 73-item contract diff passed; one no-op deleted.

## Objective Impact

- Queue position 4 complete via the rewrite method with the gate passed. The
  drift found and unioned is direct evidence for the objective's thesis that
  duplicated safety prose diverges.
- `roadmap.md`: code-thermostack target row flips to DONE with evidence.
- Evidence: `areg check` "All skills OK"; `dprint` clean; contract + report in
  session scratchpad.

## Follow-Ups

- Queue position 5 (`refactor-swarm`) next.
