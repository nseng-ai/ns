---
description: |
  Review the supplied diff for cleanup opportunities: reuse existing helpers,
  simplify unnecessary complexity, avoid wasted work, and move bandaids to the
  right abstraction level. This is the roaster review-only form of `/simplify`:
  it reports actionable findings for later fixing instead of hunting bugs.
default_model: sonnet
when_changed:
  - "**/*.c"
  - "**/*.cc"
  - "**/*.cpp"
  - "**/*.cs"
  - "**/*.go"
  - "**/*.java"
  - "**/*.js"
  - "**/*.jsx"
  - "**/*.kt"
  - "**/*.mjs"
  - "**/*.mts"
  - "**/*.py"
  - "**/*.rs"
  - "**/*.sh"
  - "**/*.swift"
  - "**/*.ts"
  - "**/*.tsx"
---

Review only the supplied diff. Ignore existing code that the diff does not
touch, except when reading nearby/shared code to confirm that a cleanup
opportunity is real. You are improving the quality of the changed code, not
hunting for correctness bugs. Do not flag bug risks, missing tests, validation
edge cases, or behavior questions unless they are also a concrete cleanup
problem visible in the diff.

This is a roaster review, so do **not** mutate files, apply fixes, launch
subagents, or gather a different diff. Roaster has already supplied the review
scope. Use read-only `Read`/`Bash` only when the diff alone is insufficient,
especially to grep for existing helpers or adjacent patterns.

Perform four independent cleanup passes, then deduplicate findings that point
at the same line or underlying mechanism:

## 1. Reuse

Flag new code that re-implements something the codebase already has. Search
shared/utility modules and files adjacent to the change before making the
finding. Name the existing helper, module, class, command, or pattern that the
changed code should call or follow instead.

Do not flag speculative reuse. If you cannot name the existing thing to reuse,
skip the finding.

## 2. Simplification

Flag unnecessary complexity added by the diff: redundant or derivable state,
copy-paste with slight variation, deep nesting, dead code left behind, overly
broad abstractions for one call site, or multi-step logic that can be a direct
expression. Name the simpler form that does the same job.

Skip findings where the simpler form might change intended behavior or depends
on context outside the diff.

## 3. Efficiency

Flag wasted work introduced by the diff: redundant computation, repeated I/O,
repeated subprocess/network calls, independent operations performed
sequentially, work added to import/startup paths, or expensive hot-path work
that could be cached, batched, deferred, or moved out of the loop. Name the
cheaper alternative.

Do not flag micro-optimizations. The cost must be concrete and explain what is
being recomputed, reread, blocked on, or run too often.

## 4. Altitude

Check that each change is implemented at the right depth rather than as a
fragile bandaid. Flag special cases layered onto callers when the shared
infrastructure should be generalized, duplicated policy that belongs in a
single boundary, or patches that solve one symptom while leaving the same
mechanism to fail at the next call site. Name the deeper mechanism that should
own the behavior.

Skip any altitude finding whose fix would require broad redesign beyond the
reviewed diff. Prefer a narrowly actionable generalization.

## Finding format guidance

Each finding must be actionable and grounded in a concrete changed line or
small changed range. In the finding details, include:

- the angle (`reuse`, `simplification`, `efficiency`, or `altitude`);
- the concrete cost: what is duplicated, wasted, or harder to maintain;
- the specific cleanup to make.

Use severities this way:

- `warning` for cleanup findings that should be fixed before merging;
- `info` for low-cost polish that is clearly optional;
- avoid `error` unless the cleanup issue is severe enough to block review even
  though it is not a correctness bug.

Keep the review focused. Prefer the best few high-signal cleanup findings over
a long list of style nits. If there are no concrete cleanup opportunities in
the supplied diff, return an empty findings list.
