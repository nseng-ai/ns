# refactor-swarm rewritten (queue position 5)

## Summary

Rewrote `skills/refactor-swarm/SKILL.md` — queue position 5. 173 → 138 lines.
Frontmatter byte-identical. 35-item contract diff passed.

The "Key design decisions" section collapsed entirely, each rationale folded into
the site where it binds (tier and one-agent-per-file → dispatch step; wave
checkpointing → Batching; boundary constraints → their subsection;
consistency-not-enforced → When NOT to use). Applicability conditions moved up
front for planning-time readers (the refactor-execution-strategy guidance routes
5+ file plans here). The judgment-light f-string-logging example survived as the
boundary illustration, per the re-rank's explicit call; the mechanical rename
example died with its two load-bearing facts relocated (wall-time payoff → intro,
intentional-exceptions instance → verification step). The under-5-files exclusion
moved from the NOT list into the "5+ files" trigger bullet — meaning verified
preserved.

## Objective Impact

- Queue position 5 complete via the rewrite method with the gate passed.
- `roadmap.md`: refactor-swarm target row flips to DONE with evidence.
- Evidence: `areg check` "All skills OK"; `dprint` clean; contract + report in
  session scratchpad.

## Follow-Ups

- Queue position 6 (`objective-create`) next.
