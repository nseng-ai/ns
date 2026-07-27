# ns

**Nonslop Engineering**: Tools to make clankers do awesome things rather than terrible things.

This is a large repo with many tools in active development. Most of what you'll find here — CLIs, skills, workflows — is still being built and battle-tested, which is why much of it lives in `incubating` and `internal` folders. The things listed below are the ones we currently stand behind for external use.

---

## Skills

Agent skills you can drop into your own projects. Public skills carry an explicit support commitment.

### [`pr-make-accountable`](skills/public/prs/pr-make-accountable/)

Interview a PR's author about the context the diff cannot supply — intent, design decisions, tradeoffs — then co-author a **What / Why / Changes / Reviewer focus** PR body. Not a mechanical diff summary: the skill probes politely and insistently until author and reviewer share a real understanding of the change, and it surfaces misunderstandings rather than papering over them.

Requires only `git` and an authenticated `gh` session; independent of the rest of ns.
