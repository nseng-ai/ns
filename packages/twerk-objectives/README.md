# twerk-objectives

`twerk-objectives` is an objective management plugin for `twerk`.

It tracks objectives in issues or tickets, with a running log of updates and a
current view of the work.

## Why issues/tickets?

Objectives are contextual to a specific scope of work and are only valid at a
point in time. They are allowed to be noisy: links to incidents, logs,
investigation notes, dead ends, design pivots, and progress updates all belong
there while the work is active.

That makes an issue or ticket system a better home than a repo doc:

- it gives the work a stable shared identity, URL, owner, and status
- it preserves an action log without pretending every note is durable truth
- it makes it easier to close or archive the objective when the work is done
- it keeps temporary coordination context separate from long-lived source of
  truth docs extracted from that work
